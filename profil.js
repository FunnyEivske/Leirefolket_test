// Importer nødvendige funksjoner
import { db, auth, appId, authReady } from './firebase.js';
import { authState, openUniversalCropModal, cropAndCompressUniversal } from './script.js'; // Importer den delte authState og beskjæringsverktøy
import {
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- DATABANESTIER ---
// **OPPDATERT:** Bruk 'users' roten direkte, i tråd med firestore.rules
const usersCollectionPath = `users`;

// --- UI-ELEMENTER ---
const profileForm = document.getElementById('profile-form');
const displayNameInput = document.getElementById('display-name');
const emailInput = document.getElementById('profile-email');
const saveButton = document.getElementById('profile-save-button');
const successMessage = document.getElementById('profile-success');
const errorMessage = document.getElementById('profile-error');

const imagePreview = document.getElementById('profile-image-preview');
const imageUploadInput = document.getElementById('profile-image-upload');
const imageUploadButton = document.getElementById('profile-image-upload-button');
const uploadStatus = document.getElementById('upload-status');

// Initialiser Firebase Storage
const storage = getStorage();

/**
 * Laster inn brukerdata i skjemaet
 */
function loadProfileData() {
    if (!authState.user) {
        // Dette skal i teorien ikke skje pga. sidebeskyttelse
        console.error("Ingen bruker logget inn.");
        return;
    }

    // Bruk data fra authState som allerede er lastet inn av script.js
    // Vi fjerner e-post fra visningsnavn hvis det er standard
    if (authState.profile?.displayName && authState.profile.displayName !== authState.user.email) {
        displayNameInput.value = authState.profile.displayName;
    }
    emailInput.value = authState.user.email || '';

    if (authState.profile?.photoURL) {
        imagePreview.src = authState.profile.photoURL;
    } else {
        imagePreview.src = "https://placehold.co/150x150/f7f5f2/a1a1aa?text=Bilde";
    }
}

/**
 * Håndterer lagring av visningsnavn
 */
async function handleProfileSave(e) {
    e.preventDefault();
    if (!authState.user) {
        errorMessage.textContent = 'Du må være logget inn.';
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Lagrer...';
    errorMessage.textContent = '';
    successMessage.textContent = '';

    const newDisplayName = displayNameInput.value;
    if (!newDisplayName || newDisplayName.trim().length === 0) {
        errorMessage.textContent = 'Visningsnavn kan ikke være tomt.';
        saveButton.disabled = false;
        saveButton.textContent = 'Lagre endringer';
        return;
    }

    const userDocRef = doc(db, usersCollectionPath, authState.user.uid);

    try {
        // Bruk setDoc med merge: true for å oppdatere kun dette feltet
        await setDoc(userDocRef, {
            displayName: newDisplayName
        }, { merge: true });

        // Oppdater også lokal authState for umiddelbar feedback
        if (authState.profile) {
            authState.profile.displayName = newDisplayName;
        } else {
            authState.profile = { displayName: newDisplayName, photoURL: null };
        }

        successMessage.textContent = 'Visningsnavn lagret!';
        setTimeout(() => successMessage.textContent = '', 3000);

    } catch (error) {
        console.error("Error saving display name:", error);
        errorMessage.textContent = 'En feil oppstod ved lagring av navn: ' + error.message;
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Lagre endringer';
    }
}

/**
 * Håndterer valg av nytt profilbilde
 */
function handleImageFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        // Valider filtype og størrelse
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            uploadStatus.textContent = 'Ugyldig filtype (kun JPG/PNG).';
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5 MB
            uploadStatus.textContent = 'Filen er for stor (maks 5MB).';
            return;
        }

        // Åpne beskjærings-modalen (kvadratisk utsnitt for profilbilde)
        openUniversalCropModal(file, 'square', async (offset, state) => {
            uploadStatus.textContent = 'Behandler bilde...';
            
            try {
                // Beskjær og komprimer bildet lokalt før opplasting
                const croppedBase64 = await cropAndCompressUniversal(file, state || offset, {
                    targetWidth: 500,
                    targetHeight: 500,
                    quality: 0.9
                });
                
                // Vis forhåndsvisning av det beskjærte bildet
                imagePreview.src = croppedBase64;
                
                // Start opplasting
                uploadProfileImage(croppedBase64, file.name);
            } catch (error) {
                console.error("Beskjæring feilet:", error);
                uploadStatus.textContent = 'Feil ved bildebehandling.';
            }
        });
    }
}

/**
 * Laster opp bilde til Firebase Storage og lagrer URL i Firestore
 */
async function uploadProfileImage(imageData, originalName) {
    if (!authState.user) {
        uploadStatus.textContent = 'Må være logget inn.';
        return;
    }

    uploadStatus.textContent = 'Laster opp bilde...';
    // Oppretter en unik filsti
    const filePath = `profile-images/${authState.user.uid}/${Date.now()}-${originalName}`;
    const fileRef = ref(storage, filePath);

    try {
        // 1. Last opp filen (håndterer både File-objekt og Base64-streng)
        let snapshot;
        if (typeof imageData === 'string' && imageData.startsWith('data:')) {
            // Konverter Base64 til Blob
            const response = await fetch(imageData);
            const blob = await response.blob();
            snapshot = await uploadBytes(fileRef, blob);
        } else {
            snapshot = await uploadBytes(fileRef, imageData);
        }

        // 2. Få nedlastings-URL
        const downloadURL = await getDownloadURL(snapshot.ref);

        // 3. Lagre URL i brukerens Firestore-dokument
        const userDocRef = doc(db, usersCollectionPath, authState.user.uid);
        await setDoc(userDocRef, {
            photoURL: downloadURL // Endret fra profilePictureURL til photoURL for å matche script.js
        }, { merge: true });

        // 4. Oppdater lokal authState og header-bilde
        if (authState.profile) {
            authState.profile.photoURL = downloadURL;
        }

        const headerImage = document.getElementById('profile-image-header');
        if (headerImage) {
            headerImage.src = downloadURL;
        }

        uploadStatus.textContent = 'Profilbilde oppdatert!';
        setTimeout(() => uploadStatus.textContent = '', 3000);

    } catch (error) {
        console.error("Error uploading image:", error);
        uploadStatus.textContent = 'Feil ved opplasting. Prøv igjen.';
    }
}

// --- INITIALISERING ---
// Vent til auth er klar (fra script.js)
authReady.then(() => {
    // script.js's 'protectProtectedPages' vil håndtere omdirigering
    // hvis brukeren ikke er logget inn.
    if (!authState.user) {
        console.log("Profil.js: Venter på omdirigering fra script.js...");
        return;
    }

    // Alt er ok, last inn data og sett opp lyttere
    loadProfileData();

    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileSave);
    }

    if (imageUploadButton) {
        imageUploadButton.addEventListener('click', (e) => {
            e.preventDefault(); // Forhindre form submit hvis den er inni form
            imageUploadInput.click();
        });
    }

    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', handleImageFileSelect);
    }
});
// Importer nødvendige funksjoner
import { db, auth, appId, authReady } from './firebase.js';
import { authState } from './script.js'; // Importer den delte authState
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
// Vi bruker 'users'-samlingen som script.js nå oppretter
const usersCollectionPath = `/artifacts/${appId}/public/data/users`;

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
    if (authState.displayName && authState.displayName !== authState.user.email) {
        displayNameInput.value = authState.displayName;
    }
    emailInput.value = authState.user.email || '';
    
    if (authState.profilePictureURL) {
        imagePreview.src = authState.profilePictureURL;
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
        authState.displayName = newDisplayName;
        
        successMessage.textContent = 'Visningsnavn lagret!';
        setTimeout(() => successMessage.textContent = '', 3000);

    } catch (error) {
        console.error("Error saving display name:", error);
        errorMessage.textContent = 'En feil oppstod ved lagring av navn.';
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
        // Valider filtype og størrelse (valgfritt, men anbefalt)
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            uploadStatus.textContent = 'Ugyldig filtype (kun JPG/PNG).';
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5 MB
            uploadStatus.textContent = 'Filen er for stor (maks 5MB).';
            return;
        }

        // Vis en forhåndsvisning
        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
        };
        reader.readAsDataURL(file);

        // Start opplasting
        uploadProfileImage(file);
    }
}

/**
 * Laster opp bilde til Firebase Storage og lagrer URL i Firestore
 */
async function uploadProfileImage(file) {
    if (!authState.user) {
        uploadStatus.textContent = 'Må være logget inn.';
        return;
    }

    uploadStatus.textContent = 'Laster opp bilde...';
    // Oppretter en unik filsti
    const filePath = `profile-images/${authState.user.uid}/${Date.now()}-${file.name}`;
    const fileRef = ref(storage, filePath);

    try {
        // 1. Last opp filen
        const snapshot = await uploadBytes(fileRef, file);
        
        // 2. Få nedlastings-URL
        const downloadURL = await getDownloadURL(snapshot.ref);

        // 3. Lagre URL i brukerens Firestore-dokument
        const userDocRef = doc(db, usersCollectionPath, authState.user.uid);
        await setDoc(userDocRef, { 
            profilePictureURL: downloadURL
        }, { merge: true });

        // 4. Oppdater lokal authState og header-bilde
        authState.profilePictureURL = downloadURL;
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
import { app, auth, db, appId, authReady, sendPasswordResetEmail } from './firebase.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL STATE --- //
export let authState = {
    user: null,
    role: null, // 'member', 'admin', eller null
    profile: null // { displayName: '...', photoURL: '...' }
};

let profileUnsubscribe = null;

// Promise som resolver når brukerens rolle og profil er ferdig lastet
let resolveUserReady;
export const userReady = new Promise((resolve) => {
    resolveUserReady = resolve;
});

// --- UI-ELEMENTER ---
// Login side
const loginForm = document.getElementById('login-form');
const forgotPasswordBtn = document.getElementById('forgot-password-btn');
const loginError = document.getElementById('login-error');
const loginSuccess = document.getElementById('login-success');

// Header / Nav
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
const dropdownLogoutButton = document.getElementById('dropdown-logout-button');
const mobileLogoutButton = document.getElementById('mobile-logout-button');

// Navigation Links
const loginLink = document.getElementById('login-link');
const memberLink = document.getElementById('member-link');
const logoutButton = document.getElementById('logout-button');
const mobileLoginLink = document.getElementById('mobile-login-link');
const mobileMemberLink = document.getElementById('mobile-member-link');

// Dashboard / Profil
const profileName = document.getElementById('profile-name');
const profileImg = document.getElementById('profile-img');
const openProfileModal = document.getElementById('open-profile-modal');
const profileModal = document.getElementById('profile-modal');
const profileModalOverlay = document.getElementById('profile-modal-overlay');
const closeProfileModalButton = document.getElementById('close-profile-modal');
const profileForm = document.getElementById('profile-form');
const displayNameInput = document.getElementById('display-name-input');
const profileImageUrlInput = document.getElementById('profile-image-url-input');
const profileImageFileInput = document.getElementById('profile-image-file-input');
const saveProfileButton = document.getElementById('save-profile-button');
const profileSaveStatus = document.getElementById('profile-save-status');

// Admin
const newPostBtn = document.getElementById('new-post-btn');
const newPostContainer = document.getElementById('new-post-container');

// --- HJELPEFUNKSJONER ---

/**
 * Konverterer en fil til en Base64-streng og endrer størrelsen.
 * Dette unngår CORS-problemer med Firebase Storage ved å lagre bildet direkte i Firestore.
 */
function resizeAndConvertToBase64(file, maxWidth = 300) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Beregn ny størrelse
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                // Tegn bildet på canvas
                ctx.drawImage(img, 0, 0, width, height);

                // Konverter til Base64 (JPEG for mindre størrelse)
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

// --- KJERNEFUNKSJONER ---

// **OPPDATERT:** Vi henter nå både rolle og profil fra 'users'-samlingen.
// Dette sparer lesinger og gjør det enklere å administrere.
async function fetchUserData(uid) {
    if (!uid) return null;
    const docPath = getProfileDocPath(uid);
    try {
        const docRef = doc(db, docPath);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error("Error fetching user data:", error);
        return null;
    }
}

// **OPPDATERT:** Returnerer stien til 'users'-samlingen i roten.
function getProfileDocPath(uid) {
    return `users/${uid}`;
}

function setupUserListener(uid) {
    if (!uid) return null;
    const docPath = getProfileDocPath(uid);
    const docRef = doc(db, docPath);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            authState.profile = data;
            authState.role = data.role || 'member'; // Standard rolle er 'member'
        } else {
            // Hvis dokumentet ikke finnes (ny bruker), sett standardverdier
            authState.profile = {
                displayName: authState.user?.email?.split('@')[0] || 'Medlem',
                photoURL: null
            };
            authState.role = 'member';
        }
        updateUI(authState.user, authState.profile);
    }, (error) => {
        console.error("Error in user listener:", error);
    });
    return unsubscribe;
}

async function saveUserProfile(uid, data) {
    if (!uid) throw new Error("Ingen bruker-ID oppgitt.");
    const profileDocPath = getProfileDocPath(uid);
    const docRef = doc(db, profileDocPath);

    // Bruk merge: true for å oppdatere eksisterende felt uten å slette andre
    await setDoc(docRef, data, { merge: true });
}

// --- UI OPPDATERING ---

function updateUI(user, profile) {
    const emailPrefix = user?.email ? user.email.split('@')[0] : 'Medlem';
    const displayName = profile?.displayName || emailPrefix;
    const photoURL = profile?.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=random`;

    // Oppdater profilkort (medlem.html)
    if (profileName) profileName.textContent = displayName;
    if (profileImg) profileImg.src = photoURL;

    // Vis admin-knapper hvis admin
    if (authState.role === 'admin') {
        if (newPostBtn) newPostBtn.classList.remove('hidden');
    } else {
        if (newPostBtn) newPostBtn.classList.add('hidden');
    }

    // Toggle navigation links based on auth state
    if (user) {
        // Logged in
        if (loginLink) loginLink.classList.add('hidden');
        if (memberLink) memberLink.classList.remove('hidden');
        if (logoutButton) logoutButton.classList.remove('hidden');

        if (mobileLoginLink) mobileLoginLink.classList.add('hidden');
        if (mobileMemberLink) mobileMemberLink.classList.remove('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.remove('hidden');
    } else {
        // Logged out
        if (loginLink) loginLink.classList.remove('hidden');
        if (memberLink) memberLink.classList.add('hidden');
        if (logoutButton) logoutButton.classList.add('hidden');

        if (mobileLoginLink) mobileLoginLink.classList.remove('hidden');
        if (mobileMemberLink) mobileMemberLink.classList.add('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.add('hidden');
    }
}

function protectMemberPage() {
    if (window.location.pathname.endsWith('/medlem.html')) {
        if (!authState.user) {
            window.location.href = 'login.html';
        }
    }
}

function protectLoginPage() {
    if (window.location.pathname.endsWith('/login.html')) {
        if (authState.user) {
            window.location.href = 'medlem.html';
        }
    }
}

// --- HANDLERS ---

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (loginError) loginError.textContent = '';
    if (loginSuccess) loginSuccess.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login failed:", error.code);
        if (loginError) {
            if (error.code === 'auth/invalid-credential') {
                loginError.textContent = 'Feil e-post eller passord.';
            } else {
                loginError.textContent = 'En feil oppstod. Prøv igjen.';
            }
        }
    }
}

async function handleForgotPassword() {
    const email = document.getElementById('login-email').value;
    if (!email) {
        if (loginError) loginError.textContent = 'Skriv inn e-postadressen din først.';
        return;
    }

    if (loginError) loginError.textContent = '';
    if (loginSuccess) loginSuccess.textContent = 'Sender e-post...';

    try {
        await sendPasswordResetEmail(auth, email);
        if (loginSuccess) loginSuccess.textContent = 'E-post for tilbakestilling sendt! Sjekk innboksen din.';
    } catch (error) {
        console.error("Forgot password failed:", error);
        if (loginSuccess) loginSuccess.textContent = '';
        if (loginError) loginError.textContent = 'Kunne ikke sende e-post. Sjekk at adressen er riktig.';
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        if (window.location.pathname.endsWith('/medlem.html')) {
            window.location.href = 'index.html'; // Eller login.html
        }
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

async function handleProfileSave(e) {
    e.preventDefault();
    console.log("handleProfileSave called");

    const saveButton = document.getElementById('save-profile-button');
    const originalButtonText = saveButton.textContent;
    saveButton.textContent = 'Lagrer...';
    saveButton.disabled = true;

    const statusMsg = document.getElementById('profile-save-status');
    if (statusMsg) statusMsg.textContent = '';

    const newDisplayName = displayNameInput.value.trim();
    let newPhotoURL = profileImageUrlInput.value.trim();
    const file = profileImageFileInput.files[0];

    console.log("Values to save:", { newDisplayName, newPhotoURL, file });

    try {
        if (!authState.user) throw new Error("Ingen bruker er logget inn.");

        // 1. Behandle bilde (Base64)
        if (file) {
            console.log("Processing file...");
            statusMsg.textContent = 'Behandler bilde...';
            newPhotoURL = await resizeAndConvertToBase64(file);
            console.log("Image converted to Base64");
        }

        // 2. Lagre profilinfo til Firestore
        console.log("Saving to Firestore user:", authState.user.uid);
        statusMsg.textContent = 'Lagrer profil...';

        await saveUserProfile(authState.user.uid, {
            displayName: newDisplayName,
            photoURL: newPhotoURL || null
        });
        console.log("Save successful!");

        if (statusMsg) {
            statusMsg.textContent = 'Profil lagret!';
            statusMsg.style.color = 'var(--color-success)';
        }

        setTimeout(() => {
            closeModal();
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
            if (statusMsg) statusMsg.textContent = '';
            // Reset input
            profileImageFileInput.value = '';
        }, 1500);

    } catch (error) {
        console.error("Feil ved lagring av profil:", error);
        if (statusMsg) {
            statusMsg.textContent = 'Feil: ' + error.message;
            statusMsg.style.color = 'var(--color-error)';
        }
        saveButton.textContent = originalButtonText;
        saveButton.disabled = false;
    }
}

// --- EVENT LISTENERS ---

// Mobilmeny
if (mobileMenuButton) {
    mobileMenuButton.addEventListener('click', () => {
        mobileMenu.classList.toggle('show');
    });
}

// Login
if (loginForm) loginForm.addEventListener('submit', handleLogin);
if (forgotPasswordBtn) forgotPasswordBtn.addEventListener('click', handleForgotPassword);

// Logout
if (dropdownLogoutButton) dropdownLogoutButton.addEventListener('click', handleLogout);
if (mobileLogoutButton) mobileLogoutButton.addEventListener('click', handleLogout);
if (logoutButton) logoutButton.addEventListener('click', handleLogout);

// Profil Modal
if (openProfileModal) {
    openProfileModal.addEventListener('click', () => {
        displayNameInput.value = authState.profile?.displayName || '';
        profileImageUrlInput.value = authState.profile?.photoURL || '';
        profileModal.classList.remove('hidden');
    });
}
function closeModal() { if (profileModal) profileModal.classList.add('hidden'); }
if (closeProfileModalButton) closeProfileModalButton.addEventListener('click', closeModal);
if (profileModalOverlay) profileModalOverlay.addEventListener('click', closeModal);
if (profileForm) profileForm.addEventListener('submit', handleProfileSave);

// Admin: Nytt innlegg toggle
if (newPostBtn) {
    newPostBtn.addEventListener('click', () => {
        if (newPostContainer) newPostContainer.classList.toggle('hidden');
    });
}


// --- INIT ---

authReady.then(async (initialUser) => {
    if (initialUser) {
        const userData = await fetchUserData(initialUser.uid);

        authState.user = initialUser;
        authState.profile = userData || { displayName: null, photoURL: null };
        authState.role = userData?.role || 'member';

        if (profileUnsubscribe) profileUnsubscribe();
        profileUnsubscribe = setupUserListener(initialUser.uid);
    } else {
        authState.user = null;
        authState.role = null;
        authState.profile = null;
    }

    updateUI(authState.user, authState.profile);
    protectMemberPage();
    protectLoginPage();

    // Signaliser at vi er ferdige med init
    resolveUserReady(authState);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userData = await fetchUserData(user.uid);

            authState.user = user;
            authState.profile = userData || { displayName: null, photoURL: null };
            authState.role = userData?.role || 'member';

            if (profileUnsubscribe) profileUnsubscribe();
            profileUnsubscribe = setupUserListener(user.uid);
        } else {
            authState.user = null;
            authState.role = null;
            authState.profile = null;
            if (profileUnsubscribe) profileUnsubscribe();
        }
        updateUI(authState.user, authState.profile);
        protectMemberPage();
        protectLoginPage();
    });
});
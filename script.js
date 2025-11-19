// Importer Firebase-ting og authReady-promiset
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

// **NY:** Promise som resolver når brukerens rolle og profil er ferdig lastet
// Dette brukes av andre script (som feed.js) for å vite at det er trygt å kjøre
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
const saveProfileButton = document.getElementById('save-profile-button');
const profileSaveStatus = document.getElementById('profile-save-status');

// Admin
const newPostBtn = document.getElementById('new-post-btn');
const newPostContainer = document.getElementById('new-post-container');

// --- KJERNEFUNKSJONER ---

async function fetchUserRole(uid) {
    if (!uid) return null;
    const roleDocPath = `/artifacts/${appId}/public/data/userRoles/${uid}`;
    try {
        const docRef = doc(db, roleDocPath);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().role || null;
        } else {
            console.warn(`User role document not found for UID: ${uid}`);
            return null;
        }
    } catch (error) {
        console.error("Error fetching user role:", error);
        return null;
    }
}

async function fetchUserProfile(uid) {
    if (!uid) return null;
    const profileDocPath = `/artifacts/${appId}/users/${uid}/profileData/main`;
    try {
        const docRef = doc(db, profileDocPath);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            const defaultProfile = { displayName: null, photoURL: null };
            await setDoc(docRef, defaultProfile);
            return defaultProfile;
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
}

function setupProfileListener(uid) {
    if (!uid) return null;
    const profileDocPath = `/artifacts/${appId}/users/${uid}/profileData/main`;
    const docRef = doc(db, profileDocPath);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            authState.profile = docSnap.data();
        } else {
            const defaultProfile = {
                displayName: authState.user?.email?.split('@')[0] || 'Medlem',
                photoURL: null
            };
            setDoc(docRef, defaultProfile);
            authState.profile = defaultProfile;
        }
        updateUI(authState.user, authState.profile);
    }, (error) => {
        console.error("Error in profile listener:", error);
    });
    return unsubscribe;
}

async function saveUserProfile(uid, data) {
    if (!uid) throw new Error("Ingen bruker-ID oppgitt.");
    const profileDocPath = `/artifacts/${appId}/users/${uid}/profileData/main`;
    const docRef = doc(db, profileDocPath);
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
}

function protectMemberPage() {
    if (window.location.pathname.endsWith('/medlem.html')) {
        if (!authState.user || !authState.role) {
            window.location.href = 'login.html';
        }
    }
}

function protectLoginPage() {
    if (window.location.pathname.endsWith('/login.html')) {
        if (authState.user && authState.role) {
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
    if (!authState.user) return;

    saveProfileButton.disabled = true;
    profileSaveStatus.textContent = 'Lagrer...';
    profileSaveStatus.style.color = 'var(--color-primary)';

    const newDisplayName = displayNameInput.value.trim();
    const newPhotoURL = profileImageUrlInput.value.trim();

    try {
        await saveUserProfile(authState.user.uid, {
            displayName: newDisplayName,
            photoURL: newPhotoURL || null
        });

        profileSaveStatus.textContent = 'Lagret!';
        profileSaveStatus.style.color = 'var(--color-success)';

        setTimeout(() => {
            if (profileModal) profileModal.classList.add('hidden');
            profileSaveStatus.textContent = '';
        }, 1000);

    } catch (error) {
        console.error("Error saving profile:", error);
        profileSaveStatus.textContent = 'Lagring feilet.';
        profileSaveStatus.style.color = 'var(--color-error)';
    } finally {
        saveProfileButton.disabled = false;
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
        const [role, profileData] = await Promise.all([
            fetchUserRole(initialUser.uid),
            fetchUserProfile(initialUser.uid)
        ]);

        if (role) {
            authState.user = initialUser;
            authState.role = role;
            authState.profile = profileData;
            if (profileUnsubscribe) profileUnsubscribe();
            profileUnsubscribe = setupProfileListener(initialUser.uid);
        } else {
            await handleLogout();
        }
    } else {
        authState.user = null;
        authState.role = null;
        authState.profile = null;
    }

    updateUI(authState.user, authState.profile);
    protectMemberPage();
    protectLoginPage();

    // **NY:** Signaliser at vi er ferdige med init
    resolveUserReady(authState);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const [role, profileData] = await Promise.all([
                fetchUserRole(user.uid),
                fetchUserProfile(user.uid)
            ]);

            if (role) {
                authState.user = user;
                authState.role = role;
                authState.profile = profileData;
                if (profileUnsubscribe) profileUnsubscribe();
                profileUnsubscribe = setupProfileListener(user.uid);
            } else {
                await handleLogout();
            }
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
// Importer Firebase-ting og authReady-promiset
import { app, auth, db, appId, authReady } from './firebase.js';
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

// --- GLOBAL STATE ---
/**
 * Holder den nåværende autentiseringstilstanden.
 * Denne blir oppdatert av onAuthStateChanged.
 */
export let authState = {
    user: null,
    role: null, // 'member', 'admin', eller null
    profile: null // { displayName: '...', photoURL: '...' }
};

/**
 * Holder på unsubscribe-funksjonen for profil-lytteren.
 * Dette lar oss koble fra lytteren når brukeren logger ut.
 */
let profileUnsubscribe = null;


// --- UI-ELEMENTER (Oppdatert til å bruke <a>-lenker) ---
const loginLink = document.getElementById('login-link');
const logoutButton = document.getElementById('logout-button'); // Gammel knapp, skjules nå
const memberLink = document.getElementById('member-link');
const mobileLoginLink = document.getElementById('mobile-login-link');
const mobileLogoutButton = document.getElementById('mobile-logout-button');
const mobileMemberLink = document.getElementById('mobile-member-link');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');

// Nye UI-elementer for profil
const profileButton = document.getElementById('profile-button');
const profileDropdown = document.getElementById('profile-dropdown');
const profileIcon = document.getElementById('profile-icon');
const profileImg = document.getElementById('profile-img');
const dropdownUsername = document.getElementById('dropdown-username');
const openProfileModal = document.getElementById('open-profile-modal');
const mobileOpenProfileModal = document.getElementById('mobile-open-profile-modal');
const dropdownLogoutButton = document.getElementById('dropdown-logout-button');

// Nye UI-elementer for modal
const profileModal = document.getElementById('profile-modal');
const profileModalOverlay = document.getElementById('profile-modal-overlay');
const closeProfileModalButton = document.getElementById('close-profile-modal');
const profileForm = document.getElementById('profile-form');
const displayNameInput = document.getElementById('display-name-input');
const profileImageUrlInput = document.getElementById('profile-image-url-input');
const saveProfileButton = document.getElementById('save-profile-button');
const profileSaveStatus = document.getElementById('profile-save-status');

// --- KJERNEFUNKSJONER ---

/**
 * Henter brukerens rolle fra Firestore.
 * @param {string} uid - Brukerens Firebase Auth UID.
 * @returns {Promise<string|null>} - Returnerer rollen ('admin', 'member') eller null.
 */
async function fetchUserRole(uid) {
    if (!uid) return null;
    
    // Sti til rollen-dokumentet, som beskrevet i planen
    const roleDocPath = `/artifacts/${appId}/public/data/userRoles/${uid}`;
    
    try {
        const docRef = doc(db, roleDocPath);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return data.role || null; // Returnerer rollen, f.eks. 'admin'
        } else {
            console.warn(`User role document not found for UID: ${uid} at path: ${roleDocPath}`);
            return null; // Fant ikke noe rolle-dokument
        }
    } catch (error) {
        console.error("Error fetching user role:", error);
        return null;
    }
}

/**
 * Henter brukerens profil-data fra Firestore.
 * @param {string} uid - Brukerens Firebase Auth UID.
 * @returns {Promise<object|null>} - Returnerer profilobjektet eller null.
 */
async function fetchUserProfile(uid) {
    if (!uid) return null;
    
    // **FIKS:** Bruker den private stien for brukerdata
    const profileDocPath = `/artifacts/${appId}/users/${uid}/profileData/main`;
    
    try {
        const docRef = doc(db, profileDocPath);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data(); // Returnerer { displayName, photoURL }
        } else {
            console.log(`User profile document not found for UID: ${uid}. Creating one.`);
            // Opprett et tomt profil-dokument hvis det ikke finnes
            // Trenger ikke 'authorId' her, da stien i seg selv er sikker
            const defaultProfile = { 
                displayName: null, 
                photoURL: null
            };
            await setDoc(docRef, defaultProfile);
            return defaultProfile;
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
}

/**
 * Setter opp en sanntids-lytter for brukerens profildokument.
 * Oppdaterer authState.profile og UI-en automatisk.
 * @param {string} uid - Brukerens Firebase Auth UID.
 * @returns {Function} - En unsubscribe-funksjon.
 */
function setupProfileListener(uid) {
    if (!uid) return null;
    
    // **FIKS:** Bruker den private stien for brukerdata
    const profileDocPath = `/artifacts/${appId}/users/${uid}/profileData/main`;
    const docRef = doc(db, profileDocPath);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            authState.profile = docSnap.data();
            console.log("Profile listener updated:", authState.profile);
        } else {
            // Dette kan skje hvis dokumentet blir slettet
            console.warn(`Profile for ${uid} missing. Creating default.`);
            // Opprett et standard-dokument
            // Trenger ikke 'authorId'
            const defaultProfile = { 
                displayName: authState.user?.email?.split('@')[0] || 'Medlem', // Bruk e-post-prefix som standard
                photoURL: null
            };
            setDoc(docRef, defaultProfile); // Lagrer det i databasen
            authState.profile = defaultProfile; // Oppdaterer state lokalt med en gang
        }
        // Oppdater UI med den nye profil-informasjonen
        updateUI(authState.user, authState.profile);
        
    }, (error) => {
        console.error("Error in profile listener:", error);
    });

    return unsubscribe; // Returner unsubscribe-funksjonen
}

/**
 * Lagrer endringer i brukerprofilen til Firestore.
 * @param {string} uid - Brukerens Firebase Auth UID.
 * @param {object} data - Objekt med data som skal lagres (f.eks. { displayName, photoURL }).
 */
async function saveUserProfile(uid, data) {
    if (!uid) throw new Error("Ingen bruker-ID oppgitt.");
    
    // **FIKS:** Bruker den private stien for brukerdata
    const profileDocPath = `/artifacts/${appId}/users/${uid}/profileData/main`;
    const docRef = doc(db, profileDocPath);
    
    // Bruk setDoc med merge: true for å oppdatere eller opprette
    // Trenger ikke 'authorId'
    const dataToSave = {
        ...data
    };
    await setDoc(docRef, dataToSave, { merge: true });
}


/**
 * Oppdaterer UI basert på innloggingsstatus og profil.
 * @param {object|null} user - Firebase user-objektet.
 * @param {object|null} profile - Brukerens profil-objekt.
 */
function updateUI(user, profile) {
    // Hent displayName, bruk e-post-prefix som fallback
    const emailPrefix = user?.email ? user.email.split('@')[0] : 'Medlem';
    const displayName = profile?.displayName || emailPrefix;
    const photoURL = profile?.photoURL || null;

    if (user && authState.role) {
        // --- Innlogget ---
        if (loginLink) loginLink.classList.add('hidden');
        if (mobileLoginLink) mobileLoginLink.classList.add('hidden');
        if (logoutButton) logoutButton.classList.add('hidden'); // Skjul gammel knapp

        // Vis nye profil-elementer
        if (profileButton) profileButton.classList.remove('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.remove('hidden'); // Mobil logg-ut
        if (dropdownLogoutButton) dropdownLogoutButton.classList.remove('hidden'); // Desktop logg-ut
        if (memberLink) memberLink.classList.remove('hidden');
        if (mobileMemberLink) mobileMemberLink.classList.remove('hidden');
        if (mobileOpenProfileModal) mobileOpenProfileModal.classList.remove('hidden');

        // Oppdater profilbilde/ikon
        if (profileImg && profileIcon && profileButton) {
            if (photoURL) {
                profileImg.src = photoURL;
                profileImg.classList.remove('hidden');
                profileIcon.classList.add('hidden');
            } else {
                profileImg.classList.add('hidden');
                profileIcon.classList.remove('hidden');
            }
        }
        
        // Oppdater brukernavn i dropdown
        if (dropdownUsername) {
            dropdownUsername.textContent = displayName;
            dropdownUsername.title = displayName; // For lange navn
        }

        // Oppdater velkomstmelding hvis vi er på medlemssiden
        const welcomeMsg = document.getElementById('welcome-message');
        if (welcomeMsg) {
            welcomeMsg.textContent = `Velkommen, ${displayName}! Her ser du siste nytt.`;
        }
        
    } else {
        // --- Utlogget ---
        if (loginLink) loginLink.classList.remove('hidden');
        if (mobileLoginLink) mobileLoginLink.classList.remove('hidden');
        if (logoutButton) logoutButton.classList.add('hidden'); // Skjul gammel knapp

        // Skjul nye profil-elementer
        if (profileButton) profileButton.classList.add('hidden');
        if (profileDropdown) profileDropdown.classList.add('hidden'); // Sørg for at dropdown er lukket
        if (mobileLogoutButton) mobileLogoutButton.classList.add('hidden');
        if (dropdownLogoutButton) dropdownLogoutButton.classList.add('hidden');
        if (memberLink) memberLink.classList.add('hidden');
        if (mobileMemberLink) mobileMemberLink.classList.add('hidden');
        if (mobileOpenProfileModal) mobileOpenProfileModal.classList.add('hidden');
    }
}

/**
 * Beskytter medlemssiden.
 * Kalles etter at auth-status er kjent.
 */
function protectMemberPage() {
    // Sjekk om vi er på medlem.html
    if (window.location.pathname.endsWith('/medlem.html')) {
        if (!authState.user || !authState.role) {
            console.log("Access denied. User not logged in or no role. Redirecting to login.html");
            // Omdiriger til innloggingssiden
            window.location.href = 'login.html';
        }
    }
}

/**
 * Omdirigerer innloggede brukere bort fra innloggingssiden.
 */
function protectLoginPage() {
    if (window.location.pathname.endsWith('/login.html')) {
        if (authState.user && authState.role) {
            console.log("Already logged in. Redirecting to medlem.html");
            window.location.href = 'medlem.html';
        }
    }
}

/**
 * Håndterer innlogging via skjemaet (kun på login.html).
 */
async function handleLogin(e) {
    e.preventDefault();
    // Hent elementer her, siden de kun finnes på login.html
    const loginError = document.getElementById('login-error');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!loginError) return; // Dobbeltsjekk

    loginError.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Innlogging vellykket. onAuthStateChanged vil håndtere resten
        // (rolle-sjekk og redirect via protectLoginPage)
    } catch (error) {
        console.error("Login failed:", error.code);
        if (error.code === 'auth/invalid-credential') {
            loginError.textContent = 'Feil e-post eller passord.';
        } else {
            loginError.textContent = 'En feil oppstod. Prøv igjen.';
        }
    }
}

/**
 * Håndterer utlogging.
 */
async function handleLogout() {
    try {
        await signOut(auth);
        // Utlogging vellykket. onAuthStateChanged vil håndtere resten.
        
        // Hvis vi er på medlemssiden, omdiriger til forsiden
        if (window.location.pathname.endsWith('/medlem.html')) {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

/**
 * Håndterer lagring av profil.
 */
async function handleProfileSave(e) {
    e.preventDefault();
    if (!authState.user) return;

    saveProfileButton.disabled = true;
    profileSaveStatus.textContent = 'Lagrer...';
    profileSaveStatus.classList.remove('text-red-600');
    profileSaveStatus.classList.add('text-green-600');
    
    const newDisplayName = displayNameInput.value.trim();
    const newPhotoURL = profileImageUrlInput.value.trim();

    try {
        await saveUserProfile(authState.user.uid, {
            displayName: newDisplayName,
            photoURL: newPhotoURL || null // Lagre null hvis feltet er tomt
        });
        
        profileSaveStatus.textContent = 'Lagret!';
        
        // Lukk modalen etter en kort stund
        setTimeout(() => {
            if (profileModal) profileModal.classList.add('hidden');
            profileSaveStatus.textContent = '';
        }, 1500);

    } catch (error) {
        console.error("Error saving profile:", error);
        profileSaveStatus.textContent = 'Lagring feilet. Prøv igjen.';
        profileSaveStatus.classList.add('text-red-600');
        profileSaveStatus.classList.remove('text-green-600');
    } finally {
        saveProfileButton.disabled = false;
    }
}

// --- EVENT LISTENERS ---

// Mobilmeny
if (mobileMenuButton) {
    mobileMenuButton.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });
}

// Lukk mobilmeny ved klikk på lenke (for ankerskroll)
if (mobileMenu) {
    mobileMenu.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
        });
    });
}

// --- NYE EVENT LISTENERS FOR PROFIL ---

// Profil-dropdown
if (profileButton) {
    profileButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Hindre at "klikk utenfor" fanger opp dette
        if (profileDropdown) profileDropdown.classList.toggle('hidden');
    });
}

// Lukk dropdown ved klikk på "Logg ut" eller "Endre profil"
if (dropdownLogoutButton) {
    dropdownLogoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (profileDropdown) profileDropdown.classList.add('hidden');
        handleLogout();
    });
}

if (openProfileModal) {
    openProfileModal.addEventListener('click', (e) => {
        e.preventDefault();
        if (profileDropdown) profileDropdown.classList.add('hidden');
        // Fyll modalen med eksisterende data
        displayNameInput.value = authState.profile?.displayName || '';
        profileImageUrlInput.value = authState.profile?.photoURL || '';
        profileSaveStatus.textContent = '';
        if (profileModal) profileModal.classList.remove('hidden');
    });
}

if (mobileOpenProfileModal) {
    mobileOpenProfileModal.addEventListener('click', (e) => {
        e.preventDefault();
        if (mobileMenu) mobileMenu.classList.add('hidden'); // Lukk mobilmeny
        // Fyll modalen med eksisterende data
        displayNameInput.value = authState.profile?.displayName || '';
        profileImageUrlInput.value = authState.profile?.photoURL || '';
        profileSaveStatus.textContent = '';
        if (profileModal) profileModal.classList.remove('hidden');
    });
}

// Lukk modal
function closeModal() {
    if (profileModal) profileModal.classList.add('hidden');
}
if (closeProfileModalButton) closeProfileModalButton.addEventListener('click', closeModal);
if (profileModalOverlay) profileModalOverlay.addEventListener('click', closeModal);

// Lagre profil
if (profileForm) {
    profileForm.addEventListener('submit', handleProfileSave);
}

// Lukk dropdown ved klikk utenfor
window.addEventListener('click', (e) => {
    if (profileDropdown && !profileDropdown.classList.contains('hidden')) {
        // Sjekk om klikket var utenfor både knappen og dropdown-menyen
        if (!profileButton.contains(e.target) && !profileDropdown.contains(e.target)) {
            profileDropdown.classList.add('hidden');
        }
    }
});


// Skjema- og logg-ut-knapper (Ny: Gammel knapp + mobilknapp)
[logoutButton, mobileLogoutButton].forEach(btn => { 
    if (btn) btn.addEventListener('click', handleLogout);
});


// --- HOVED-AUTENTISERINGSLYTTER ---

/**
 * Dette er hjertet i autentiseringen.
 * Den kjører når siden lastes (med authReady) og hver gang
 * inn/utlogging skjer.
 */
authReady.then(async (initialUser) => {
    // Denne kjører én gang på side-last, etter at authReady er løst.
    console.log("Auth ready. Initial user:", initialUser ? initialUser.uid : null);
    
    if (initialUser) {
        // Hent rolle og profil samtidig
        const [role, profileData] = await Promise.all([
            fetchUserRole(initialUser.uid),
            fetchUserProfile(initialUser.uid) // Bruk den enkle fetch-funksjonen her
        ]);
        
        if (role) {
            authState.user = initialUser;
            authState.role = role;
            authState.profile = profileData; // Lagre profil-data
            
            // Start sanntids-lytteren for profil-endringer
            if (profileUnsubscribe) profileUnsubscribe(); // Stopp gammel lytter (hvis den finnes)
            profileUnsubscribe = setupProfileListener(initialUser.uid);

        } else {
            // Gyldig bruker, men mangler rolle. Logg ut.
            console.warn("User has auth but no role. Forcing logout.");
            await handleLogout(); // Dette vil tømme authState
        }
    } else {
        authState.user = null;
        authState.role = null;
        authState.profile = null; // Tøm profil
    }
    
    // Oppdater UI og sjekk side-beskyttelse etter den FØRSTE sjekken
    updateUI(authState.user, authState.profile);
    protectMemberPage();
    protectLoginPage(); // <-- Ny

    // --- SIDE-SPESIFIKK EVENT LISTENER (LOGIN-SKJEMA) ---
    // Koble kun til innloggingsskjemaet hvis vi er på login.html
    if (window.location.pathname.endsWith('/login.html')) {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
    }

    // Start den permanente lytteren for ENDRINGER
    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed. New user:", user ? user.uid : null);
        
        if (user) {
            // Bruker logget nettopp inn (eller er fortsatt logget inn)
            // Hent rolle og profil
            const [role, profileData] = await Promise.all([
                fetchUserRole(user.uid),
                fetchUserProfile(user.uid) // Bruk den enkle fetch-funksjonen her
            ]);

            if (role) {
                // Normal innlogging
                authState.user = user;
                authState.role = role;
                authState.profile = profileData; // Lagre profil
                
                // Start (eller restart) profil-lytteren
                if (profileUnsubscribe) profileUnsubscribe();
                profileUnsubscribe = setupProfileListener(user.uid);

            } else {
                // Bruker logget inn, men har ingen rolle. Logg ut.
                console.warn("User signed in but has no role. Forcing logout.");
                await handleLogout(); // Dette vil tømme authState og kalle onAuthStateChanged på nytt
            }
        } else {
            // Bruker logget ut
            authState.user = null;
            authState.role = null;
            authState.profile = null; // Tøm profil
            
            // Stopp profil-lytteren
            if (profileUnsubscribe) {
                profileUnsubscribe();
                profileUnsubscribe = null;
            }
        }

        // Oppdater UI og sjekk side-beskyttelse HVER GANG
        updateUI(authState.user, authState.profile);
        protectMemberPage();
        protectLoginPage(); // <-- Ny
    });
});
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
    setDoc // <-- NY: Vi trenger setDoc for å opprette brukerprofiler
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL STATE ---
/**
 * Holder den nåværende autentiseringstilstanden.
 * Denne blir oppdatert av onAuthStateChanged.
 */
export let authState = {
    user: null,
    role: null, // 'member', 'admin', eller null
    displayName: null,      // <-- NY
    profilePictureURL: null // <-- NY
};

// --- UI-ELEMENTER ---
const loginLink = document.getElementById('login-link');
const logoutButton = document.getElementById('logout-button');
const memberLink = document.getElementById('member-link');
const mobileLoginLink = document.getElementById('mobile-login-link');
const mobileLogoutButton = document.getElementById('mobile-logout-button');
const mobileMemberLink = document.getElementById('mobile-member-link');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');

// NYE UI-ELEMENTER FOR PROFIL (finnes kun på medlem.html/profil.html)
const profileLink = document.getElementById('profile-link');
const mobileProfileLink = document.getElementById('mobile-profile-link');
const profileImageHeader = document.getElementById('profile-image-header');

// --- KJERNEFUNKSJONER ---

/**
 * Henter brukerens data (rolle, navn, bilde) fra Firestore.
 * Oppretter en brukerprofil hvis den ikke finnes.
 * @param {object} user - Firebase Auth user-objektet.
 * @returns {Promise<object|null>} - Returnerer { role, displayName, ... } eller null.
 */
async function fetchUserData(user) {
    if (!user) return null;
    
    // Sti til roller (gammel)
    const roleDocPath = `/artifacts/${appId}/public/data/userRoles/${user.uid}`;
    // Sti til brukerdata (ny)
    const userDocPath = `/artifacts/${appId}/public/data/users/${user.uid}`;
    
    const roleDocRef = doc(db, roleDocPath);
    const userDocRef = doc(db, userDocPath);

    try {
        const roleSnap = await getDoc(roleDocRef);
        const userSnap = await getDoc(userDocRef);

        if (!roleSnap.exists()) {
            console.warn(`User role document not found for UID: ${user.uid}`);
            return null; // Fant ikke rolle, har ikke tilgang
        }
        
        const userRole = roleSnap.data().role || null;
        if (!userRole) return null; // Ingen rolle satt

        if (userSnap.exists()) {
            // Brukerprofil finnes, returner den
            const userData = userSnap.data();
            // Sørg for at rollen er synkronisert
            if (userData.role !== userRole) {
                await setDoc(userDocRef, { role: userRole }, { merge: true });
                userData.role = userRole;
            }
            return userData;
        } else {
            // Brukerprofil finnes IKKE. Opprett den.
            console.log(`Oppretter ny brukerprofil for ${user.uid}...`);
            const newUserData = {
                uid: user.uid,
                email: user.email,
                role: userRole,
                displayName: user.email, // Standard visningsnavn er e-post
                profilePictureURL: null, // Standard er ingen bilde
                createdAt: new Date() // Kjekt å ha
            };
            await setDoc(userDocRef, newUserData);
            return newUserData;
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
        return null;
    }
}

/**
 * Oppdaterer UI basert på innloggingsstatus og data.
 * @param {object|null} user - Firebase user-objektet.
 * @param {object|null} data - Hele authState-objektet.
 */
function updateUI(user, data) {
    const isLoggedIn = user && data && data.role;

    // Felles logikk for alle sider
    if (loginLink) loginLink.classList.toggle('hidden', isLoggedIn);
    if (mobileLoginLink) mobileLoginLink.classList.toggle('hidden', isLoggedIn);
    
    if (logoutButton) logoutButton.classList.toggle('hidden', !isLoggedIn);
    if (mobileLogoutButton) mobileLogoutButton.classList.toggle('hidden', !isLoggedIn);
    
    if (memberLink) memberLink.classList.toggle('hidden', !isLoggedIn);
    if (mobileMemberLink) mobileMemberLink.classList.toggle('hidden', !isLoggedIn);
    
    // NY: Profil-lenke (finnes kun på medlem.html og profil.html)
    // Vi sjekker om elementet finnes FØR vi prøver å endre det
    if (profileLink) {
        profileLink.classList.toggle('hidden', !isLoggedIn);
    }
    if (mobileProfileLink) {
        mobileProfileLink.classList.toggle('hidden', !isLoggedIn);
    }
    
    if (isLoggedIn) {
        // Oppdater velkomstmelding (kun på medlem.html)
        const welcomeMsg = document.getElementById('welcome-message');
        if (welcomeMsg) {
            const name = data.displayName || user.email;
            welcomeMsg.textContent = `Velkommen, ${name}. Her ser du siste nytt.`;
        }
        
        // Oppdater header-bilde (kun på medlem.html/profil.html)
        if (profileImageHeader) {
            if (data.profilePictureURL) {
                profileImageHeader.src = data.profilePictureURL;
            } else {
                // Fallback hvis de ikke har bilde
                profileImageHeader.src = "https://placehold.co/100x100/f7f5f2/a1a1aa?text=Profil";
            }
        }
    }
}

/**
 * Beskytter medlemssiden OG profilsiden.
 */
function protectProtectedPages() {
    const isProtected = window.location.pathname.endsWith('/medlem.html') || 
                        window.location.pathname.endsWith('/profil.html');
                        
    if (isProtected) {
        if (!authState.user || !authState.role) {
            console.log("Access denied. User not logged in or no role. Redirecting to login.html");
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
    const loginError = document.getElementById('login-error');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!loginError) return;
    loginError.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Vellykket. onAuthStateChanged vil håndtere resten.
    } catch (error) {
        console.error("Login failed:", error.code);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
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
        // Vellykket. onAuthStateChanged vil håndtere resten.
        
        // Omdiriger alltid til forsiden ved utlogging
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

// --- EVENT LISTENERS ---

// Mobilmeny
if (mobileMenuButton) {
    mobileMenuButton.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });
}
if (mobileMenu) {
    mobileMenu.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
        });
    });
}

// Logg-ut-knapper
[logoutButton, mobileLogoutButton].forEach(btn => {
    if (btn) btn.addEventListener('click', handleLogout);
});


// --- HOVED-AUTENTISERINGSLYTTER ---

authReady.then(async (initialUser) => {
    console.log("Auth ready. Initial user:", initialUser ? initialUser.uid : null);
    
    if (initialUser) {
        const data = await fetchUserData(initialUser); // <-- Bruk ny funksjon
        if (data && data.role) {
            authState.user = initialUser;
            authState.role = data.role;
            authState.displayName = data.displayName;
            authState.profilePictureURL = data.profilePictureURL;
        } else {
            console.warn("User has auth but no role/data. Forcing logout.");
            await handleLogout(); 
        }
    } else {
        Object.assign(authState, { user: null, role: null, displayName: null, profilePictureURL: null });
    }
    
    updateUI(authState.user, authState);
    protectProtectedPages();
    protectLoginPage(); 

    // Koble til innloggingsskjemaet (kun på login.html)
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
            // Sjekk om brukeren er den samme
            if (user.uid === authState.user?.uid) {
                 // Oppdaterer kanskje bare data?
                 const data = await fetchUserData(user);
                 if (data) {
                    Object.assign(authState, data, { user });
                 }
            } else {
                // Helt ny innlogging
                const data = await fetchUserData(user);
                if (data && data.role) {
                    Object.assign(authState, data, { user });
                } else {
                    console.warn("User signed in but has no role/data. Forcing logout.");
                    await handleLogout(); 
                }
            }
        } else {
            // Bruker logget ut
            Object.assign(authState, { user: null, role: null, displayName: null, profilePictureURL: null });
        }

        updateUI(authState.user, authState);
        protectProtectedPages();
        protectLoginPage();
    });
});
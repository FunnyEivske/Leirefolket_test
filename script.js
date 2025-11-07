// Importer Firebase-ting og authReady-promiset
import { app, auth, db, appId, authReady } from './firebase.js';
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// NY IMPORT: Importer funksjoner fra feed.js
import { setupFeedListener, setupAdminFeatures } from './feed.js';

// --- GLOBAL STATE ---
/**
 * Holder den nåværende autentiseringstilstanden.
 * Denne blir oppdatert av onAuthStateChanged.
 */
export let authState = {
    user: null,
    role: null // 'member', 'admin', eller null
};

// --- UI-ELEMENTER ---
// Desktop-nav
const loginLink = document.getElementById('login-link');
const logoutButton = document.getElementById('logout-button');
const memberLink = document.getElementById('member-link');
// Mobil-nav
const mobileLoginLink = document.getElementById('mobile-login-link');
const mobileLogoutButton = document.getElementById('mobile-logout-button');
const mobileMemberLink = document.getElementById('mobile-member-link');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');


// --- KJERNEFUNKSJONER (Defineres FØR de brukes) ---

/**
 * Henter brukerens rolle fra Firestore.
 * @param {string} uid - Brukerens Firebase Auth UID.
 * @returns {Promise<string|null>} - Returnerer rollen ('admin', 'member') eller null.
 */
async function fetchUserRole(uid) {
    if (!uid) return null;
    
    // Sti til rollen-dokumentet
    const roleDocPath = `/artifacts/${appId}/public/data/userRoles/${uid}`;
    console.log(`Fetching role from: ${roleDocPath}`); // Debugging
    
    try {
        const docRef = doc(db, roleDocPath);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Fetched role:", data.role); // Debugging
            return data.role || null;
        } else {
            console.warn(`User role document not found for UID: ${uid}`);
            return null;
        }
    } catch (error) {
        console.error("Error fetching user role:", error);
        return null;
    }
}

/**
 * Oppdaterer UI basert på innloggingsstatus og rolle.
 * @param {object|null} user - Firebase user-objektet.
 * @param {string|null} role - Brukerens rolle.
 */
function updateUI(user, role) {
    // Sjekk for desktop-elementer
    if (loginLink) loginLink.classList.toggle('hidden', user && role);
    if (logoutButton) logoutButton.classList.toggle('hidden', !(user && role));
    if (memberLink) memberLink.classList.toggle('hidden', !(user && role));

    // Sjekk for mobil-elementer
    if (mobileLoginLink) mobileLoginLink.classList.toggle('hidden', user && role);
    if (mobileLogoutButton) mobileLogoutButton.classList.toggle('hidden', !(user && role));
    if (mobileMemberLink) mobileMemberLink.classList.toggle('hidden', !(user && role));

    // Oppdater velkomstmelding hvis vi er på medlemssiden
    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) {
        if (user && role) {
            welcomeMsg.textContent = `Velkommen, ${role} (${user.email}). Her ser du siste nytt.`;
        } else {
            welcomeMsg.textContent = 'Logger inn...'; // Eller en annen standardtekst
        }
    }
}


/**
 * Beskytter medlemssiden.
 * Kalles etter at auth-status er kjent.
 */
function protectMemberPage() {
    if (window.location.pathname.endsWith('/medlem.html')) {
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
    e.preventDefault(); // <--- VIKTIGST!
    // Hent elementer her, siden de kun finnes på login.html
    const loginError = document.getElementById('login-error');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!loginError) return; // Dobbeltsjekk

    loginError.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Innlogging vellykket. onAuthStateChanged vil håndtere resten
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
        
        // Hvis vi er på medlemssiden, omdiriger til forsiden
        if (window.location.pathname.endsWith('/medlem.html')) {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

// --- EVENT LISTENERS (Kjører umiddelbart) ---

// Mobilmeny
if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener('click', () => {
        const isHidden = mobileMenu.classList.toggle('hidden');
        mobileMenuButton.setAttribute('aria-expanded', !isHidden);
    });
}

// Lukk mobilmeny ved klikk på lenke
if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            mobileMenuButton.setAttribute('aria-expanded', 'false');
        });
    });
}


// Skjema- og logg-ut-knapper
[logoutButton, mobileLogoutButton].forEach(btn => {
    if (btn) btn.addEventListener('click', handleLogout);
});

// Fest lytter til login-skjema UMIDDELBART
if (window.location.pathname.endsWith('/login.html')) {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log("Login form listener attached.");
    }
}


// --- HOVED-AUTENTISERINGSLYTTER (Kjører når Firebase er klar) ---

authReady.then(initialUser => {
    console.log("Auth ready. Initial user:", initialUser ? initialUser.uid : "null");
    
    // Start den permanente lytteren for ENDRINGER
    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed. New user:", user ? user.uid : "null");
        
        if (user) {
            // Sjekk om dette er en ny innlogging ELLER om vi mangler rolle
            if (!authState.user || authState.user.uid !== user.uid || !authState.role) {
                const role = await fetchUserRole(user.uid);
                if (role) {
                    // Normal innlogging
                    authState.user = user;
                    authState.role = role;
                } else {
                    // Bruker logget inn, men har ingen rolle. Logg ut.
                    console.warn("User signed in but has no role. Forcing logout.");
                    await handleLogout(); // Dette vil tømme authState og kalle onAuthStateChanged på nytt
                }
            }
        } else {
            // Bruker logget ut
            authState.user = null;
            authState.role = null;
        }

        // Oppdater UI og sjekk side-beskyttelse HVER GANG
        updateUI(authState.user, authState.role);
        protectMemberPage();
        protectLoginPage();
        
        // --- NY LOGIKK: START FEED-FUNKSJONER ---
        // Nå som vi VET statusen, kan vi starte feed-funksjonene
        // hvis vi er på riktig side.
        if (window.location.pathname.endsWith('/medlem.html')) {
            if (authState.user && authState.role) {
                console.log("User is authenticated with a role. Starting feed listener.");
                // KUN innloggede brukere med rolle kan se feeden
                setupFeedListener(); 
                
                // KUN admin-brukere kan se admin-funksjoner
                if (authState.role === 'admin') {
                    console.log("User is admin. Setting up admin features.");
                    setupAdminFeatures();
                }
            } else {
                 console.log("User on medlem.html but not authenticated/role-less. Feed not started.");
            }
        }
    });

}).catch(error => {
    // Håndter feil hvis authReady-promiset avvises
    console.error("AuthReady Promise rejected. App might not function correctly.", error);
});
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
// Mobilmeny-kontroller
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
 * Oppdaterer UI basert på innloggingsstatus og rolle.
 * Bruker 'hidden' klassen definert i style.css
 * @param {object|null} user - Firebase user-objektet.
 * @param {string|null} role - Brukerens rolle.
 */
function updateUI(user, role) {
    if (user && role) {
        // Innlogget med gyldig rolle
        if (loginLink) loginLink.classList.add('hidden');
        if (mobileLoginLink) mobileLoginLink.classList.add('hidden');

        if (logoutButton) logoutButton.classList.remove('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.remove('hidden');
        if (memberLink) memberLink.classList.remove('hidden');
        if (mobileMemberLink) mobileMemberLink.classList.remove('hidden');

        // Oppdater velkomstmelding hvis vi er på medlemssiden
        const welcomeMsg = document.getElementById('welcome-message');
        if (welcomeMsg) {
            welcomeMsg.textContent = `Velkommen, ${role} (${user.email}). Her ser du siste nytt.`;
        }
        
    } else {
        // Utlogget eller mangler rolle
        if (loginLink) loginLink.classList.remove('hidden');
        if (mobileLoginLink) mobileLoginLink.classList.remove('hidden');

        if (logoutButton) logoutButton.classList.add('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.add('hidden');
        if (memberLink) memberLink.classList.add('hidden');
        if (mobileMemberLink) mobileMemberLink.classList.add('hidden');
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
        // (rolle-sjekk og redirect via protectLoginPage)
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
        // Utlogging vellykket. onAuthStateChanged vil håndtere resten.
        
        // Hvis vi er på medlemssiden, omdiriger til forsiden
        if (window.location.pathname.endsWith('/medlem.html')) {
            window.location.href = 'index.html';
        }
    } catch (error)
        {
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

// --- NY STruktur: Fest lytter til login-skjema UMIDDELBART ---
// Koble kun til innloggingsskjemaet hvis vi er på login.html
if (window.location.pathname.endsWith('/login.html')) {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log("Login form listener attached.");
    } else {
        console.error("Login form not found!");
    }
}


// --- HOVED-AUTENTISERINGSLYTTER (Kjører når Firebase er klar) ---

/**
 * Dette er hjertet i autentiseringen.
 * Den kjører når siden lastes (med authReady) og hver gang
 * inn/utlogging skjer.
 */
authReady.then(async (initialUser) => {
    // Denne kjører én gang på side-last, etter at authReady er løst.
    console.log("Auth ready. Initial user:", initialUser ? initialUser.uid : null);
    
    if (initialUser) {
        const role = await fetchUserRole(initialUser.uid);
        if (role) {
            authState.user = initialUser;
            authState.role = role;
        } else {
            // Gyldig bruker, men mangler rolle. Logg ut.
            console.warn("User has auth but no role. Forcing logout.");
            await handleLogout(); // Dette vil tømme authState
        }
    } else {
        authState.user = null;
        authState.role = null;
    }
    
    // Oppdater UI og sjekk side-beskyttelse etter den FØRSTE sjekken
    updateUI(authState.user, authState.role);
    protectMemberPage();
    protectLoginPage();

    // --- SIDE-SPESIFIKK EVENT LISTENER (LOGIN-SKJEMA) ---
    // DENNE ER NÅ FLYTTET UT FOR Å KJØRE UMIDDELBART

    // Start den permanente lytteren for ENDRINGER
    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed. New user:", user ? user.uid : null);
        
        if (user) {
            // Bruker logget nettopp inn (eller er fortsatt logget inn)
            // Unngå å hente rolle på nytt hvis vi allerede har den
            if (!authState.user || authState.user.uid !== user.uid) {
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
    });
}).catch(error => {
    // Håndter feil hvis authReady-promiset avvises (f.eks. anonym innlogging feilet)
    console.error("AuthReady Promise rejected. App might not function correctly.", error);
    // Selv om auth feiler, må vi kanskje vise en feilmelding på login-siden
    if (window.location.pathname.endsWith('/login.html')) {
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.textContent = 'Klarte ikke koble til autentisering. Sjekk internett.';
        }
    }
});
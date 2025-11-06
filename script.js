// Importer Firebase-ting og authReady-promiset
import { app, auth, db, authReady } from './firebase.js'; // <-- FJERNET appId-import
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    doc, 
    getDoc,
    setDoc // <-- NY IMPORT: For å kunne skrive til databasen
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- FIKS: Definer appId med riktig global variabel ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- GLOBAL STATE ---
/**
 * Holder den nåværende autentiseringstilstanden.
 * Denne blir oppdatert av onAuthStateChanged.
 */
export let authState = {
    user: null,
    role: null // 'member', 'admin', eller null
};

// --- UI-ELEMENTER (Oppdatert til å bruke <a>-lenker) ---
const loginLink = document.getElementById('login-link');
const logoutButton = document.getElementById('logout-button');
const memberLink = document.getElementById('member-link');
const mobileLoginLink = document.getElementById('mobile-login-link');
const mobileLogoutButton = document.getElementById('mobile-logout-button');
const mobileMemberLink = document.getElementById('mobile-member-link');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
// Fjernet modal-elementer: loginModal, closeModalButton, loginForm, loginError

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
            // Endret: Returnerer null, men logger ikke lenger en advarsel
            // console.warn(`User role document not found for UID: ${uid} at path: ${roleDocPath}`);
            return null; // Fant ikke noe rolle-dokument (dette er OK nå)
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
    e.preventDefault(); // <-- Denne forhindrer at siden laster på nytt med '?'
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

// --- EVENT LISTENERS ---

// Mobilmeny
if (mobileMenuButton) {
    mobileMenuButton.addEventListener('click', () => {
        if (mobileMenu) mobileMenu.classList.toggle('hidden');
    });
}

// Lukk mobilmeny ved klikk på lenke (for ankerskroll)
if (mobileMenu) {
    mobileMenu.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.add('hidden');
        });
    });
}

// Skjema- og logg-ut-knapper
[logoutButton, mobileLogoutButton].forEach(btn => {
    if (btn) btn.addEventListener('click', handleLogout);
});

// --- FIKS: FLYTTET DENNE UT AV AUTHREADY ---
// Koble til innloggingsskjemaet umiddelbart hvis vi er på login.html
// Dette forhindrer en "race condition" der brukeren sender skjemaet
// FØR authReady er fullført.
if (window.location.pathname.endsWith('/login.html')) {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
}


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
        let role = await fetchUserRole(initialUser.uid);
        if (role) {
            // Brukeren har en rolle, fortsett som normalt
            authState.user = initialUser;
            authState.role = role;
        } else {
            // *** NY LOGIKK ***
            // Brukeren finnes ikke, så vi oppretter 'member'-rolle
            console.log(`User ${initialUser.uid} not found in roles. Creating 'member' role.`);
            try {
                const newRoleRef = doc(db, `/artifacts/${appId}/public/data/userRoles/${initialUser.uid}`);
                await setDoc(newRoleRef, { role: 'member' });
                
                // Nå som rollen er opprettet, fortsett som 'member'
                authState.user = initialUser;
                authState.role = 'member';
            } catch (error) {
                console.error("Error creating default member role:", error);
                // Logg ut hvis vi feilet å opprette rollen
                authState.user = null;
                authState.role = null;
                await handleLogout(); // Kaller handleLogout for å rydde opp
            }
        }
    } else {
        // Ingen bruker logget inn
        authState.user = null;
        authState.role = null;
    }
    
    // Oppdater UI og sjekk side-beskyttelse etter den FØRSTE sjekken
    updateUI(authState.user, authState.role);
    protectMemberPage();
    protectLoginPage();

    // Start den permanente lytteren for ENDRINGER
    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed. New user:", user ? user.uid : null);
        
        if (user) {
            // Bruker logget nettopp inn (eller er fortsatt logget inn)
            let role = await fetchUserRole(user.uid);
            if (role) {
                // Normal innlogging, bruker har allerede en rolle
                authState.user = user;
                authState.role = role;
            } else {
                // *** NY LOGIKK ***
                // Brukeren finnes ikke (førstegangs innlogging), opprett 'member'-rolle
                console.log(`User ${user.uid} not found in roles. Creating 'member' role.`);
                try {
                    const newRoleRef = doc(db, `/artifacts/${appId}/public/data/userRoles/${user.uid}`);
                    await setDoc(newRoleRef, { role: 'member' });
                    
                    // Fortsett som 'member'
                    authState.user = user;
                    authState.role = 'member';
                } catch (error) {
                    console.error("Error creating default member role:", error);
                    // Logg ut hvis vi feilet å opprette rollen
                    authState.user = null;
                    authState.role = null;
                    await handleLogout(); // Kaller handleLogout for å rydde opp
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
});
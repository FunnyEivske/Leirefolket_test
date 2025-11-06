// Importer de nødvendige funksjonene fra Firebase SDK-ene
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- STEG 1: BRUK GLOBALE VARIABLER ---
// Disse variablene (f.eks. __firebase_config) blir satt av
// miljøet du kjører koden i (f.eks. Canvas).

// Hent app-ID, med en fallback for testing lokalt
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Hent Firebase-konfigurasjon, med en fallback for testing lokalt
const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config)
    : {
        apiKey: "AIzaSyDA8fQe9akDky_yYDFfNtzGH75-WYq2sF4", // Bruk din egen nøkkel for LOKAL testing
        authDomain: "leirefolket.firebaseapp.com",
        projectId: "leirefolket",
        storageBucket: "leirefolket.firebasestorage.app",
        messagingSenderId: "641158381331",
        appId: "1:641158381331:web:e2a5f893d7d504f2d624e6"
      };

// -------------------------------------------------------------

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Slå på debug-logging for Firestore (valgfritt, men nyttig)
setLogLevel('debug');

/**
 * Oppretter et "promise" som løses når Firebase Auth er initialisert
 * og en bruker er logget inn (enten via token eller anonymt).
 */
const authReady = new Promise((resolve, reject) => {
    // Sjekk om et token er tilgjengelig
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        signInWithCustomToken(auth, __initial_auth_token)
            .then((userCredential) => {
                // Vellykket innlogging med token
                console.log("Auth: Signed in with custom token.");
                resolve(userCredential.user);
            })
            .catch((error) => {
                console.error("Auth: Custom token sign-in failed:", error);
                // Fallback til anonym innlogging ved feil
                signInAnonymously(auth)
                    .then(() => {
                        console.log("Auth: Signed in anonymously after token error.");
                        resolve(auth.currentUser);
                    })
                    .catch(reject); // Avvis hvis anonym også feiler
            });
    } else {
        // Hvis ikke noe token er definert, prøv å logge inn anonymt
        console.log("Auth: No custom token, signing in anonymously.");
        signInAnonymously(auth)
            .then(() => {
                console.log("Auth: Signed in anonymously.");
                resolve(auth.currentUser);
            })
            .catch((error) => {
                console.error("Auth: Anonymous sign-in failed:", error);
                reject(error); // Avvis hvis anonym innlogging feiler
            });
    }
});


// Eksporter de initialiserte Firebase-tjenestene
export { app, auth, db, appId, authReady };
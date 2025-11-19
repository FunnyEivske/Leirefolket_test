// Importer de nødvendige funksjonene fra Firebase SDK-ene
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// **FIKS: Importer signInWithCustomToken, signInAnonymously**
import {
    getAuth,
    onAuthStateChanged,
    signInWithCustomToken,
    signInAnonymously,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- STEG 1: KOBLE TIL DITT EGET FIREBASE-PROSJEKT ---
// Denne er allerede riktig for deg
const firebaseConfig = {
    apiKey: "AIzaSyDA8fQe9akDky_yYDFfNtzGH75-WYq2sF4",
    authDomain: "leirefolket.firebaseapp.com",
    projectId: "leirefolket",
    storageBucket: "leirefolket.firebasestorage.app",
    messagingSenderId: "641158381331",
    appId: "1:641158381331:web:e2a5f893d7d504f2d624e6",
    measurementId: "G-ZZJSRCXYX1"
};
// -------------------------------------------------------------

// **FIKS: Definer appId for bruk i andre skript**
// Denne er PÅKREVD for at database-stiene skal fungere
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Slå på debug-logging for Firestore (valgfritt, men nyttig)
setLogLevel('debug');

/**
 * Oppretter et "promise" som løses når Firebase Auth er initialisert
 * OG brukeren er logget inn med token.
 */
const authReady = new Promise((resolve) => {
    // Lytt etter endringer i auth-status
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Bruker er allerede logget inn (f.eks. med custom token)
            console.log("Auth-lytter: Bruker er logget inn:", user.uid);
            unsubscribe(); // Stopp lytteren, vi er ferdige
            resolve(user); // Send den påloggede brukeren
        } else {
            // Ingen bruker er logget inn, prøv å logge inn med token
            console.log("Auth-lytter: Ingen bruker. Prøver token/anonym innlogging.");
            try {
                if (typeof __initial_auth_token !== 'undefined') {
                    // Prøv å logge inn med gitt token
                    await signInWithCustomToken(auth, __initial_auth_token);
                    // onAuthStateChanged vil kjøre på nytt, og 'if (user)' vil da være sann
                } else {
                    // Ingen token funnet, logg inn anonymt
                    await signInAnonymously(auth);
                    // onAuthStateChanged vil kjøre på nytt
                }
            } catch (error) {
                console.error("Auth innlogging feilet:", error);
                resolve(null); // Løs med null ved feil
            }
        }
    }, (error) => {
        // Håndter feil under initialisering
        console.error("Auth state error on init:", error);
        resolve(null); // Løs med null ved feil
    });
});


// **FIKS: Eksporter appId sammen med resten**
export { app, auth, db, storage, authReady, appId, sendPasswordResetEmail };
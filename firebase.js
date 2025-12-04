// Importer de nødvendige funksjonene fra Firebase SDK-ene
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithCustomToken,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- STEG 1: BRUK GLOBALE VARIABLER ---
// ... (resten av konfigurasjonen din er uendret) ...
// ... (Henter __app_id og __firebase_config) ...

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

// Hent app-ID, med en fallback for testing lokalt. Må defineres ETTER firebaseConfig.
const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId;

// -------------------------------------------------------------

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Slå på debug-logging for Firestore (valgfritt, men nyttig)
setLogLevel('debug');

/**
 * Oppretter et "promise" som løses når Firebase Auth er ferdig sjekket.
 * Nå prøver den IKKE lenger å logge inn anonymt.
 */
const authReady = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Bruker er allerede logget inn
            console.log("Auth-lytter: Bruker er logget inn:", user.uid);
            unsubscribe();
            resolve(user);
        } else {
            // Ingen bruker er logget inn.
            // Sjekk om vi har en spesial-token (brukes kun i forhåndsvisning)
            if (typeof __initial_auth_token !== 'undefined') {
                console.log("Prøver å logge inn med custom token (Preview)...");
                try {
                    await signInWithCustomToken(auth, __initial_auth_token);
                    // onAuthStateChanged vil kjøre på nytt med brukeren
                } catch (error) {
                    console.error("Custom token feilet:", error);
                    unsubscribe();
                    resolve(null);
                }
            } else {
                // Ingen token og ingen bruker -> Vi forblir utlogget.
                console.log("Ingen bruker logget inn. Anonym innlogging er deaktivert.");
                unsubscribe();
                resolve(null);
            }
        }
    }, (error) => {
        console.error("Auth state error on init:", error);
        resolve(null);
    });
});

export { app, auth, db, storage, authReady, appId, sendPasswordResetEmail };
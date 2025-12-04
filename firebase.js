// Importer de nødvendige funksjonene fra Firebase SDK-ene
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// Fjernet signInWithCustomToken og signInAnonymously
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

// Hent app-ID, med en fallback for testing lokalt
const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId;

// -------------------------------------------------------------

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Slå på debug-logging for Firestore (valgfritt, men nyttig)
setLogLevel('debug');

/**
 * Oppretter et "promise" som løses når Firebase Auth er initialisert.
 * Den sjekker den nåværende innloggingsstatusen uten å tvinge en ny innlogging.
 */
const authReady = new Promise((resolve, reject) => {
    // Denne lytteren kjører kun én gang for å sjekke den første statusen
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        // Løs promiset med den første brukerstatusen vi får (kan være 'user' eller 'null')
        unsubscribe(); // Stopp denne éngangs-lytteren
        console.log("Auth: Initial state checked. User is:", user ? user.uid : "null");
        resolve(user); // Send den første brukerstatusen (kan være null)
    }, (error) => {
        // Håndter feil under initialisering
        console.error("Auth: Error during auth state initialization:", error);
        reject(error); // Avvis hvis selve auth-systemet feiler
    });
});


// Eksporter de initialiserte Firebase-tjenestene
export { app, auth, db, appId, authReady };
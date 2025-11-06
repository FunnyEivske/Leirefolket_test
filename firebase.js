// Importer de nødvendige funksjonene fra Firebase SDK-ene
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// Fjernet 'signInAnonymously'
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- STEG 1: KOBLE TIL DITT EGET FIREBASE-PROSJEKT ---
// Gå til Firebase-konsollen -> Project Settings -> General -> "Your apps"
// Finn din web-app og kopier "firebaseConfig"-objektet her.
// ERSTATT HELE 'firebaseConfig'-OBJEKTET UNDER MED DITT EGET:
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

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Hent ut appId for eksport
const appId = firebaseConfig.appId;

// Slå på debug-logging for Firestore (valgfritt, men nyttig)
setLogLevel('debug');

/**
 * Oppretter et "promise" som løses når Firebase Auth er initialisert.
 * Dette sikrer at vi vet brukerens status før vi prøver å laste
 * beskyttet innhold.
 */
const authReady = new Promise((resolve) => {
    // Denne lytteren kjører kun én gang for å sjekke den første statusen
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        // Løs promiset med den første brukerstatusen vi får (kan være 'user' eller 'null')
        unsubscribe(); // Stopp denne éngangs-lytteren
        resolve(user); // Send den første brukerstatusen
    }, (error) => {
        // Håndter feil under initialisering
        console.error("Auth state error on init:", error);
        resolve(null); // Løs med null ved feil
    });
});


// Eksporter de initialiserte Firebase-tjenestene
// FIKS: Lagt til appId i eksporten
export { app, auth, db, authReady, appId };
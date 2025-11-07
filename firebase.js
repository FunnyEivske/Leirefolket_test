// Importer de nødvendige funksjonene fra Firebase SDK-ene
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// Fjernet 'signInAnonymously'
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// NY: Importer Storage
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- STEG 1: KOBLE TIL DITT EGET FIREBASE-PROSJEKT ---
// Gå til Firebase-konsollen -> Project Settings -> General -> "Your apps"
// Finn din web-app og kopier "firebaseConfig"-objektet her.
// ERSTATT HELE 'firebaseConfig'-OBJEKTET UNDER MED DITT EGET:
const firebaseConfig = {
    apiKey: "AIzaSyDA8fQe9akDky_yYDFfNtzGH75-WYq2sF4",
    authDomain: "leirefolket.firebaseapp.com",
    projectId: "leirefolket",
    storageBucket: "leirefolket.appspot.com", // Sjekk at denne er riktig!
    messagingSenderId: "641158381331",
    appId: "1:641158381331:web:e2a5f893d7d504f2d624e6",
    measurementId: "G-ZZJSRCXYX1"
};
// -------------------------------------------------------------
// VIKTIG: Jeg endret 'storageBucket' fra 'leirefolket.firebasestorage.app' 
// til 'leirefolket.appspot.com'. Dobbeltsjekk dette i din Firebase-konsoll.
// Den skal vanligvis slutte på .appspot.com
// -------------------------------------------------------------


// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// NY: Initialiser Storage
const storage = getStorage(app);


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
// OPPDATERT: Eksporter 'storage' også
export { app, auth, db, storage, authReady };

// NY: Eksporter appId for å bygge stier
// (Du hadde denne i feed.js, men la oss hente den fra firebase.js)
export const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
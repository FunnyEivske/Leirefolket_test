// Importer nødvendige funksjoner
import { db, authReady } from './firebase.js'; // <-- FJERNET appId-import
import { authState } from './script.js'; // Importer den delte authState
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    Timestamp,
    query,
    orderBy // Importer orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- FIKS: Definer appId med riktig global variabel ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- UI-ELEMENTER ---
const newPostContainer = document.getElementById('new-post-container');
const newPostForm = document.getElementById('new-post-form');
const postError = document.getElementById('post-error');
const postSubmitButton = document.getElementById('post-submit-button');
const feedContainer = document.getElementById('feed-container');
const feedLoading = document.getElementById('feed-loading');

// Sti til feed-databasen
const feedCollectionPath = `/artifacts/${appId}/public/data/feed`;

// --- FUNKSJONER ---

/**
 * Viser eller skjuler admin-funksjoner (f.eks. "Nytt innlegg"-skjema).
 */
function toggleAdminFeatures() {
    if (authState.role === 'admin') {
        newPostContainer.classList.remove('hidden');
    } else {
        newPostContainer.classList.add('hidden');
    }
}

/**
 * Formaterer et Firestore Timestamp-objekt til en lesbar streng.
 * @param {Timestamp} timestamp - Firestore Timestamp.
 * @returns {string} - Formattert dato (f.eks. "4. november 2025, 19:45")
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Ukjent dato';
    const date = timestamp.toDate();
    return date.toLocaleString('nb-NO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Setter opp en sanntids-lytter for feed-samlingen.
 */
function setupFeedListener() {
    const feedCollectionRef = collection(db, feedCollectionPath);
    // Sorter etter 'createdAt' i synkende rekkefølge (nyeste først)
    const q = query(feedCollectionRef, orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        if (feedLoading) feedLoading.classList.add('hidden');
        feedContainer.innerHTML = ''; // Tøm containeren

        if (snapshot.empty) {
            feedContainer.innerHTML = '<p class="text-stone-600 text-center">Ingen innlegg ennå.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const post = doc.data();
            const postElement = document.createElement('article');
            postElement.className = 'bg-white p-6 rounded-lg shadow-md animate-fade-in';
            
            // Gjør om \n til <br> for HTML-visning
            const contentHtml = post.content.replace(/\n/g, '<br>');

            postElement.innerHTML = `
                <h3 class="text-2xl font-bold text-amber-900 mb-2">${post.title}</h3>
                <p class="text-sm text-stone-500 mb-4">
                    Publisert av <span class="font-semibold">${post.authorName || 'Admin'}</span>
                    den ${formatTimestamp(post.createdAt)}
                </p>
                <div class="text-stone-700 space-y-4">${contentHtml}</div>
            `;
            feedContainer.appendChild(postElement);
        });

    }, (error) => {
        console.error("Error fetching feed:", error);
        if (feedLoading) feedLoading.classList.add('hidden');
        feedContainer.innerHTML = '<p class="text-red-600 text-center">Kunne ikke laste feeden. Sjekk konsollen for feil.</p>';
    });
}

/**
 * Håndterer publisering av nytt innlegg.
 */
async function handlePostSubmit(e) {
    e.preventDefault();
    if (authState.role !== 'admin' || !authState.user) {
        postError.textContent = 'Du har ikke tilgang til å publisere.';
        return;
    }

    postError.textContent = '';
    postSubmitButton.disabled = true;
    postSubmitButton.textContent = 'Publiserer...';

    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;

    try {
        const feedCollectionRef = collection(db, feedCollectionPath);
        await addDoc(feedCollectionRef, {
            title: title,
            content: content,
            authorId: authState.user.uid,
            authorName: authState.user.email, // Lagrer e-post som navn
            createdAt: Timestamp.now()
        });

        // Tøm skjemaet
        newPostForm.reset();

    } catch (error) {
        console.error("Error creating new post:", error);
        postError.textContent = 'En feil oppstod. Kunne ikke publisere.';
    } finally {
        postSubmitButton.disabled = false;
        postSubmitButton.textContent = 'Publiser Innlegg';
    }
}

// --- INITIALISERING ---

// Vi kjører kun feed-logikken hvis vi er på medlem.html
if (document.getElementById('feed-container')) {
    
    // Vent til den første autentiseringen er fullført
    authReady.then(() => {
        console.log("Feed.js: Auth is ready. Current state:", authState);
        
        // Nå kan vi trygt sjekke authState
        if (!authState.user || !authState.role) {
            // Dette burde ikke skje pga. protectMemberPage(), men som en ekstra sjekk
            console.log("Feed.js: User not authenticated. Stopping.");
            return;
        }

        // Vis/skjul admin-ting
        toggleAdminFeatures();
        
        // Sett opp lytter for feeden
        setupFeedListener();

        // Sett opp lytter for publiseringsskjemaet
        if (newPostForm) {
            newPostForm.addEventListener('submit', handlePostSubmit);
        }

    }).catch(error => {
        console.error("Feed.js: Error waiting for authReady:", error);
        feedContainer.innerHTML = '<p class="text-red-600 text-center">En alvorlig feil oppstod under lasting.</p>';
    });

}
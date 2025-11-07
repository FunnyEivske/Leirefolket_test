// Importer nødvendige funksjoner
import { db, appId } from './firebase.js'; // Fjern authReady
// **NY:** Importer userReady (og authState for publisering)
import { authState, userReady } from './script.js'; 
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    Timestamp,
    query,
    orderBy // Importer orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
function toggleAdminFeatures(role) {
    // **NY:** Bruk rollen som sendes inn
    if (role === 'admin') {
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
 * Renser HTML-strenger for å forhindre XSS.
 * Bytter ut < og > med sine HTML-entiteter.
 * @param {string} str - Strengen som skal renses.
 * @returns {string} - Den rensede strengen.
 */
function sanitizeHTML(str) {
    if (!str) return '';
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
            
            // Rens tittel og innhold før det settes inn
            const safeTitle = sanitizeHTML(post.title);
            const safeAuthorName = sanitizeHTML(post.authorName || 'Medlem');
            // Gjør om \n til <br> ETTER rensing
            const safeContentHtml = sanitizeHTML(post.content).replace(/\n/g, '<br>');
            const safePhotoURL = post.authorPhotoURL ? sanitizeHTML(post.authorPhotoURL) : null;

            postElement.innerHTML = `
                <div class="flex items-center space-x-3 mb-4">
                    ${
                        safePhotoURL
                            ? `<img src="${safePhotoURL}" alt="${safeAuthorName}" class="h-10 w-10 rounded-full object-cover bg-stone-200">`
                            : `<span class="flex items-center justify-center h-10 w-10 rounded-full bg-stone-200 text-stone-600">
                                  <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                               </span>`
                    }
                    <div>
                        <p class="font-semibold text-stone-800">${safeAuthorName}</p>
                        <p class="text-sm text-stone-500">${formatTimestamp(post.createdAt)}</p>
                    </div>
                </div>
                <h3 class="text-2xl font-bold text-amber-900 mb-3">${safeTitle}</h3>
                <div class="text-stone-700 space-y-4">${safeContentHtml}</div>
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
    
    // Hent oppdatert profilinfo fra authState
    const authorName = authState.profile?.displayName || (authState.user?.email ? authState.user.email.split('@')[0] : 'Medlem');
    const authorPhotoURL = authState.profile?.photoURL || null;

    try {
        const feedCollectionRef = collection(db, feedCollectionPath);
        await addDoc(feedCollectionRef, {
            title: title,
            content: content,
            authorId: authState.user.uid,
            authorName: authorName, // Lagrer visningsnavn
            authorPhotoURL: authorPhotoURL, // Lagrer profilbilde-URL
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
    
    // **NY:** Vent på at BÅDE auth og rolle er lastet
    userReady.then((currentState) => {
        console.log("Feed.js: User state is ready. Current state:", currentState);
        
        // Nå kan vi trygt sjekke den mottatte state
        if (!currentState.user || !currentState.role) {
            console.log("Feed.js: User not authenticated. Stopping.");
            if (feedLoading) feedLoading.classList.add('hidden');
            feedContainer.innerHTML = '<p class="text-red-600 text-center">Feil: Kunne ikke verifisere brukerstatus.</p>';
            return;
        }

        // Vis/skjul admin-ting
        toggleAdminFeatures(currentState.role); // **NY:** Send rollen inn
        
        // Sett opp lytter for feeden
        setupFeedListener();

        // Sett opp lytter for publiseringsskjemaet
        if (newPostForm) {
            newPostForm.addEventListener('submit', handlePostSubmit);
        }

    }).catch(error => {
        console.error("Feed.js: Error waiting for userReady:", error);
        feedContainer.innerHTML = '<p class="text-red-600 text-center">En alvorlig feil oppstod under lasting.</p>';
    });

}
// Importer nødvendige funksjoner
import { db, appId } from './firebase.js';
import { authState } from './script.js'; // Importer den delte authState
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    Timestamp,
    query,
    orderBy // Importer orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Sti til feed-databasen
const feedCollectionPath = `/artifacts/${appId}/public/data/feed`;

// --- UI-ELEMENTER (Hentes når funksjonene kalles) ---
let newPostContainer, newPostForm, postError, postSubmitButton, feedContainer, feedLoading;

/**
 * Henter og lagrer alle UI-elementene for feed-siden.
 */
function initUIElements() {
    newPostContainer = document.getElementById('new-post-container');
    newPostForm = document.getElementById('new-post-form');
    postError = document.getElementById('post-error');
    postSubmitButton = document.getElementById('post-submit-button');
    feedContainer = document.getElementById('feed-container');
    feedLoading = document.getElementById('feed-loading');
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
 * Håndterer publisering av nytt innlegg.
 */
async function handlePostSubmit(e) {
    e.preventDefault();
    if (authState.role !== 'admin' || !authState.user) {
        if (postError) postError.textContent = 'Du har ikke tilgang til å publisere.';
        return;
    }

    if (postError) postError.textContent = '';
    if (postSubmitButton) {
        postSubmitButton.disabled = true;
        postSubmitButton.textContent = 'Publiserer...';
    }

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
        if (newPostForm) newPostForm.reset();

    } catch (error) {
        console.error("Error creating new post:", error);
        if (postError) postError.textContent = 'En feil oppstod. Kunne ikke publisere.';
    } finally {
        if (postSubmitButton) {
            postSubmitButton.disabled = false;
            postSubmitButton.textContent = 'Publiser Innlegg';
        }
    }
}

// --- EKSPORTERTE FUNKSJONER ---

/**
 * EKSPORTERT: Viser eller skjuler admin-funksjoner.
 * Kalles fra script.js ETTER at rollen er bekreftet.
 */
export function setupAdminFeatures() {
    if (!newPostContainer) initUIElements(); // Sørg for at UI er lastet

    if (authState.role === 'admin') {
        if (newPostContainer) newPostContainer.classList.remove('hidden');
        if (newPostForm) {
            // Sørg for at lytteren kun legges til én gang
            if (!newPostForm.dataset.listenerAttached) {
                newPostForm.addEventListener('submit', handlePostSubmit);
                newPostForm.dataset.listenerAttached = 'true';
            }
        }
    } else {
        if (newPostContainer) newPostContainer.classList.add('hidden');
    }
}

/**
 * EKSPORTERT: Setter opp en sanntids-lytter for feed-samlingen.
 * Kalles fra script.js ETTER at innlogging er bekreftet.
 */
export function setupFeedListener() {
    if (!feedContainer) initUIElements(); // Sørg for at UI er lastet

    const feedCollectionRef = collection(db, feedCollectionPath);
    // Sorter etter 'createdAt' i synkende rekkefølge (nyeste først)
    const q = query(feedCollectionRef, orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        if (feedLoading) feedLoading.classList.add('hidden');
        if (!feedContainer) return; // Sikkerhetssjekk
        
        feedContainer.innerHTML = ''; // Tøm containeren

        if (snapshot.empty) {
            feedContainer.innerHTML = '<p class="feed-empty">Ingen innlegg ennå.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const post = doc.data();
            const postElement = document.createElement('article');
            postElement.className = 'feed-post';
            
            // Gjør om \n til <br> for HTML-visning
            const contentHtml = post.content.replace(/\n/g, '<br>');

            postElement.innerHTML = `
                <h3 class="feed-post-title">${post.title}</h3>
                <p class="feed-post-meta">
                    Publisert av <span class="feed-post-author">${post.authorName || 'Admin'}</span>
                    den ${formatTimestamp(post.createdAt)}
                </p>
                <div class="feed-post-content">${contentHtml}</div>
            `;
            feedContainer.appendChild(postElement);
        });

    }, (error) => {
        console.error("Error fetching feed:", error);
        if (feedLoading) feedLoading.classList.add('hidden');
        if (feedContainer) feedContainer.innerHTML = '<p class="feed-error">Kunne ikke laste feeden. Sjekk konsollen for feil.</p>';
    });
}
// Importer nødvendige funksjoner
import { db, appId } from './firebase.js';
import { authState, userReady } from './script.js';
import {
    collection,
    addDoc,
    onSnapshot,
    Timestamp,
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- UI-ELEMENTER ---
const newPostContainer = document.getElementById('new-post-container');
const newPostForm = document.getElementById('new-post-form');
const postError = document.getElementById('post-error');
const postSubmitButton = document.getElementById('post-submit-button');
const feedContainer = document.getElementById('feed-container');
const feedLoading = document.getElementById('feed-loading');
const loadMoreContainer = document.getElementById('load-more-container');
const loadMoreBtn = document.getElementById('load-more-btn');

let currentLimit = 5;
let feedUnsubscribe = null;

// Sti til feed-databasen
const feedCollectionPath = `/artifacts/${appId}/public/data/feed`;

// --- FUNKSJONER ---

/**
 * Viser eller skjuler admin-funksjoner (f.eks. "Nytt innlegg"-skjema).
 */
function toggleAdminFeatures(role) {
    if (role === 'admin') {
        newPostContainer.classList.remove('hidden');
    } else {
        newPostContainer.classList.add('hidden');
    }
}

/**
 * Formaterer et Firestore Timestamp-objekt til en lesbar streng.
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
 */
function sanitizeHTML(str) {
    if (!str) return '';
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


/**
 * Setter opp en sanntids-lytter for feed-samlingen.
 */
function setupFeedListener(limitCount = 5) {
    if (feedUnsubscribe) feedUnsubscribe(); // Stopp forrige lytter

    const feedCollectionRef = collection(db, feedCollectionPath);
    // Sorter etter 'createdAt' i synkende rekkefølge (nyeste først) og begrens antall
    const q = query(feedCollectionRef, orderBy("createdAt", "desc"), limit(limitCount));

    feedUnsubscribe = onSnapshot(q, (snapshot) => {
        if (feedLoading) feedLoading.classList.add('hidden');
        feedContainer.innerHTML = ''; // Tøm containeren

        // Håndter "Last flere"-knapp synlighet
        // Hvis antall dokumenter er lik limiten, antar vi at det kan finnes flere
        // (Dette er ikke helt nøyaktig hvis totalt antall er nøyaktig delet på 5, men det er "godt nok" for enkel UI)
        if (snapshot.size < limitCount) {
            if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
        } else {
            if (loadMoreContainer) loadMoreContainer.classList.remove('hidden');
        }

        if (snapshot.empty) {
            feedContainer.innerHTML = '<p class="text-center" style="color: var(--color-text-muted);">Ingen innlegg ennå.</p>';
            if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
            return;
        }

        snapshot.forEach(doc => {
            const post = doc.data();
            const postElement = document.createElement('article');

            // ENDRET: Bruker klassen 'feed-item' fra medlem.css i stedet for Tailwind-klasser
            postElement.className = 'feed-item';

            // Rens tittel og innhold før det settes inn
            const safeTitle = sanitizeHTML(post.title);
            const safeAuthorName = sanitizeHTML(post.authorName || 'Medlem');
            const safeContentHtml = sanitizeHTML(post.content).replace(/\n/g, '<br>');
            const safePhotoURL = post.authorPhotoURL ? sanitizeHTML(post.authorPhotoURL) : null;

            // ENDRET: HTML-struktur med inline styles for å fikse bildestørrelse
            postElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    ${safePhotoURL
                    ? `<img src="${safePhotoURL}" alt="${safeAuthorName}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-bg-medium);">`
                    : `<div style="width: 45px; height: 45px; border-radius: 50%; background-color: var(--color-bg-medium); display: flex; align-items: center; justify-content: center; color: var(--color-text-muted);">
                                  <svg style="width: 24px; height: 24px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                               </div>`
                }
                    <div>
                        <p style="font-weight: 600; margin: 0; color: var(--color-secondary);">${safeAuthorName}</p>
                        <p style="font-size: 0.85rem; margin: 0; color: var(--color-text-muted);">${formatTimestamp(post.createdAt)}</p>
                    </div>
                </div>
                <h3>${safeTitle}</h3>
                <div class="feed-item-content">${safeContentHtml}</div>
            `;
            feedContainer.appendChild(postElement);
        });

    }, (error) => {
        console.error("Error fetching feed:", error);
        if (feedLoading) feedLoading.classList.add('hidden');
        feedContainer.innerHTML = '<p style="color: var(--color-error); text-align: center;">Kunne ikke laste feeden. Sjekk konsollen for feil.</p>';
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
    // Prioriter profil-visningsnavn, så e-postprefix, så 'Medlem'
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

if (document.getElementById('feed-container')) {

    userReady.then((currentState) => {
        console.log("Feed.js: User state is ready. Current state:", currentState);

        if (!currentState.user || !currentState.role) {
            console.log("Feed.js: User not authenticated. Stopping.");
            if (feedLoading) feedLoading.classList.add('hidden');
            feedContainer.innerHTML = '<p style="color: var(--color-error); text-align: center;">Feil: Kunne ikke verifisere brukerstatus.</p>';
            return;
        }

        toggleAdminFeatures(currentState.role);
        setupFeedListener(currentLimit);

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                currentLimit += 5;
                setupFeedListener(currentLimit);
            });
        }

        if (newPostForm) {
            newPostForm.addEventListener('submit', handlePostSubmit);
        }

    }).catch(error => {
        console.error("Feed.js: Error waiting for userReady:", error);
        feedContainer.innerHTML = '<p style="color: var(--color-error); text-align: center;">En alvorlig feil oppstod under lasting.</p>';
    });

}
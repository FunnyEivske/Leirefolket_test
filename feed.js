// Importer nødvendige funksjoner
import { db, appId } from './firebase.js';
import { authState, userReady, toggleModal, showCustomAlert, showCustomConfirm } from './script.js';
import {
    collection,
    addDoc,
    onSnapshot,
    Timestamp,
    query,
    orderBy,
    limit,
    doc,
    setDoc,
    deleteDoc,
    getDoc,
    getDocs,
    serverTimestamp
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

// Post Detail Modal Elements
const postDetailModal = document.getElementById('post-detail-modal');
const postDetailModalOverlay = document.getElementById('post-detail-modal-overlay');
const closePostDetailModalBtn = document.getElementById('close-post-detail-modal');
const postDetailContent = document.getElementById('post-detail-content');
const postDetailComments = document.getElementById('post-detail-comments');
const detailCommentInput = document.getElementById('detail-comment-input');
const sendDetailCommentBtn = document.getElementById('send-detail-comment');

let currentLimit = 5;
let feedUnsubscribe = null;

// Sti til feed-databasen
const feedCollectionPath = `/artifacts/${appId}/public/data/feed`;

// --- FUNKSJONER ---

/**
 * Viser eller skjuler admin-funksjoner (f.eks. "Nytt innlegg"-skjema).
 */
function toggleAdminFeatures(role) {
    if (role === 'admin' || role === 'contributor') {
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
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
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

// --- CACHING HJELPEFUNKSJONER ---
function getCachedFeed() {
    try {
        const cached = localStorage.getItem('site_feed');
        return cached ? JSON.parse(cached) : null;
    } catch (e) { return null; }
}

function setCachedFeed(posts) {
    try {
        localStorage.setItem('site_feed', JSON.stringify(posts));
    } catch (e) { }
}

/**
 * Renders feed items to the container.
 */
function renderFeed(posts) {
    if (feedLoading) feedLoading.classList.add('hidden');
    feedContainer.innerHTML = '';

    if (posts.length === 0) {
        feedContainer.innerHTML = '<p class="text-center" style="color: var(--color-text-muted);">Ingen innlegg ennå.</p>';
        return;
    }

    posts.forEach(post => {
        const postElement = document.createElement('article');
        postElement.className = 'feed-item';
        postElement.dataset.id = post.id;

        const safeTitle = sanitizeHTML(post.title);
        const safeAuthorName = sanitizeHTML(post.authorName || 'Medlem');
        const safeContentHtml = sanitizeHTML(post.content).replace(/\n/g, '<br>');
        const safePhotoURL = post.authorPhotoURL ? sanitizeHTML(post.authorPhotoURL) : null;

        const displayDate = post.createdAt?.seconds
            ? formatTimestamp({ toDate: () => new Date(post.createdAt.seconds * 1000) })
            : (post._cachedDate || 'Ukjent dato');

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
                    <p style="font-size: 0.85rem; margin: 0; color: var(--color-text-muted);">${displayDate}</p>
                </div>
                ${authState.role === 'admin' ? `<button class="post-delete-btn" data-id="${post.id}" title="Slett innlegg">🗑️</button>` : ''}
            </div>
            <h3 style="margin-top: 0;">${safeTitle}</h3>
            <div class="feed-item-content">${safeContentHtml}</div>

            <!-- Actions -->
            <div class="post-actions">
                <button class="action-btn like-btn" data-id="${post.id}">
                    <i class="thumbs-up-icon">👍</i>
                    <span class="like-count">0</span>
                </button>
                <button class="action-btn comment-btn" data-id="${post.id}">
                    <span class="comment-count">0</span> kommentarer
                </button>
                <div class="reaction-preview" id="reaction-preview-${post.id}" style="display: flex; align-items: center; gap: -0.5rem; margin-left: auto;">
                    <!-- Faces of 3 people -->
                </div>
            </div>

            <!-- Inline Comments List (Hidden by default) -->
            <div class="inline-comments-container hidden" id="comments-container-${post.id}">
                <!-- Injected via toggleComments -->
            </div>

            <!-- Quick Comment -->
            <div class="quick-comment-wrapper">
                <img src="${authState.profile?.photoURL || 'https://ui-avatars.com/api/?name=' + (authState.profile?.displayName || 'Bruker')}" alt="Meg" class="comment-avatar">
                <div class="comment-input-bar">
                    <input type="text" class="quick-comment-input" data-id="${post.id}" placeholder="Skriv en kommentar...">
                    <button class="show-more-comments" data-id="${post.id}" title="Se kommentarer">
                        <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
        feedContainer.appendChild(postElement);

        // Setup individual listeners for counts/previews
        setupPostStatsListeners(post.id);
    });

    // Event Delegation for buttons
    setupFeedEventListeners();
}

function setupFeedEventListeners() {
    feedContainer.onclick = (e) => {
        const target = e.target;

        // Like Button
        const likeBtn = target.closest('.like-btn');
        if (likeBtn) {
            handleLikePost(likeBtn.dataset.id);
            return;
        }

        // Comment Button or Show More Arrow toggles expansion
        const toggleBtn = target.closest('.comment-btn') || target.closest('.show-more-comments');
        if (toggleBtn) {
            toggleComments(toggleBtn.dataset.id);
            return;
        }

        // Delete Post (Admin)
        const deletePostBtn = target.closest('.post-delete-btn');
        if (deletePostBtn) {
            handleDeletePost(deletePostBtn.dataset.id);
            return;
        }

        // Delete Comment (Admin)
        const deleteCommentBtn = target.closest('.comment-delete-btn');
        if (deleteCommentBtn) {
            handleDeleteComment(deleteCommentBtn.dataset.postid, deleteCommentBtn.dataset.commentid);
            return;
        }
    };

    feedContainer.onkeydown = (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('quick-comment-input')) {
            const input = e.target;
            const text = input.value.trim();
            if (text) {
                handleAddComment(input.dataset.id, text);
                input.value = '';
            }
        }
    };
}

/**
 * Setter opp en sanntids-lytter for feed-samlingen.
 */
function setupFeedListener(limitCount = 5) {
    if (feedUnsubscribe) feedUnsubscribe();

    const feedCollectionRef = collection(db, feedCollectionPath);
    const q = query(feedCollectionRef, orderBy("createdAt", "desc"), limit(limitCount));

    // 1. Vis fra cache først
    const cached = getCachedFeed();
    if (cached && cached.length > 0) {
        console.log("Viser feed fra cache.");
        renderFeed(cached.slice(0, limitCount));
    }

    // 2. Sanntidsoppdatering
    feedUnsubscribe = onSnapshot(q, (snapshot) => {
        const posts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Store a formatted date for the cache since we can't easily stringify Firestore Timestamps
            posts.push({
                id: doc.id,
                ...data,
                _cachedDate: formatTimestamp(data.createdAt)
            });
        });

        // Oppdater cache (kun for standard limit så den ikke vokser uendelig)
        if (limitCount === 5) {
            setCachedFeed(posts);
        }

        // Håndter "Last flere"-knapp
        if (snapshot.size < limitCount) {
            if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
        } else {
            if (loadMoreContainer) loadMoreContainer.classList.remove('hidden');
        }

        renderFeed(posts);

    }, (error) => {
        console.error("Error fetching feed:", error);
        if (feedLoading) feedLoading.classList.add('hidden');
        if (!cached) {
            feedContainer.innerHTML = '<p style="color: var(--color-error); text-align: center;">Kunne ikke laste feeden.</p>';
        }
    });
}

/**
 * Håndterer publisering av nytt innlegg.
 */
async function handlePostSubmit(e) {
    e.preventDefault();
    if ((authState.role !== 'admin' && authState.role !== 'contributor') || !authState.user) {
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
            authorName: authorName,
            authorPhotoURL: authorPhotoURL,
            createdAt: serverTimestamp() // Use serverTimestamp for consistency
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

// --- INLINE COMMENTS LOGIC ---

let activePostListeners = new Set();

function toggleComments(postId) {
    const container = document.getElementById(`comments-container-${postId}`);
    const showMoreBtn = document.querySelector(`.show-more-comments[data-id="${postId}"]`);
    if (!container) return;

    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        if (showMoreBtn) showMoreBtn.classList.add('active');
        loadInlineComments(postId);
    } else {
        container.classList.add('hidden');
        if (showMoreBtn) showMoreBtn.classList.remove('active');
    }
}

function loadInlineComments(postId) {
    if (activePostListeners.has(postId)) return;
    activePostListeners.add(postId);

    const commentsRef = query(collection(db, `${feedCollectionPath}/${postId}/comments`), orderBy('createdAt', 'asc'));
    const container = document.getElementById(`comments-container-${postId}`);

    onSnapshot(commentsRef, (snapshot) => {
        if (!container) return;
        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = '<p class="text-xs text-muted py-2 text-center">Ingen kommentarer ennå.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.innerHTML = `
                <img src="${data.userPhoto || 'https://ui-avatars.com/api/?name=' + data.userName}" alt="${data.userName}" class="comment-avatar" style="width: 1.5rem; height: 1.5rem;">
                <div class="comment-content" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">
                    <span class="comment-author">${sanitizeHTML(data.userName)}</span>
                    <p class="comment-text">${sanitizeHTML(data.content)}</p>
                </div>
                ${authState.role === 'admin' ? `<button class="comment-delete-btn" data-postid="${postId}" data-commentid="${doc.id}" title="Slett kommentar">🗑️</button>` : ''}
            `;
            container.appendChild(div);
        });

        container.scrollTop = container.scrollHeight;
    });
}

// --- INITIALISERING ---

/**
 * Sets up listeners for likes and comments count.
 */
function setupPostStatsListeners(postId) {
    const postEl = document.querySelector(`.feed-item[data-id="${postId}"]`);
    if (!postEl) return;

    // 1. Reactions Listener
    const reactionsRef = collection(db, `${feedCollectionPath}/${postId}/reactions`);
    onSnapshot(reactionsRef, (snapshot) => {
        const likes = snapshot.size;
        const likeCountEl = postEl.querySelector('.like-count');
        if (likeCountEl) likeCountEl.textContent = likes;

        // Check if current user liked it
        const userLiked = snapshot.docs.some(doc => doc.id === authState.user?.uid);
        const likeBtn = postEl.querySelector('.like-btn');
        if (likeBtn) {
            if (userLiked) likeBtn.classList.add('active');
            else likeBtn.classList.remove('active');
        }

        // Reaction Preview (3 faces)
        const previewEl = document.getElementById(`reaction-preview-${postId}`);
        if (previewEl) {
            previewEl.innerHTML = '';
            const reactDocs = snapshot.docs.slice(0, 3);
            reactDocs.forEach((doc, idx) => {
                const data = doc.data();
                const face = document.createElement('img');
                face.src = data.userPhoto || `https://ui-avatars.com/api/?name=${data.userName || 'U'}`;
                face.style.width = '24px';
                face.style.height = '24px';
                face.style.borderRadius = '50%';
                face.style.border = '2px solid var(--color-bg-surface)';
                face.style.marginLeft = idx === 0 ? '0' : '-8px';
                face.title = data.userName || 'Noen';
                previewEl.appendChild(face);
            });
        }
    });

    // 2. Comments Count Listener
    const commentsRef = query(collection(db, `${feedCollectionPath}/${postId}/comments`), orderBy('createdAt', 'desc'));
    onSnapshot(commentsRef, (snapshot) => {
        const count = snapshot.size;
        const countEl = postEl.querySelector('.comment-count');
        if (countEl) countEl.textContent = count;
    });
}

async function handleLikePost(postId) {
    if (!authState.user) return;
    const reactionRef = doc(db, `${feedCollectionPath}/${postId}/reactions`, authState.user.uid);

    try {
        const snap = await getDoc(reactionRef);
        if (snap.exists()) {
            await deleteDoc(reactionRef);
        } else {
            await setDoc(reactionRef, {
                userName: authState.profile?.displayName || 'Medlem',
                userPhoto: authState.profile?.photoURL || null,
                type: 'thumbsup'
            });
        }
    } catch (e) { console.error("Reaction failed:", e); }
}

async function handleAddComment(postId, text) {
    if (!authState.user || !text.trim()) return;

    try {
        await addDoc(collection(db, `${feedCollectionPath}/${postId}/comments`), {
            content: text,
            userId: authState.user.uid,
            userName: authState.profile?.displayName || 'Medlem',
            userPhoto: authState.profile?.photoURL || null,
            createdAt: serverTimestamp()
        });
    } catch (e) { console.error("Comment failed:", e); }
}

async function handleDeletePost(postId) {
    if (authState.role !== 'admin') return;
    const confirmed = await showCustomConfirm("Er du sikker på at du vil slette dette innlegget? Dette kan ikke angres.");
    if (confirmed) {
        try {
            await deleteDoc(doc(db, feedCollectionPath, postId));
            console.log("Post deleted successfully");
        } catch (e) {
            console.error("Error deleting post:", e);
            showCustomAlert("Kunne ikke slette innlegget.");
        }
    }
}

async function handleDeleteComment(postId, commentId) {
    if (authState.role !== 'admin') return;
    const confirmed = await showCustomConfirm("Er du helt sikker på at du vil slette denne kommentaren? Handlingen kan ikke angres.");
    if (confirmed) {
        try {
            await deleteDoc(doc(db, `${feedCollectionPath}/${postId}/comments`, commentId));
            console.log("Comment deleted successfully");
        } catch (e) {
            console.error("Error deleting comment:", e);
            showCustomAlert("Kunne ikke slette kommentaren.");
        }
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
            loadMoreBtn.onclick = () => {
                currentLimit += 5;
                setupFeedListener(currentLimit);
            };
        }

        if (newPostForm) {
            newPostForm.addEventListener('submit', handlePostSubmit);
        }

    }).catch(error => {
        console.error("Feed.js: Error waiting for userReady:", error);
        feedContainer.innerHTML = '<p style="color: var(--color-error); text-align: center;">En alvorlig feil oppstod under lasting.</p>';
    });

}

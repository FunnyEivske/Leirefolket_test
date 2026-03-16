import { db, appId } from './firebase.js';
import { authState, userReady, toggleModal, showCustomAlert, showCustomConfirm, setupImageAdjustment, cropAndCompressUniversal, getSearchableUsers, getAllCachedUsers } from './script.js';
import { TaggingSystem, parseMentionsForDisplay } from './tagging.js';
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
    updateDoc,
    serverTimestamp,
    runTransaction
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

// Post Image Elements
const postImageInput = document.getElementById('post-image-input');
const postImagePreviewContainer = document.getElementById('post-image-preview-container');
const postImagePreview = document.getElementById('post-image-preview');
const removePostImageBtn = document.getElementById('remove-post-image');
const postUploadDropZone = document.getElementById('post-upload-drop-zone');
const postModal = document.getElementById('post-modal');

let currentLimit = 5;
let feedUnsubscribe = null;

// Image Offset State for Posts
let postImageOffset = 0;
let resetPostAdjustment = null;
let editingPostId = null; // Tracks which post is being edited

// Initialisering for Universal Cropping
userReady.then(() => {
    if (postImageInput) {
        postImageInput.addEventListener('cropComplete', (e) => {
            postImageOffset = e.detail.offset;
            console.log("Post crop complete. Offset:", postImageOffset);
        });
    }

    // Initialize tagging system for static inputs
    const postContent = document.getElementById('post-content');
    if (postContent) new TaggingSystem(postContent, getSearchableUsers);
    
    const detailComment = document.getElementById('detail-comment-input');
    if (detailComment) new TaggingSystem(detailComment, getSearchableUsers);
});

// Sti til feed-databasen
const feedCollectionPath = `/artifacts/${appId}/public/data/feed`;

// --- FUNKSJONER ---

/**
 * Viser eller skjuler admin-funksjoner (f.eks. "Nytt innlegg"-skjema).
 */
function toggleAdminFeatures(role) {
    // Buttons are in sidebar, modals are at bottom.
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
        const safeContentHtml = sanitizeHTML(post.content); // Sanitize first
        const parsedContentForDisplay = parseMentionsForDisplay(safeContentHtml, getAllCachedUsers()); // Then parse mentions
        const safePhotoURL = post.authorPhotoURL ? sanitizeHTML(post.authorPhotoURL) : null;
        const postImageUrl = post.imageUrl || null;

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
                ${authState.role === 'admin' ? `
                    <div style="margin-left: auto; display: flex; gap: 0.25rem;">
                        <button class="btn btn-ghost btn-sm post-edit-btn" data-id="${post.id}" title="Rediger innlegg" style="padding: 0.25rem; font-size: 1.1rem; line-height: 1;">✏️</button>
                        <button class="btn btn-ghost btn-sm post-delete-btn" data-id="${post.id}" title="Slett innlegg" style="padding: 0.25rem; font-size: 1.1rem; line-height: 1;">🗑️</button>
                    </div>
                ` : ''}
            </div>
            <h3 style="margin-top: 0;">${safeTitle}</h3>
            <div class="feed-item-content">${parsedContentForDisplay.html}</div>
            ${postImageUrl ? `
                <div class="feed-item-image" style="margin-top: 1rem; border-radius: var(--radius-md); overflow: hidden; cursor: pointer;">
                    <img src="${postImageUrl}" alt="${safeTitle}" style="width: 100%; display: block; object-fit: cover; max-height: 500px;" onclick="window.openLightbox('${postImageUrl}', '${safeTitle}')">
                </div>
            ` : ''}

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
        
        // Setup tagging for the quick comment input
        const quickCommentInput = postElement.querySelector('.quick-comment-input');
        if (quickCommentInput) {
            new TaggingSystem(quickCommentInput, getSearchableUsers);
        }
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

        // Edit Post (Admin)
        const editPostBtn = target.closest('.post-edit-btn');
        if (editPostBtn) {
            handleEditPost(editPostBtn.dataset.id);
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
 * Håndterer redigering av et eksisterende innlegg.
 */
async function handleEditPost(postId) {
    try {
        const postDoc = await getDoc(doc(db, feedCollectionPath, postId));
        if (!postDoc.exists()) {
            showCustomAlert("Innlegget finnes ikke lenger.");
            return;
        }

        const postData = postDoc.data();
        editingPostId = postId;

        // Fyll ut skjemaet
        document.getElementById('post-title').value = postData.title || '';
        document.getElementById('post-content').value = postData.content || '';

        const modalTitle = postModal ? postModal.querySelector('h3') : null;
        if (modalTitle) modalTitle.textContent = 'Rediger innlegg';
        if (postSubmitButton) postSubmitButton.textContent = 'Lagre endringer';

        // Håndter bilde-forhåndsvisning hvis det finnes
        if (postData.imageUrl) {
            if (postImagePreview) postImagePreview.src = postData.imageUrl;
            if (postImagePreviewContainer) postImagePreviewContainer.classList.remove('hidden');
            if (postUploadDropZone) postUploadDropZone.classList.add('hidden');
            postImageOffset = postData.imageOffset || 0;
            if (resetPostAdjustment) resetPostAdjustment(postImageOffset);
        } else {
            if (postImagePreviewContainer) postImagePreviewContainer.classList.add('hidden');
            if (postUploadDropZone) postUploadDropZone.classList.remove('hidden');
            postImageOffset = 0;
        }

        if (postModal) toggleModal(postModal, true);
    } catch (error) {
        console.error("Error fetching post for edit:", error);
        showCustomAlert("Kunne ikke hente innlegget: " + error.message);
    }
}

/**
 * Håndterer publisering av nytt innlegg.
 */
async function handlePostSubmit(e) {
    e.preventDefault();
    if ((authState.role !== 'admin' && authState.role !== 'contributor') || !authState.user) {
        if (postError) postError.textContent = 'Du har ikke tilgang til å publisere.';
        return;
    }

    if (postError) postError.textContent = '';
    const originalBtnText = editingPostId ? 'Lagre endringer' : 'Publiser';
    if (postSubmitButton) {
        postSubmitButton.disabled = true;
        postSubmitButton.textContent = editingPostId ? 'Lagrer endringer...' : 'Publiserer...';
    }

    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    const imageFile = postImageInput ? postImageInput.files[0] : null;

    // Hent oppdatert profilinfo fra authState
    const authorName = authState.profile?.displayName || (authState.user?.email ? authState.user.email.split('@')[0] : 'Medlem');
    const authorPhotoURL = authState.profile?.photoURL || null;

    try {
        let imageUrl = null;
        let imageOffset = postImageOffset;

        // Hvis vi redigerer og ikke har ny fil, behold gammelt bilde
        if (editingPostId && !imageFile) {
            const postDoc = await getDoc(doc(db, feedCollectionPath, editingPostId));
            if (postDoc.exists()) {
                imageUrl = postDoc.data().imageUrl || null;
                imageOffset = postDoc.data().imageOffset || 0;
            }
        }

        if (imageFile) {
            // Bruk universell contextual cropping (offset i %)
            imageUrl = await cropAndCompressUniversal(imageFile, postImageOffset, {
                targetWidth: 1000,
                targetHeight: 500 // 2:1 ratio for posts
            });
            imageOffset = 0; // Resettes hvis bildet er nytt (offset er bakt inn)
        }

        const postData = {
            title: title,
            content: content,
            imageUrl: imageUrl,
            imageOffset: imageOffset,
            updatedAt: serverTimestamp()
        };

        let postId = editingPostId;

        if (editingPostId) {
            await updateDoc(doc(db, feedCollectionPath, editingPostId), postData);
            showCustomAlert("Innlegget ble oppdatert!");
        } else {
            postData.authorId = authState.user.uid;
            postData.authorName = authorName;
            postData.authorPhotoURL = authorPhotoURL;
            postData.createdAt = serverTimestamp();
            postData.likesCount = 0;
            postData.commentsCount = 0;

            const feedCollectionRef = collection(db, feedCollectionPath);
            const newPostRef = await addDoc(feedCollectionRef, postData);
            postId = newPostRef.id;
            showCustomAlert("Innlegget ble publisert!");
        }

        // Notify mentioned users in the post content
        if (postId) {
            await notifyMentionedUsers(content, postId, `${feedCollectionPath}/${postId}`, `${authorName} nevnte deg i et innlegg`);
        }

        // Tøm skjemaet og tilbakestill
        newPostForm.reset();
        if (postImagePreviewContainer) postImagePreviewContainer.classList.add('hidden');
        if (postImagePreview) postImagePreview.src = '';
        if (postUploadDropZone) postUploadDropZone.classList.remove('hidden');
        postImageOffset = 0;
        if (resetPostAdjustment) resetPostAdjustment(0);

        editingPostId = null;
        const modalTitle = postModal ? postModal.querySelector('h3') : null;
        if (modalTitle) modalTitle.textContent = 'Nytt innlegg';

        if (postModal) toggleModal(postModal, false);

    } catch (error) {
        console.error("Error saving post:", error);
        showCustomAlert("Det oppsto en feil: " + error.message);
    } finally {
        if (postSubmitButton) {
            postSubmitButton.disabled = false;
            postSubmitButton.textContent = originalBtnText;
        }
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
            const safeCommentContent = sanitizeHTML(data.content);
            const parsedCommentForDisplay = parseMentionsForDisplay(safeCommentContent, getAllCachedUsers());

            div.innerHTML = `
                <img src="${data.userPhoto || 'https://ui-avatars.com/api/?name=' + data.userName}" alt="${data.userName}" class="comment-avatar" style="width: 1.5rem; height: 1.5rem;">
                <div class="comment-content" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">
                    <span class="comment-author">${sanitizeHTML(data.userName)}</span>
                    <p class="comment-text">${parsedCommentForDisplay.html}</p>
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
        const commentRef = await addDoc(collection(db, `${feedCollectionPath}/${postId}/comments`), {
            content: text,
            userId: authState.user.uid,
            userName: authState.profile?.displayName || 'Medlem',
            userPhoto: authState.profile?.photoURL || null,
            createdAt: serverTimestamp()
        });
        // Notify mentioned users in the comment
        await notifyMentionedUsers(text, postId, `${feedCollectionPath}/${postId}/comments/${commentRef.id}`, `${authState.profile?.displayName || 'Medlem'} nevnte deg i en kommentar`);

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

function setupPostTagging() {
    const postContentInput = document.getElementById('post-content');
    if (postContentInput && !postContentInput.dataset.taggingInitialized) {
        new TaggingSystem(postContentInput, getSearchableUsers);
        postContentInput.dataset.taggingInitialized = 'true'; // Mark as initialized
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
            // Setup tagging for the new post form content field
            setupPostTagging();
        }

        // --- NEW POST IMAGE HANDLING ---
        if (typeof window.setupUploadZone === 'function') {
            window.setupUploadZone('post-image-input', 'post-upload-drop-zone', 'post-image-preview', 'post-image-preview-container');
        }

        // Hide drop zone when preview is shown
        if (postImageInput) {
            postImageInput.addEventListener('change', (e) => {
                if (e.target.files[0] && postUploadDropZone) {
                    postUploadDropZone.classList.add('hidden');
                }
            });
        }

        if (removePostImageBtn) {
            removePostImageBtn.onclick = (e) => {
                e.preventDefault();
                postImageInput.value = '';
                if (postImagePreviewContainer) postImagePreviewContainer.classList.add('hidden');
                if (postImagePreview) postImagePreview.src = '';
                if (postUploadDropZone) postUploadDropZone.classList.remove('hidden');
                postImageOffset = 0;
            };
        }

        if (postImagePreview) {
            postImagePreview.style.cursor = 'pointer';
            postImagePreview.title = 'Klikk for å endre bilde';
            postImagePreview.onclick = () => postImageInput.click();
        }

    }).catch(error => {
        console.error("Feed.js: Error waiting for userReady:", error);
        feedContainer.innerHTML = '<p style="color: var(--color-error); text-align: center;">En alvorlig feil oppstod under lasting.</p>';
    });
}

/**
 * Parses text, finds mentioned uids, and creates notifications in Firestore.
 */
export async function notifyMentionedUsers(text, sourceId, sourcePath, notificationText) {
    const parsed = parseMentionsForDisplay(text, getAllCachedUsers());
    const uids = parsed.uids;
    
    if (!uids || uids.length === 0) return;
    
    try {
        const promises = uids.map(uid => {
            if (uid === authState.uid) return Promise.resolve(); // Ikke varsle deg selv
            
            const notifRef = collection(db, `users/${uid}/notifications`);
            return addDoc(notifRef, {
                type: 'mention',
                sourceId: sourceId,
                sourcePath: sourcePath,
                text: notificationText,
                read: false,
                createdAt: serverTimestamp()
            });
        });
        
        await Promise.all(promises);
    } catch (e) {
        console.error('Feil under sending av varsler for tagging:', e);
    }
}

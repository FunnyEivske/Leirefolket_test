import { app, auth, db, appId, authReady, sendPasswordResetEmail, functions, httpsCallable, firebaseConfig } from './firebase.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    getAuth
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    doc,
    getDoc,
    setDoc,
    addDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    onSnapshot,
    serverTimestamp,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL STATE --- //
export let authState = {
    user: null,
    role: null, // 'member', 'admin', eller null
    profile: null // { displayName: '...', photoURL: '...' }
};

let profileUnsubscribe = null;
let galleryUnsubscribe = null; // Listener for user's own gallery
let sidebarMembersLimit = 5; // Initial limit for sidebar display

// --- DARK MODE LOGIKK (Flyttet til theme-switcher.js) ---

// --- CACHING HJELPEFUNKSJONER ---
function getCachedProfile(uid) {
    const cached = localStorage.getItem(`profile_${uid}`);
    return cached ? JSON.parse(cached) : null;
}

function setCachedProfile(uid, data) {
    if (uid && data) {
        localStorage.setItem(`profile_${uid}`, JSON.stringify(data));
    }
}

function clearCachedProfile(uid) {
    localStorage.removeItem(`profile_${uid}`);
}

// Promise som resolver når brukerens rolle og profil er ferdig lastet
let resolveUserReady;
export const userReady = new Promise((resolve) => {
    resolveUserReady = resolve;
});

// --- UI-ELEMENTER ---
// Login side
const loginForm = document.getElementById('login-form');
const forgotPasswordBtn = document.getElementById('forgot-password-btn');
const loginError = document.getElementById('login-error');
const loginSuccess = document.getElementById('login-success');

// Header / Nav
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
const dropdownLogoutButton = document.getElementById('dropdown-logout-button');
const mobileLogoutButton = document.getElementById('mobile-logout-button');

// Navigation Links
const loginLink = document.getElementById('login-link');
const memberLink = document.getElementById('member-link');
const logoutButton = document.getElementById('logout-button');
const mobileLoginLink = document.getElementById('mobile-login-link');
const mobileMemberLink = document.getElementById('mobile-member-link');

// Dashboard / Profil
const profileName = document.getElementById('profile-name');
const profileRoleText = document.getElementById('profile-role-text');
const profileImg = document.getElementById('profile-img');
const openProfileModal = document.getElementById('open-profile-modal');
const profileModal = document.getElementById('profile-modal');
const profileModalOverlay = document.getElementById('profile-modal-overlay');
const closeProfileModalButton = document.getElementById('close-profile-modal');
const profileForm = document.getElementById('profile-form');
const displayNameInput = document.getElementById('display-name-input');
const profileImageUrlInput = document.getElementById('profile-image-url-input');
const profileImageFileInput = document.getElementById('profile-image-file-input');
const saveProfileButton = document.getElementById('save-profile-button');
const profileSaveStatus = document.getElementById('profile-save-status');
const memberDurationValue = document.getElementById('member-duration-value');
const galleryCountValue = document.getElementById('gallery-count-value');

// Gallery Uploads (Personal)
const uploadGalleryBtn = document.getElementById('upload-gallery-btn');
const uploadModal = document.getElementById('upload-modal');
const uploadModalOverlay = document.getElementById('upload-modal-overlay');
const closeUploadModalBtn = document.getElementById('close-upload-modal');
const uploadForm = document.getElementById('upload-form');
const uploadFilesInput = document.getElementById('upload-files-input');
const uploadDropZone = document.getElementById('upload-drop-zone');
const pendingUploadsContainer = document.getElementById('pending-uploads-container');
const uploadActions = document.getElementById('upload-actions');
const confirmUploadBtn = document.getElementById('confirm-upload-btn');
const modalGalleryContainer = document.getElementById('modal-gallery-container'); // Renamed
const dashboardGalleryPreview = document.getElementById('dashboard-gallery-preview'); // New

// Lightbox
const imageLightbox = document.getElementById('image-lightbox');
const lightboxOverlay = document.getElementById('lightbox-overlay');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxDescription = document.getElementById('lightbox-description');
const closeLightboxBtn = document.getElementById('close-lightbox');

// Sidebar Member List
const sidebarMembersList = document.getElementById('sidebar-members-list');

// Admin
const adminPublishCard = document.getElementById('admin-publish-card');
const publishCardTitle = document.getElementById('publish-card-title');
const newPostBtn = document.getElementById('new-post-btn');
const newEventBtn = document.getElementById('new-event-btn');
const adminPublishSeparator = document.getElementById('admin-publish-separator');
const adminToolsCard = document.getElementById('admin-tools-card');
const adminGalleryBtn = document.getElementById('admin-gallery-btn');
const adminTriggerContainer = document.getElementById('admin-trigger-container');
const openAdminControlBtn = document.getElementById('open-admin-control-btn');
// Stats button is handled locally in the logic block or can be global if needed, 
// but let's keep it cleaned up.

// Publishing Modals
const postModal = document.getElementById('post-modal');
const postModalOverlay = document.getElementById('post-modal-overlay');
const closePostModalBtn = document.getElementById('close-post-modal');
const cancelPostModalBtn = document.getElementById('cancel-post-modal');

const eventModal = document.getElementById('event-modal');
const eventModalOverlay = document.getElementById('event-modal-overlay');
const closeEventModalBtn = document.getElementById('close-event-modal');
const cancelEventModalBtn = document.getElementById('cancel-event-modal');

// const adminPromotedBtn = document.getElementById('admin-promoted-btn'); // REMOVED
const adminImageModal = document.getElementById('admin-image-modal');
const adminImageModalOverlay = document.getElementById('admin-image-modal-overlay');
const closeAdminModalBtn = document.getElementById('close-admin-modal');
const cancelAdminModalBtn = document.getElementById('cancel-admin-modal');
const saveAdminSelectionBtn = document.getElementById('save-admin-selection');
const adminUserList = document.getElementById('admin-user-list');
const adminModalTitle = document.getElementById('admin-modal-title');

// Workshop Status
const adminStatusBtn = document.getElementById('admin-status-btn');
const adminToolsHeader = document.getElementById('admin-tools-header');
const adminToolsContent = document.getElementById('admin-tools-content');
const adminToolsChevron = document.getElementById('admin-tools-chevron');
const adminStatusModal = document.getElementById('admin-status-modal');
const adminStatusModalOverlay = document.getElementById('admin-status-modal-overlay');
const closeStatusModalBtn = document.getElementById('close-status-modal');
const cancelStatusModalBtn = document.getElementById('cancel-status-modal');
const saveStatusBtn = document.getElementById('save-status-btn');
const workshopCustomStatusDisplay = document.getElementById('workshop-custom-status');
const workshopHoursDisplay = document.getElementById('workshop-hours-display');
const customStatusInput = document.getElementById('custom-status-input');
const openingDayInputs = document.querySelectorAll('.opening-day-input');

// Admin User Management
const adminMembersBtn = document.getElementById('admin-members-btn');
const adminUserModal = null; // Removed, now part of members modal
const adminUserModalOverlay = null;
const closeUserModalBtn = null;
const cancelUserModalBtn = null;
const createUserForm = document.getElementById('admin-create-user-form');
const createUserBtn = document.getElementById('create-user-btn');
const userModalTitle = null; // Generic title now in members modal
const editUserIdInput = document.getElementById('edit-user-id');
const userMemberSinceInput = document.getElementById('new-user-member-since');
const userOrganizationRoleInput = document.getElementById('new-user-organization-role');

// Admin Member List
const adminMembersModal = document.getElementById('admin-members-modal');
const adminMembersModalOverlay = document.getElementById('admin-members-modal-overlay');
const closeMembersModalBtn = document.getElementById('close-members-modal');
const closeMembersFooterBtn = document.getElementById('close-members-footer-btn');
const adminMembersList = document.getElementById('admin-members-list');
const tabActiveMembers = document.getElementById('tab-active-members');
const tabPendingDeletions = document.getElementById('tab-pending-deletions');
const tabArchive = document.getElementById('tab-archive');
const tabAddMember = document.getElementById('tab-add-member');
const activeMembersSection = document.getElementById('active-members-section');
const pendingDeletionsSection = document.getElementById('pending-deletions-section');
const archiveSection = document.getElementById('archive-section');
const addMemberSection = document.getElementById('add-member-section');
const adminPendingList = document.getElementById('admin-pending-list');
const adminArchiveList = document.getElementById('admin-archive-list');
const adminSoftDeleteBtn = document.getElementById('admin-soft-delete-btn');

// Admin Control Panel Modal
const adminControlModal = document.getElementById('admin-control-modal');
const adminControlModalOverlay = document.getElementById('admin-control-modal-overlay');
const closeAdminControlModalBtn = document.getElementById('close-admin-control-modal');
const closeAdminControlFooterBtn = document.getElementById('close-admin-control-footer');
const adminPanelGalleryBtn = document.getElementById('admin-panel-gallery-btn');
const adminPanelStatusBtn = document.getElementById('admin-panel-status-btn');
const adminPanelMembersBtn = document.getElementById('admin-panel-members-btn');

// TOS & Privacy
const tosModal = document.getElementById('tos-modal');
const tosCheckbox = document.getElementById('tos-checkbox');
const acceptTosBtn = document.getElementById('accept-tos-btn');
const declineTosBtn = document.getElementById('decline-tos-btn');
const adminMembersMenuBtn = null;
const adminMembersSubmenu = null;

// Secondary Firebase app for user creation
let secondaryApp;
let secondaryAuth;

// Initialiser secondary app bare hvis den ikke finnes
try {
    secondaryApp = initializeApp(firebaseConfig, "Secondary");
} catch (e) {
    // Hvis den allerede finnes, hent den eksisterende
    secondaryApp = getApp("Secondary");
}
secondaryAuth = getAuth(secondaryApp);

// Custom Modals
const messageModal = document.getElementById('message-modal');
const messageModalText = document.getElementById('message-modal-text');
const messageModalClose = document.getElementById('message-modal-close');
const messageModalOverlay = document.getElementById('message-modal-overlay');

const confirmModal = document.getElementById('confirm-modal');
const confirmModalText = document.getElementById('confirm-modal-text');
const confirmModalOk = document.getElementById('confirm-modal-ok');
const confirmModalCancel = document.getElementById('confirm-modal-cancel');
const confirmModalOverlay = document.getElementById('confirm-modal-overlay');

// Documents
const openDocumentsBtn = document.getElementById('open-documents-btn');
const documentsModal = document.getElementById('view-documents-modal');
const documentsModalOverlay = document.getElementById('view-documents-modal-overlay');
const closeDocumentsModalBtn = document.getElementById('close-documents-modal');
const closeDocumentsFooterBtn = document.getElementById('close-documents-footer-btn');
const btnReferater = document.getElementById('btn-referater');
const btnRetningslinjer = document.getElementById('btn-retningslinjer');
const btnVedtekter = document.getElementById('btn-vedtekter');
const documentsModalTitle = document.getElementById('documents-modal-title');
const retningslinjerTabs = document.getElementById('retningslinjer-tabs');
const tabFire = document.getElementById('tab-fire');
const tabGlaze = document.getElementById('tab-glaze');
const tabWorkshop = document.getElementById('tab-workshop');
const documentsListContainer = document.getElementById('documents-list-container');
const adminAddDocBtn = document.getElementById('admin-add-doc-btn');
let currentVedtektData = null; // Store for single-view Vedtekter
let currentVedtektId = null;

const docEntryModal = document.getElementById('doc-entry-modal');
const docEntryModalOverlay = document.getElementById('doc-entry-modal-overlay');
const closeDocEntryModalBtn = document.getElementById('close-doc-entry-modal');
const cancelDocEntryModalBtn = document.getElementById('cancel-doc-entry-modal');
const docEntryForm = document.getElementById('doc-entry-form');
const docEntryIdInput = document.getElementById('doc-entry-id');
const docEntryCategoryInput = document.getElementById('doc-entry-category');
const docEntryNameInput = document.getElementById('doc-entry-name');
const docEntryDateInput = document.getElementById('doc-entry-date');
const docEntryContentInput = document.getElementById('doc-entry-content');
const saveDocEntryBtn = document.getElementById('save-doc-entry-btn');
const deleteDocEntryBtn = document.getElementById('delete-doc-entry-btn');
const docEntryTitle = document.getElementById('doc-entry-title');
const docEntryTypeGroup = document.getElementById('doc-entry-type-group');
const docEntryTypeInput = document.getElementById('doc-entry-type');
const docTypeDisplay = document.getElementById('doc-type-display');
const docEntryNameGroup = document.getElementById('doc-entry-name-group');
const docEntryDateGroup = document.getElementById('doc-entry-date-group');
const docPointsContainer = document.getElementById('doc-points-container');
const addMorePointsBtn = document.getElementById('add-more-points-btn');
const docContentHint = document.getElementById('doc-content-hint');
const docContentLabel = document.getElementById('doc-content-label');
const docQuillEditor = document.getElementById('doc-quill-editor');
const docRichTextHint = document.getElementById('doc-rich-text-hint');

// Initialize Quill
let quill;
if (typeof Quill !== 'undefined' && docQuillEditor) {
    quill = new Quill('#doc-quill-editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['clean']
            ]
        }
    });
}

// --- HJELPEFUNKSJONER ---

export function updateScrollLock() {
    const allModals = document.querySelectorAll('.lightbox, [id$="-modal"]');
    const anyModalOpen = Array.from(allModals).some(m => {
        const style = window.getComputedStyle(m);
        // A modal is considered "open" if it's not hidden via class OR has a visible display
        return !m.classList.contains('hidden') && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const menuOpen = mobileMenu && mobileMenu.classList.contains('show');

    if (anyModalOpen || menuOpen) {
        document.body.classList.add('modal-open');
    } else {
        document.body.classList.remove('modal-open');
    }
}

export function toggleModal(modal, show) {
    if (!modal) return;
    if (show) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
    updateScrollLock();
}
window.toggleModal = toggleModal; // Eksponer for feed.js if needed via window

export function showCustomAlert(message) {
    if (messageModal && messageModalText) {
        messageModalText.textContent = message;
        toggleModal(messageModal, true);
        return new Promise(resolve => {
            const closeHandler = () => {
                toggleModal(messageModal, false);
                messageModalClose.removeEventListener('click', closeHandler);
                messageModalOverlay.removeEventListener('click', closeHandler);
                resolve();
            };
            messageModalClose.addEventListener('click', closeHandler);
            messageModalOverlay.addEventListener('click', closeHandler);
        });
    } else {
        alert(message);
    }
}

export function showCustomConfirm(message) {
    if (confirmModal && confirmModalText) {
        confirmModalText.textContent = message;
        toggleModal(confirmModal, true);
        return new Promise(resolve => {
            const handleOk = () => {
                cleanup();
                resolve(true);
            };
            const handleCancel = () => {
                cleanup();
                resolve(false);
            };
            const cleanup = () => {
                toggleModal(confirmModal, false);
                confirmModalOk.removeEventListener('click', handleOk);
                confirmModalCancel.removeEventListener('click', handleCancel);
                confirmModalOverlay.removeEventListener('click', handleCancel);
            };

            confirmModalOk.addEventListener('click', handleOk);
            confirmModalCancel.addEventListener('click', handleCancel);
            confirmModalOverlay.addEventListener('click', handleCancel);
        });
    } else {
        return Promise.resolve(confirm(message));
    }
}


/**
 * Konverterer en fil til en Base64-streng og endrer størrelsen.
 */
function resizeAndConvertToBase64(file, maxWidth = 800) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Beregn ny størrelse
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                // Tegn bildet på canvas
                ctx.drawImage(img, 0, 0, width, height);

                // Konverter til Base64 (JPEG for mindre størrelse)
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

// --- KJERNEFUNKSJONER ---

async function fetchUserData(uid) {
    if (!uid) return null;
    const docPath = getProfileDocPath(uid);
    try {
        const docRef = doc(db, docPath);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error("Error fetching user data:", error);
        return null;
    }
}

function getProfileDocPath(uid) {
    return `users/${uid}`;
}

function setupUserListener(uid) {
    if (!uid) return null;
    const docPath = getProfileDocPath(uid);
    const docRef = doc(db, docPath);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            authState.profile = data;
            authState.role = data.role || 'member'; // Standard rolle er 'member'
            setCachedProfile(uid, data);
        } else {
            // Hvis dokumentet ikke finnes (ny bruker), sett standardverdier
            authState.profile = {
                displayName: authState.user?.email?.split('@')[0] || 'Medlem',
                photoURL: null,
                memberSince: serverTimestamp() // Setzt startdato for nye brukere
            };
            authState.role = 'member';
            // Opprett dokumentet første gang
            saveUserProfile(uid, authState.profile);
            setCachedProfile(uid, authState.profile);
        }
        updateUI(authState.user, authState.profile);
    }, (error) => {
        console.error("Error in user listener:", error);
    });
    return unsubscribe;
}

// Lytter til brukerens personlige galleri
// Lytter til brukerens personlige galleri
function setupGalleryListener(uid) {
    if (!uid) return null;

    // Vi sorterer ikke i query (enklere uten index) - legg evt. til orderBy om nødvendig
    const galleryParams = `users/${uid}/gallery_images`;
    const galleryRef = collection(db, galleryParams);

    // Tøm containere
    if (modalGalleryContainer) modalGalleryContainer.innerHTML = '<p class="text-sm text-muted">Laster...</p>';
    if (dashboardGalleryPreview) dashboardGalleryPreview.innerHTML = '<p class="text-sm text-muted" style="grid-column: 1/-1;">Henter bilder...</p>';

    const unsubscribe = onSnapshot(galleryRef, (snapshot) => {
        const images = [];
        snapshot.forEach((doc) => {
            images.push({ id: doc.id, ...doc.data() });
        });

        // Sorter lokalt (nyeste først)
        images.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        if (galleryCountValue) galleryCountValue.textContent = images.length;

        // Render to MODAL (Full List + Delete)
        if (modalGalleryContainer) {
            if (images.length === 0) {
                modalGalleryContainer.innerHTML = '<p class="text-sm text-muted">Ingen bilder lastet opp enda.</p>';
            } else {
                modalGalleryContainer.innerHTML = '';
                images.forEach(img => {
                    const div = document.createElement('div');
                    div.className = 'gallery-item';
                    div.style.position = 'relative';

                    const imageEl = document.createElement('img');
                    imageEl.src = img.imageUrl;
                    imageEl.alt = img.description || 'Galleribilde';
                    imageEl.loading = 'lazy';

                    div.appendChild(imageEl);

                    // Lightbox click
                    imageEl.style.cursor = 'pointer';
                    imageEl.onclick = () => openLightbox(img.imageUrl, img.description);

                    // Slett-knapp (kun i modal)
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'gallery-delete-btn';
                    deleteBtn.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    `;
                    deleteBtn.title = 'Slett bilde';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation(); // Hindre klikk på bildet
                        deleteGalleryImage(uid, img.id);
                    };

                    div.appendChild(deleteBtn);
                    modalGalleryContainer.appendChild(div);
                });
            }
        }

        // Render to DASHBOARD (Preview 4 items, No Delete)
        if (dashboardGalleryPreview) {
            if (images.length === 0) {
                dashboardGalleryPreview.innerHTML = '<p class="text-sm text-muted" style="grid-column: 1/-1;">Ingen bilder.</p>';
            } else {
                dashboardGalleryPreview.innerHTML = '';
                // Take only first 4
                const previewImages = images.slice(0, 4);
                previewImages.forEach(img => {
                    const div = document.createElement('div');
                    div.className = 'gallery-item';

                    const imageEl = document.createElement('img');
                    imageEl.src = img.imageUrl;
                    imageEl.alt = img.description || 'Galleribilde';
                    imageEl.style.aspectRatio = "1/1";
                    imageEl.style.objectFit = "cover";

                    div.appendChild(imageEl);
                    dashboardGalleryPreview.appendChild(div);
                });
            }
        }

    }, (error) => {
        console.error("Error fetching gallery:", error);
        if (modalGalleryContainer) modalGalleryContainer.innerHTML = '<p class="text-error">Feil ved henting av bilder.</p>';
    });

    return unsubscribe;
}

async function saveUserProfile(uid, data) {
    if (!uid) throw new Error("Ingen bruker-ID oppgitt.");
    const profileDocPath = getProfileDocPath(uid);
    const docRef = doc(db, profileDocPath);

    // Bruk merge: true for å oppdatere eksisterende felt uten å slette andre
    await setDoc(docRef, data, { merge: true });
}

async function deleteGalleryImage(uid, imageId) {
    const confirmed = await showCustomConfirm('Er du sikker på at du vil slette dette bildet?');
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, `users/${uid}/gallery_images`, imageId));
    } catch (e) {
        console.error("Delete failed:", e);
        showCustomAlert("Kunne ikke slette bilde.");
    }
}

// --- GALLERI OPPLASTING --- 

function openUploadModal() {
    toggleModal(uploadModal, true);
    resetUploadForm();
}

function closeUploadModal() {
    toggleModal(uploadModal, false);
    resetUploadForm();
}

function resetUploadForm() {
    if (uploadForm) uploadForm.reset();
    if (pendingUploadsContainer) {
        pendingUploadsContainer.innerHTML = '';
        pendingUploadsContainer.classList.add('hidden');
    }
    if (uploadActions) uploadActions.classList.add('hidden');
    if (uploadDropZone) uploadDropZone.classList.remove('hidden');
}

// Lightbox
function openLightbox(url, description) {
    if (!imageLightbox || !lightboxImg) return;
    lightboxImg.src = url;
    if (lightboxDescription) {
        lightboxDescription.textContent = description || '';
    }
    toggleModal(imageLightbox, true);
}

function closeLightbox() {
    if (!imageLightbox) return;
    toggleModal(imageLightbox, false);
}

// Handle file selection for multi-upload previews
if (uploadFilesInput) {
    uploadFilesInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        if (pendingUploadsContainer) {
            pendingUploadsContainer.innerHTML = '';
            pendingUploadsContainer.classList.remove('hidden');
        }
        if (uploadActions) uploadActions.classList.remove('hidden');
        if (uploadDropZone) uploadDropZone.classList.add('hidden');

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();

            reader.onload = (event) => {
                const card = document.createElement('div');
                card.className = 'pending-upload-card';
                card.innerHTML = `
                    <img src="${event.target.result}" class="pending-upload-preview" alt="Preview">
                    <div class="pending-upload-info">
                        <textarea class="pending-description" placeholder="Beskrivelse for dette bildet..." rows="2"></textarea>
                    </div>
                `;
                if (pendingUploadsContainer) pendingUploadsContainer.appendChild(card);
            };
            reader.readAsDataURL(file);
        }
    });
}

async function handleGalleryUploadSubmit(e) {
    e.preventDefault();

    const files = uploadFilesInput.files;

    if (!files || files.length === 0) return;

    if (!authState.user) {
        showCustomAlert("Du må være logget inn for å laste opp.");
        return;
    }

    const originalBtnText = confirmUploadBtn.textContent;
    confirmUploadBtn.textContent = 'Laster opp...';
    confirmUploadBtn.disabled = true;

    try {
        const uid = authState.user.uid;
        const galleryRef = collection(db, `users/${uid}/gallery_images`);

        // Finn alle beskrivelses-felter
        const descInputs = pendingUploadsContainer ? pendingUploadsContainer.querySelectorAll('.pending-description') : [];

        // Loop gjennom alle valgte filer
        const allowedTypes = ['image/jpeg', 'image/png'];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const individualDesc = descInputs[i] ? descInputs[i].value.trim() : null;

            if (!allowedTypes.includes(file.type)) {
                console.warn("Skipping file due to type:", file.name, file.type);
                continue; // Hopp over filer som ikke er JPG/PNG
            }

            const base64Image = await resizeAndConvertToBase64(file, 800);

            await addDoc(galleryRef, {
                imageUrl: base64Image,
                description: individualDesc || null,
                createdAt: serverTimestamp(),
                uploadedBy: uid
            });
        }

        showCustomAlert("Bilder lastet opp!");
        closeUploadModal();

    } catch (error) {
        console.error("Upload failed:", error);
        showCustomAlert("Kunne ikke laste opp bilde(r): " + error.message);
    } finally {
        confirmUploadBtn.textContent = originalBtnText;
        confirmUploadBtn.disabled = false;
    }
}


// --- UI OPPDATERING ---

function updateUI(user, profile) {
    const emailPrefix = user?.email ? user.email.split('@')[0] : 'Medlem';
    const displayName = profile?.displayName || emailPrefix;
    const photoURL = profile?.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=random`;

    // Oppdater profilkort (medlem.html)
    if (profileName) profileName.textContent = displayName;
    if (profileImg) profileImg.src = photoURL;
    if (profileRoleText) {
        if (authState.role === 'admin') {
            profileRoleText.textContent = 'Administrator';
        } else if (authState.role === 'sekretær' || authState.role === 'contributor') {
            profileRoleText.textContent = 'Sekretær';
        } else if (authState.role === 'styremedlem') {
            profileRoleText.textContent = 'Styremedlem';
        } else {
            profileRoleText.textContent = 'Medlem';
        }
    }

    // Membership Duration
    if (memberDurationValue) {
        let startDate = null;

        // 1. Prioriter manuelt satt dato i Firestore (memberSince)
        // Håndter både Firestore Timestamp, Date object, og serialisert objekt fra localStorage
        const rawDate = profile?.memberSince || profile?.startDate;
        if (rawDate) {
            if (rawDate.toDate) {
                startDate = rawDate.toDate();
            } else if (rawDate.seconds) { // Serialisert Timestamp fra cache
                startDate = new Date(rawDate.seconds * 1000);
            } else {
                startDate = new Date(rawDate);
            }
        }
        // 2. Fallback til Auth creation time
        else if (user?.metadata?.creationTime) {
            startDate = new Date(user.metadata.creationTime);
        }

        if (startDate && !isNaN(startDate.getTime())) {
            const now = new Date();
            let months = (now.getFullYear() - startDate.getFullYear()) * 12;
            months -= startDate.getMonth();
            months += now.getMonth();

            if (now.getDate() < startDate.getDate()) {
                months--;
            }

            if (months < 0) months = 0;

            if (months < 12) {
                memberDurationValue.textContent = `${months} Mnd`;
            } else {
                const years = Math.floor(months / 12);
                memberDurationValue.textContent = `${years} År`;
            }

            // Sett tooltip med eksakt dato
            const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
            const formattedDate = startDate.toLocaleDateString('no-NO', dateOptions);
            memberDurationValue.title = `Medlem siden: ${formattedDate}`;
            memberDurationValue.style.cursor = 'help';
        } else {
            memberDurationValue.textContent = '0 Mnd';
            memberDurationValue.removeAttribute('title');
        }
    }

    // Populate form inputs if modal is explicitly opened (handled in click listener), 
    // but also helpful to update if open



    // Check for TOS Acceptance
    checkTOSAcceptance(profile);

    // Publisering & okumenter Card
    if (adminPublishCard) {
        // Alltid vis for innloggede (siden den inneholder Dokumenter)
        adminPublishCard.classList.toggle('hidden', !user);

        const canPublish = authState.role === 'admin' || authState.role === 'sekretær' || authState.role === 'contributor';

        // Oppdater tittel basert på rolle
        if (publishCardTitle) {
            publishCardTitle.textContent = canPublish ? 'Publisering & dokumenter' : 'Dokumenter';
        }

        // Vis/skjul knapper basert på tilgang
        if (newPostBtn) newPostBtn.classList.toggle('hidden', !canPublish);
        if (newEventBtn) newEventBtn.classList.toggle('hidden', !canPublish);
        if (adminPublishSeparator) adminPublishSeparator.classList.toggle('hidden', !canPublish);
    }

    // Vis/skjul Administrasjon-knapp i profilkort (KUN for admin)
    if (adminTriggerContainer) {
        adminTriggerContainer.classList.toggle('hidden', authState.role !== 'admin');
    }

    // Admin Documents button visibility (Inside modal)
    if (adminAddDocBtn) adminAddDocBtn.classList.toggle('hidden', authState.role !== 'admin' && authState.role !== 'sekretær' && authState.role !== 'contributor');

    // Toggle navigation links based on auth state
    if (user) {
        // Logged in
        if (loginLink) loginLink.classList.add('hidden');
        if (memberLink) memberLink.classList.remove('hidden');
        if (logoutButton) logoutButton.classList.remove('hidden');

        if (mobileLoginLink) mobileLoginLink.classList.add('hidden');
        if (mobileMemberLink) mobileMemberLink.classList.remove('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.remove('hidden');
    } else {
        // Logged out
        if (loginLink) loginLink.classList.remove('hidden');
        if (memberLink) memberLink.classList.add('hidden');
        if (logoutButton) logoutButton.classList.add('hidden');

        if (mobileLoginLink) mobileLoginLink.classList.remove('hidden');
        if (mobileMemberLink) mobileMemberLink.classList.add('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.add('hidden');
    }
}

function protectMemberPage() {
    if (window.location.pathname.endsWith('/medlem.html')) {
        if (!authState.user) {
            window.location.href = 'login.html';
        }
    }
}

function protectLoginPage() {
    if (window.location.pathname.endsWith('/login.html')) {
        // Rediger bare hvis de er logget inn OG har godkjent vilkårene
        if (authState.user && authState.profile?.termsAccepted) {
            window.location.href = 'medlem.html';
        }
    }
}

// --- HANDLERS ---

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    console.log("Logger inn forsøk med e-post:", email);

    const loginBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = loginBtn.textContent;

    if (loginError) loginError.textContent = '';
    if (loginSuccess) loginSuccess.textContent = '';

    loginBtn.textContent = 'Logger inn...';
    loginBtn.disabled = true;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Sjekk status i Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.status === 'pending_deletion') {
                await signOut(auth);
                if (loginError) loginError.textContent = "Din konto er i ferd med å slettes. Kontakt administrator for gjenoppretting innen 30 dager.";
                loginBtn.textContent = originalText;
                loginBtn.disabled = false;
                return;
            }
        }


    } catch (error) {
        console.error("Login failed error code:", error.code);
        if (loginError) {
            if (error.code === 'auth/invalid-credential') {
                loginError.textContent = 'Feil e-post eller passord.';
            } else if (error.code === 'auth/user-disabled') {
                loginError.textContent = 'Denne kontoen er deaktivert. Kontakt administrator.';
            } else if (error.code === 'auth/too-many-requests') {
                loginError.textContent = 'For mange forsøk. Tilgangen er midlertidig sperret. Vent litt og prøv igjen, eller be om nytt passord.';
            } else if (error.code === 'auth/network-request-failed') {
                loginError.textContent = 'Nettverksfeil. Sjekk internettforbindelsen din.';
            } else {
                loginError.textContent = 'En feil oppstod (' + error.code + '). Prøv igjen.';
            }
        }
    } finally {
        if (loginBtn) {
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    }
}

async function handleForgotPassword() {
    const email = document.getElementById('login-email').value;
    if (!email) {
        if (loginError) loginError.textContent = 'Skriv inn e-postadressen din først.';
        return;
    }

    if (loginError) loginError.textContent = '';
    if (loginSuccess) loginSuccess.textContent = 'Sender e-post...';

    try {
        await sendPasswordResetEmail(auth, email);
        if (loginSuccess) loginSuccess.textContent = 'E-post for tilbakestilling sendt! Sjekk innboksen din.';
    } catch (error) {
        console.error("Forgot password failed:", error);
        if (loginSuccess) loginSuccess.textContent = '';
        if (loginError) loginError.textContent = 'Kunne ikke sende e-post. Sjekk at adressen er riktig.';
    }
}

async function handleLogout() {
    try {
        if (authState.user) {
            clearCachedProfile(authState.user.uid);
        }
        await signOut(auth);
        if (window.location.pathname.endsWith('/medlem.html')) {
            window.location.href = 'index.html'; // Eller login.html
        }
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

async function handleProfileSave(e) {
    e.preventDefault();
    console.log("handleProfileSave called");

    const saveButton = document.getElementById('save-profile-button');
    const originalButtonText = saveButton.textContent;
    saveButton.textContent = 'Lagrer...';
    saveButton.disabled = true;

    const statusMsg = document.getElementById('profile-save-status');
    if (statusMsg) statusMsg.textContent = '';

    const newDisplayName = displayNameInput.value.trim();
    let newPhotoURL = profileImageUrlInput.value.trim();
    const file = profileImageFileInput.files[0];

    console.log("Values to save:", { newDisplayName, newPhotoURL, file });

    try {
        if (!authState.user) throw new Error("Ingen bruker er logget inn.");

        // 1. Behandle bilde (Base64)
        if (file) {
            const allowedTypes = ['image/jpeg', 'image/png'];
            if (!allowedTypes.includes(file.type)) {
                throw new Error("Kun JPG og PNG-filer er tillatt.");
            }
            console.log("Processing file...");
            statusMsg.textContent = 'Behandler bilde...';
            newPhotoURL = await resizeAndConvertToBase64(file);
            console.log("Image converted to Base64");
        }

        // 2. Lagre profilinfo til Firestore
        console.log("Saving to Firestore user:", authState.user.uid);
        statusMsg.textContent = 'Lagrer profil...';

        await saveUserProfile(authState.user.uid, {
            displayName: newDisplayName,
            photoURL: newPhotoURL || null
        });
        console.log("Save successful!");

        if (statusMsg) {
            statusMsg.textContent = 'Profil lagret!';
            statusMsg.style.color = 'var(--color-success)';
        }

        setTimeout(() => {
            closeModal();
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
            if (statusMsg) statusMsg.textContent = '';
            // Reset input
            profileImageFileInput.value = '';
        }, 1500);

    } catch (error) {
        console.error("Feil ved lagring av profil:", error);
        if (statusMsg) {
            statusMsg.textContent = 'Feil: ' + error.message;
            statusMsg.style.color = 'var(--color-error)';
        }
        saveButton.textContent = originalButtonText;
        saveButton.disabled = false;
    }
}

async function loadSidebarMembersList() {
    if (!sidebarMembersList) return;

    try {
        const usersSnapshot = await getDocs(query(
            collection(db, 'users'),
            orderBy('displayName', 'asc')
        ));

        sidebarMembersList.innerHTML = '';

        const allMembers = usersSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(userData => userData.status !== 'pending_deletion');

        // Sort by role priority, then by name
        const rolePriority = {
            'styremedlem - leder': 1,
            'styremedlem - økonomiansvarlig': 2,
            'styremedlem - sekretær': 3,
            'styremedlem': 4,
            'medlem': 5,
            'it administrator': 10,
            'it administartor': 10
        };

        allMembers.sort((a, b) => {
            const priorityA = rolePriority[a.organizationRole?.toLowerCase()] || 5;
            const priorityB = rolePriority[b.organizationRole?.toLowerCase()] || 5;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        const visibleMembers = allMembers.slice(0, sidebarMembersLimit);

        visibleMembers.forEach(userData => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '0.5rem';
            div.style.padding = '0.25rem 0.5rem';
            div.style.borderRadius = 'var(--radius-sm)';

            const img = document.createElement('img');
            img.src = userData.photoURL || `https://ui-avatars.com/api/?name=${userData.displayName || 'M'}&background=random`;
            img.style.width = '24px';
            img.style.height = '24px';
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';

            const info = document.createElement('div');
            let dateStr = 'Nylig';
            const rawDate = userData.memberSince || userData.startDate || userData.createdAt;
            if (rawDate) {
                const date = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
                if (!isNaN(date.getTime())) {
                    dateStr = date.toLocaleDateString('no-NO');
                }
            }


            let orgRoleStr = userData.organizationRole || 'Medlem';
            orgRoleStr = orgRoleStr.charAt(0).toUpperCase() + orgRoleStr.slice(1);

            info.innerHTML = `
                <p style="margin: 0; font-size: 0.85rem; font-weight: 600; line-height: 1.2;">${userData.displayName || 'Ukjent'}</p>
                <p style="margin: 0; font-size: 0.75rem; color: var(--color-text-muted);">medlem fra: ${dateStr}</p>
                <p style="margin: 0; font-size: 0.70rem; color: var(--color-primary); font-weight: 500;">${orgRoleStr}</p>
            `;

            div.appendChild(img);
            div.appendChild(info);
            sidebarMembersList.appendChild(div);
        });

        if (allMembers.length === 0) {
            sidebarMembersList.innerHTML = '<p class="text-muted text-sm">Ingen medlemmer funnet.</p>';
        } else if (allMembers.length > sidebarMembersLimit) {
            const moreBtn = document.createElement('button');
            moreBtn.className = 'btn btn-ghost btn-sm btn-full mt-2';
            moreBtn.style.fontSize = '0.75rem';

            if (sidebarMembersLimit < 15 && allMembers.length > sidebarMembersLimit) {
                moreBtn.textContent = 'Vis flere';
                moreBtn.onclick = () => {
                    sidebarMembersLimit = Math.min(15, allMembers.length);
                    loadSidebarMembersList();
                };
            } else {
                moreBtn.textContent = 'Se alle medlemmer';
                moreBtn.onclick = () => openMembersModal();
            }
            sidebarMembersList.appendChild(moreBtn);
        }

    } catch (error) {
        console.error("Error loading sidebar members:", error);
        sidebarMembersList.innerHTML = `<p class="text-error text-xs">Kunne ikke laste medlemmer.</p>`;
    }
}

// --- ADMIN MODAL LOGIC ---

function openAdminModal() {
    // Vi støtter nå kun "gallery" (offentlig administrasjon)
    if (adminModalTitle) {
        adminModalTitle.textContent = 'Administrer offentlig galleri';
    }
    toggleModal(adminImageModal, true);
    loadAdminImages();
}

function closeAdminModal() {
    toggleModal(adminImageModal, false);
}

// **OPPDATERT**: Laster faktiske brukere og deres bilder
async function loadAdminImages() {
    if (!adminUserList) return;
    adminUserList.innerHTML = '<p class="text-muted text-center">Laster brukere...</p>';

    try {
        // 1. Hent nåværende offentlige bilder fra 'items' undersamlingen
        const itemsSnapshot = await getDocs(collection(db, 'site_content', 'gallery', 'items'));
        const currentPublicImages = itemsSnapshot.docs.map(doc => doc.data().imageUrl);

        // 2. Hent alle brukere fra 'users' samlingen
        const usersSnapshot = await getDocs(collection(db, 'users'));

        if (usersSnapshot.empty) {
            adminUserList.innerHTML = '<p class="text-muted text-center">Ingen brukere funnet.</p>';
            return;
        }

        adminUserList.innerHTML = '';

        // Loop gjennom hver bruker
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const userId = userDoc.id;
            const displayName = userData.displayName || 'Ukjent bruker';

            // Hent galleribilder for denne brukeren
            const gallerySnapshot = await getDocs(collection(db, `users/${userId}/gallery_images`));

            const userGroup = document.createElement('div');
            userGroup.className = 'user-group';

            const header = document.createElement('h4');
            header.className = 'text-sm font-semibold mb-3 text-muted';
            header.textContent = `${displayName}`;
            userGroup.appendChild(header);

            if (gallerySnapshot.empty) {
                const noImg = document.createElement('p');
                noImg.className = 'text-sm text-muted bg-subtle p-3 rounded';
                noImg.textContent = 'Ingen bilder lastet opp.';
                userGroup.appendChild(noImg);
            } else {
                const grid = document.createElement('div');
                grid.className = 'gallery-preview-grid';

                gallerySnapshot.forEach(imgDoc => {
                    const imgData = imgDoc.data();
                    const isSelected = currentPublicImages.includes(imgData.imageUrl);

                    const item = document.createElement('div');
                    item.className = `admin-gallery-item ${isSelected ? 'selected' : ''}`;
                    item.dataset.url = imgData.imageUrl;
                    item.dataset.userId = userId;

                    const img = document.createElement('img');
                    img.src = imgData.imageUrl;

                    const checkIndicator = document.createElement('div');
                    checkIndicator.className = 'admin-gallery-check';
                    checkIndicator.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    `;

                    item.appendChild(img);
                    item.appendChild(checkIndicator);

                    // Toggle selection on click
                    item.addEventListener('click', () => {
                        item.classList.toggle('selected');
                    });

                    grid.appendChild(item);
                });
                userGroup.appendChild(grid);
            }
            adminUserList.appendChild(userGroup);
        }

    } catch (error) {
        console.error("Error loading admin images:", error);
        adminUserList.innerHTML = `<p class="text-error text-center">Feil: ${error.message}</p>`;
    }
}


// --- ADMIN SAVE SELECTION ---
async function saveAdminSelection() {

    // Finn alle valgte bilder via CSS-klassen
    const selectedItems = document.querySelectorAll('.admin-gallery-item.selected');
    const selectedImages = Array.from(selectedItems).map(item => item.dataset.url);

    // Lagre valget i 'site_content' samlingen
    const contentRef = doc(db, 'site_content', 'gallery');

    const btn = document.getElementById('save-admin-selection');
    const originalText = btn.textContent;
    btn.textContent = 'Lagrer...';
    btn.disabled = true;

    try {
        // 1. Hent alle eksisterende elementer i det offentlige galleriet
        const itemsRef = collection(db, 'site_content', 'gallery', 'items');
        const itemsSnapshot = await getDocs(itemsRef);

        // 2. Slett gamle koblinger (vi overskriver hele utvalget slik det fungerte før, men uten 1MB-grensen)
        const deletePromises = itemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

        // 3. Legg til nye koblinger
        const addPromises = selectedImages.map((url, index) => {
            return addDoc(itemsRef, {
                imageUrl: url,
                order: index,
                updatedAt: serverTimestamp(),
                updatedBy: authState.user.uid
            });
        });
        await Promise.all(addPromises);

        // 4. Oppdater hoved-dokumentet (valgfritt, for å logge når det sist ble endret)
        await setDoc(doc(db, 'site_content', 'gallery'), {
            lastUpdated: serverTimestamp(),
            updatedBy: authState.user.uid
        }, { merge: true });

        showCustomAlert(`Lagret ${selectedImages.length} bilder til offentlig galleri!`);
        closeAdminModal();

    } catch (error) {
        console.error("Error saving selection:", error);
        showCustomAlert("Kunne ikke lagre: " + error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}


// --- WORKSHOP STATUS LOGIC ---

function openStatusModal() {
    toggleModal(adminStatusModal, true);
    loadStatusIntoForm();
}

function closeStatusModal() {
    toggleModal(adminStatusModal, false);
}

async function loadStatusIntoForm() {
    try {
        const statusDoc = await getDoc(doc(db, 'site_content', 'status'));
        if (statusDoc.exists()) {
            const data = statusDoc.data();
            if (customStatusInput) customStatusInput.value = data.customStatus || '';

            if (data.openingHours) {
                openingDayInputs.forEach(input => {
                    const day = input.dataset.day;
                    if (data.openingHours[day]) {
                        input.value = data.openingHours[day];
                    }
                });
            }
        }
    } catch (error) {
        console.error("Error loading status into form:", error);
    }
}

async function saveWorkshopStatus() {
    const openingHours = {};
    openingDayInputs.forEach(input => {
        openingHours[input.dataset.day] = input.value.trim();
    });

    const statusData = {
        customStatus: customStatusInput.value.trim(),
        openingHours: openingHours,
        updatedAt: serverTimestamp(),
        updatedBy: authState.user.uid
    };

    const originalText = saveStatusBtn.textContent;
    saveStatusBtn.textContent = 'Lagrer...';
    saveStatusBtn.disabled = true;

    try {
        await setDoc(doc(db, 'site_content', 'status'), statusData);
        showCustomAlert("Verkstedstatus og åpningstider er oppdatert!");
        closeStatusModal();
        loadWorkshopStatus(); // Update the display immediately
    } catch (error) {
        console.error("Error saving status:", error);
        showCustomAlert("Kunne ikke lagre: " + error.message);
    } finally {
        saveStatusBtn.textContent = originalText;
        saveStatusBtn.disabled = false;
    }
}

async function loadWorkshopStatus() {
    if (!workshopCustomStatusDisplay || !workshopHoursDisplay) return;

    try {
        const statusDoc = await getDoc(doc(db, 'site_content', 'status'));
        if (statusDoc.exists()) {
            const data = statusDoc.data();

            // Custom Status
            if (data.customStatus) {
                workshopCustomStatusDisplay.textContent = data.customStatus;
                workshopCustomStatusDisplay.classList.remove('hidden');
            } else {
                workshopCustomStatusDisplay.classList.add('hidden');
            }

            // Opening Hours
            if (data.openingHours) {
                let html = '';
                const days = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

                // Group business days if possible
                let weekdaysHours = data.openingHours['Mandag'];
                let allWeekdaysSame = true;
                for (let i = 1; i < 5; i++) {
                    if (data.openingHours[days[i]] !== weekdaysHours) {
                        allWeekdaysSame = false;
                        break;
                    }
                }

                let weekendSame = data.openingHours['Lørdag'] === data.openingHours['Søndag'];

                if (allWeekdaysSame && weekendSame) {
                    html = `<p>Man-Fre: ${weekdaysHours}<br>Lør-Søn: ${data.openingHours['Lørdag']}</p>`;
                } else {
                    days.forEach(day => {
                        html += `<p style="display: flex; justify-content: space-between; gap: 1rem;">
                            <span>${day}:</span>
                            <span style="font-weight: 500;">${data.openingHours[day] || 'Stengt'}</span>
                        </p>`;
                    });
                }
                workshopHoursDisplay.innerHTML = html;
            }
        }
    } catch (error) {
        console.error("Error loading workshop status:", error);
    }
}


// --- EVENT LISTENERS ---

// Mobilmeny
if (mobileMenuButton) {
    mobileMenuButton.addEventListener('click', () => {
        // Fjern 'hidden' hvis den finnes (viktig for sider som kurs.html/galleri.html)
        mobileMenu.classList.remove('hidden');

        const isOpen = mobileMenu.classList.toggle('show');

        // Body scroll lock
        updateScrollLock();

        if (isOpen) {
            // Endre ikon til X (enkelt) eller animer SVG (bedre)
            mobileMenuButton.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
        } else {
            mobileMenuButton.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 6h16M4 12h16m-7 6h7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
        }
    });

    // Lukk meny når man klikker på en lenke
    if (mobileMenu) {
        mobileMenu.querySelectorAll('a, button').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('show');
                updateScrollLock();
                mobileMenuButton.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 6h16M4 12h16m-7 6h7" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                `;
            });
        });
    }
}

// Login
if (loginForm) loginForm.addEventListener('submit', handleLogin);
if (forgotPasswordBtn) forgotPasswordBtn.addEventListener('click', handleForgotPassword);

// Logout
if (dropdownLogoutButton) dropdownLogoutButton.addEventListener('click', handleLogout);
if (mobileLogoutButton) mobileLogoutButton.addEventListener('click', handleLogout);
if (logoutButton) logoutButton.addEventListener('click', handleLogout);

// Theme Toggle (Håndteres nå av theme-switcher.js)

// Profil Modal
if (openProfileModal) {
    openProfileModal.addEventListener('click', () => {
        displayNameInput.value = authState.profile?.displayName || '';
        profileImageUrlInput.value = authState.profile?.photoURL || '';
        toggleModal(profileModal, true);
    });
}
function closeModal() { toggleModal(profileModal, false); }
if (closeProfileModalButton) closeProfileModalButton.addEventListener('click', closeModal);
if (profileModalOverlay) profileModalOverlay.addEventListener('click', closeModal);
if (profileForm) profileForm.addEventListener('submit', handleProfileSave);

// Gallery Upload (Open Modal)
if (uploadGalleryBtn) {
    uploadGalleryBtn.addEventListener('click', openUploadModal);
}
if (uploadForm) {
    uploadForm.addEventListener('submit', handleGalleryUploadSubmit);
}
if (closeUploadModalBtn) closeUploadModalBtn.addEventListener('click', closeUploadModal);
if (uploadModalOverlay) uploadModalOverlay.addEventListener('click', closeUploadModal);

// Lightbox listeners
if (closeLightboxBtn) closeLightboxBtn.addEventListener('click', closeLightbox);
if (lightboxOverlay) lightboxOverlay.addEventListener('click', closeLightbox);

// Admin Gallery Modals (Selection)
if (closeAdminModalBtn) closeAdminModalBtn.addEventListener('click', () => toggleModal(adminImageModal, false));
if (cancelAdminModalBtn) cancelAdminModalBtn.addEventListener('click', () => toggleModal(adminImageModal, false));
if (adminImageModalOverlay) adminImageModalOverlay.addEventListener('click', () => toggleModal(adminImageModal, false));

// Admin Status Modal
if (closeStatusModalBtn) closeStatusModalBtn.addEventListener('click', () => toggleModal(adminStatusModal, false));
if (cancelStatusModalBtn) cancelStatusModalBtn.addEventListener('click', () => toggleModal(adminStatusModal, false));
if (adminStatusModalOverlay) adminStatusModalOverlay.addEventListener('click', () => toggleModal(adminStatusModal, false));

// Admin Members Modal
if (closeMembersModalBtn) closeMembersModalBtn.addEventListener('click', closeMembersModal);
if (closeMembersFooterBtn) closeMembersFooterBtn.addEventListener('click', closeMembersModal);
if (adminMembersModalOverlay) adminMembersModalOverlay.addEventListener('click', closeMembersModal);



// Tab switching logic for unified 3-tab modal
function setupMembersTabs() {
    const tabs = [
        { btn: tabActiveMembers, section: activeMembersSection, loadFunc: loadMembersList },
        { btn: tabPendingDeletions, section: pendingDeletionsSection, loadFunc: loadPendingDeletionsList },
        { btn: tabArchive, section: archiveSection, loadFunc: loadArchiveList },
        { btn: tabAddMember, section: addMemberSection }
    ];

    tabs.forEach(tab => {
        if (tab.btn) {
            tab.btn.addEventListener('click', () => {
                if (tab.btn.classList.contains('active')) return;

                // Highlighting
                tabs.forEach(t => {
                    if (t.btn) {
                        t.btn.classList.remove('active');
                        t.btn.classList.replace('btn-primary', 'btn-secondary');
                    }
                    if (t.section) t.section.classList.add('hidden');
                });

                tab.btn.classList.add('active');
                tab.btn.classList.replace('btn-secondary', 'btn-primary');
                if (tab.section) tab.section.classList.remove('hidden');

                // Load data if function provided
                if (tab.loadFunc) tab.loadFunc();

                // If switching away from Add tab, reset password hint
                if (tab.btn !== tabAddMember) {
                    const hint = document.getElementById('password-hint');
                    if (hint) hint.textContent = 'Minst 6 tegn for nye brukere.';
                }
            });
        }
    });
}
setupMembersTabs();

if (closeMembersModalBtn) closeMembersModalBtn.addEventListener('click', closeMembersModal);
if (closeMembersFooterBtn) closeMembersFooterBtn.addEventListener('click', closeMembersModal);
if (adminMembersModalOverlay) adminMembersModalOverlay.addEventListener('click', closeMembersModal);

// Documentation Event Listeners
// Documentation Event Listeners
if (closeDocumentsModalBtn) closeDocumentsModalBtn.addEventListener('click', closeDocumentsModal);
if (closeDocumentsFooterBtn) closeDocumentsFooterBtn.addEventListener('click', closeDocumentsModal);
if (documentsModalOverlay) documentsModalOverlay.addEventListener('click', closeDocumentsModal);

// New Dashboard Buttons
if (btnReferater) btnReferater.addEventListener('click', () => openDocumentsModal('referater'));
if (btnRetningslinjer) btnRetningslinjer.addEventListener('click', () => openDocumentsModal('retningslinjer'));
if (btnVedtekter) btnVedtekter.addEventListener('click', () => openDocumentsModal('vedtekter'));

setupRetningslinjerTabs();

if (adminAddDocBtn) adminAddDocBtn.addEventListener('click', () => openDocEntryModal());
if (closeDocEntryModalBtn) closeDocEntryModalBtn.addEventListener('click', closeDocEntryModal);
if (cancelDocEntryModalBtn) cancelDocEntryModalBtn.addEventListener('click', closeDocEntryModal);
if (docEntryModalOverlay) docEntryModalOverlay.addEventListener('click', closeDocEntryModal);
if (docEntryForm) docEntryForm.addEventListener('submit', handleDocEntrySubmit);
if (deleteDocEntryBtn) deleteDocEntryBtn.addEventListener('click', handleDeleteDocEntry);

// Admin Control Panel Modal
if (openAdminControlBtn) openAdminControlBtn.addEventListener('click', () => toggleModal(adminControlModal, true));
if (closeAdminControlModalBtn) closeAdminControlModalBtn.addEventListener('click', () => toggleModal(adminControlModal, false));
if (closeAdminControlFooterBtn) closeAdminControlFooterBtn.addEventListener('click', () => toggleModal(adminControlModal, false));
if (adminControlModalOverlay) adminControlModalOverlay.addEventListener('click', () => toggleModal(adminControlModal, false));

// Admin Control Panel Tool Buttons
if (adminPanelGalleryBtn) adminPanelGalleryBtn.addEventListener('click', () => {
    toggleModal(adminControlModal, false);
    openAdminModal();
});
if (adminPanelStatusBtn) adminPanelStatusBtn.addEventListener('click', () => {
    toggleModal(adminControlModal, false);
    openStatusModal();
});
if (adminPanelMembersBtn) adminPanelMembersBtn.addEventListener('click', () => {
    toggleModal(adminControlModal, false);
    openMembersModal();
});




// --- INIT ---

authReady.then(async (initialUser) => {
    if (initialUser) {
        // Prøv å hent fra cache først for lynrask visning
        const cached = getCachedProfile(initialUser.uid);

        authState.user = initialUser;
        if (cached) {
            console.log("Bruker cachet profil.");
            authState.profile = cached;
            authState.role = cached.role || 'member';
        } else {
            const userData = await fetchUserData(initialUser.uid);
            authState.profile = userData || { displayName: null, photoURL: null };
            authState.role = userData?.role || 'member';
            if (userData) setCachedProfile(initialUser.uid, userData);
        }

        if (profileUnsubscribe) profileUnsubscribe();
        profileUnsubscribe = setupUserListener(initialUser.uid);

        if (galleryUnsubscribe) galleryUnsubscribe();
        galleryUnsubscribe = setupGalleryListener(initialUser.uid);

    } else {
        authState.user = null;
        authState.role = null;
        authState.profile = null;
    }

    updateUI(authState.user, authState.profile);
    loadWorkshopStatus();
    loadSidebarMembersList(); // Added
    protectMemberPage();
    protectLoginPage();

    // Signaliser at vi er ferdige med init
    resolveUserReady(authState);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const cached = getCachedProfile(user.uid);

            authState.user = user;
            if (cached) {
                authState.profile = cached;
                authState.role = cached.role || 'member';
            } else {
                const userData = await fetchUserData(user.uid);
                authState.profile = userData || { displayName: null, photoURL: null };
                authState.role = userData?.role || 'member';
                if (userData) setCachedProfile(user.uid, userData);
            }

            if (profileUnsubscribe) profileUnsubscribe();
            profileUnsubscribe = setupUserListener(user.uid);

            if (galleryUnsubscribe) galleryUnsubscribe();
            galleryUnsubscribe = setupGalleryListener(user.uid);

        } else {
            if (authState.user) clearCachedProfile(authState.user.uid);
            authState.user = null;
            authState.role = null;
            authState.profile = null;
            if (profileUnsubscribe) profileUnsubscribe();
            if (galleryUnsubscribe) galleryUnsubscribe();
        }
        updateUI(authState.user, authState.profile);
        loadSidebarMembersList(); // Added
        protectMemberPage();
        protectLoginPage();
    });
});

// --- ADMIN MEMBERS LIST ---

async function openMembersModal() {
    resetAddMemberForm();

    // Rolle-basert synlighet for faner
    const isAdmin = authState.role === 'admin';
    if (tabPendingDeletions) tabPendingDeletions.classList.toggle('hidden', !isAdmin);
    if (tabArchive) tabArchive.classList.toggle('hidden', !isAdmin);
    if (tabAddMember) tabAddMember.classList.toggle('hidden', !isAdmin);

    // Standard til aktive medlemmer
    if (tabActiveMembers) tabActiveMembers.click();

    toggleModal(adminMembersModal, true);
    loadMembersList();
}

function closeMembersModal() {
    toggleModal(adminMembersModal, false);
}

async function loadMembersList() {
    if (!adminMembersList) return;
    adminMembersList.innerHTML = '<p class="text-muted text-center">Laster medlemmer...</p>';

    try {
        const usersSnapshot = await getDocs(query(
            collection(db, 'users'),
            orderBy('displayName', 'asc')
        ));
        adminMembersList.innerHTML = '';

        const allUsers = usersSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(userData => userData.status !== 'pending_deletion');

        // Sort by role priority, then by name
        const rolePriority = {
            'styremedlem - leder': 1,
            'styremedlem - økonomiansvarlig': 2,
            'styremedlem - sekretær': 3,
            'styremedlem': 4,
            'medlem': 5,
            'it administrator': 10,
            'it administartor': 10
        };

        allUsers.sort((a, b) => {
            const priorityA = rolePriority[a.organizationRole?.toLowerCase()] || 5;
            const priorityB = rolePriority[b.organizationRole?.toLowerCase()] || 5;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        allUsers.forEach(userData => {
            const userId = userData.id;

            const div = document.createElement('div');
            div.className = 'admin-list-item';

            let dateStr = 'Ikke satt';
            if (userData.memberSince) {
                const date = userData.memberSince.toDate ? userData.memberSince.toDate() : new Date(userData.memberSince);
                dateStr = date.toLocaleDateString('no-NO');
            }


            let orgRoleStr = userData.organizationRole || 'Medlem';
            orgRoleStr = orgRoleStr.charAt(0).toUpperCase() + orgRoleStr.slice(1);

            div.innerHTML = `
                <div>
                    <p class="font-semibold text-sm">${userData.displayName || 'Ukjent'} (${orgRoleStr})</p>
                    <p class="text-xs text-muted">ID: ${userId} | medlem fra: ${dateStr}</p>
                </div>
                ${authState.role === 'admin' ? `
                    <button class="btn btn-secondary btn-sm edit-member-btn" data-id="${userId}">Rediger</button>
                ` : ''}
            `;

            adminMembersList.appendChild(div);
        });

        // Add event listeners to edit buttons
        adminMembersList.querySelectorAll('.edit-member-btn').forEach(btn => {
            btn.onclick = () => openEditUserModal(btn.dataset.id);
        });

    } catch (error) {
        console.error("Error loading members:", error);
        adminMembersList.innerHTML = `<p class="text-error">Feil: ${error.message}</p>`;
    }
}

async function openEditUserModal(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) return;

        const userData = userDoc.data();

        // Switch to Add/Edit tab
        if (tabAddMember) tabAddMember.click();

        // Populate form
        if (editUserIdInput) editUserIdInput.value = userId;

        const emailInput = document.getElementById('new-user-email');
        const passInput = document.getElementById('new-user-password');
        const passHint = document.getElementById('password-hint');

        if (emailInput) {
            emailInput.value = userData.email || userId;
            emailInput.disabled = true;
            emailInput.required = false;
        }
        if (passInput) {
            passInput.value = ''; // Let them leave it empty
            passInput.placeholder = '******';
            passInput.required = false;
        }
        if (passHint) {
            passHint.textContent = 'La stå tomt for å beholde nåværende passord.';
        }

        document.getElementById('new-user-name').value = userData.displayName || '';
        document.getElementById('new-user-role').value = userData.role || 'member';
        if (userOrganizationRoleInput) userOrganizationRoleInput.value = userData.organizationRole || 'medlem';

        if (userData.memberSince) {
            const date = userData.memberSince.toDate ? userData.memberSince.toDate() : new Date(userData.memberSince);
            // Format to YYYY-MM-DD for date input
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            userMemberSinceInput.value = `${year}-${month}-${day}`;
        } else {
            userMemberSinceInput.value = '';
        }

        if (adminSoftDeleteBtn) {
            adminSoftDeleteBtn.classList.remove('hidden');
            adminSoftDeleteBtn.onclick = () => initiateSoftDelete(userId);
        }
        if (createUserBtn) createUserBtn.textContent = 'Lagre endringer';

    } catch (error) {
        console.error("Error fetching user data:", error);
        alert("Kunne ikke hente brukerinformasjon.");
    }
}

function resetAddMemberForm() {
    if (createUserForm) createUserForm.reset();
    if (editUserIdInput) editUserIdInput.value = '';
    if (userOrganizationRoleInput) userOrganizationRoleInput.value = 'medlem';

    const emailInput = document.getElementById('new-user-email');
    const passInput = document.getElementById('new-user-password');
    const passHint = document.getElementById('password-hint');

    if (emailInput) {
        emailInput.disabled = false;
        emailInput.required = true;
        emailInput.placeholder = 'bruker@epost.no';
        emailInput.value = '';
    }
    if (passInput) {
        passInput.disabled = false;
        passInput.required = true;
        passInput.placeholder = 'Minst 6 tegn';
        passInput.value = '';
    }
    if (passHint) {
        passHint.textContent = 'Minst 6 tegn for nye brukere.';
    }

    if (adminSoftDeleteBtn) {
        adminSoftDeleteBtn.classList.add('hidden');
        adminSoftDeleteBtn.onclick = null;
    }
    if (createUserBtn) createUserBtn.textContent = 'Opprett bruker';
}

// --- ADMIN USER MANAGEMENT ---

// Redundant adminAddUserBtn listener removed (merged into unified modal)

function closeUserModal() {
    toggleModal(adminUserModal, false);
    createUserForm.reset();

    // Reset fields that might have been disabled during edit
    const emailInput = document.getElementById('new-user-email');
    const passInput = document.getElementById('new-user-password');
    if (emailInput) {
        emailInput.disabled = false;
        emailInput.required = true;
    }
    if (passInput) {
        passInput.disabled = false;
        passInput.required = true;
    }
    if (userModalTitle) userModalTitle.textContent = 'Legg til ny bruker';
    if (editUserIdInput) editUserIdInput.value = '';
    if (adminSoftDeleteBtn) adminSoftDeleteBtn.classList.add('hidden');
}

if (closeUserModalBtn) closeUserModalBtn.addEventListener('click', closeUserModal);
if (cancelUserModalBtn) cancelUserModalBtn.addEventListener('click', closeUserModal);
if (adminUserModalOverlay) adminUserModalOverlay.addEventListener('click', closeUserModal);

if (createUserForm) {
    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('new-user-email').value.trim();
        const password = document.getElementById('new-user-password').value.trim();
        const name = document.getElementById('new-user-name').value.trim();
        const role = document.getElementById('new-user-role').value;
        const orgRole = userOrganizationRoleInput ? userOrganizationRoleInput.value : 'medlem';
        const memberSince = userMemberSinceInput.value;
        const editingId = editUserIdInput.value;

        const originalText = createUserBtn.textContent;
        createUserBtn.textContent = 'Lagrer...';
        createUserBtn.disabled = true;

        try {
            // Convert date string to Date object
            let memberSinceDate = memberSince ? new Date(memberSince) : new Date();

            if (editingId) {
                // --- UPDATE EXISTING USER ---
                await setDoc(doc(db, 'users', editingId), {
                    displayName: name,
                    role: role,
                    organizationRole: orgRole,
                    memberSince: memberSinceDate, // Admin controlled display date
                    status: 'active'
                }, { merge: true });

                showCustomAlert(`Bruker ${name} er oppdatert!`);
                loadMembersList(); // Refresh list if open
            } else {
                // --- CREATE NEW USER ---
                if (password.length < 6) {
                    showCustomAlert("Passordet må være minst 6 tegn langt.");
                    createUserBtn.textContent = originalText;
                    createUserBtn.disabled = false;
                    return;
                }

                // 1. Create account in secondary auth
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const newUser = userCredential.user;

                // 2. Create profile in Firestore
                await setDoc(doc(db, 'users', newUser.uid), {
                    displayName: name,
                    email: email, // Saved for archive purposes
                    photoURL: null,
                    role: role,
                    organizationRole: orgRole,
                    memberSince: memberSinceDate, // Admin controlled display date
                    startDate: serverTimestamp(), // Actual account creation
                    status: 'active',
                    createdAt: serverTimestamp(),
                    createdBy: authState.user ? authState.user.uid : 'admin'
                });

                // 3. Sign out secondary auth immediately
                await signOut(secondaryAuth);

                showCustomAlert(`Bruker ${name} er nå opprettet som ${role === 'admin' ? 'administrator' : 'medlem'}!`);
            }
            closeUserModal();
        } catch (error) {
            console.error("Error creating user:", error);
            let msg = "Kunne ikke opprette bruker: " + error.message;
            if (error.code === 'auth/email-already-in-use') msg = "E-postadressen er allerede i bruk.";
            showCustomAlert(msg);
        } finally {
            createUserBtn.textContent = originalText;
            createUserBtn.disabled = false;
        }
    });
}

// --- PENDING DELETION MANAGEMENT ---

async function loadPendingDeletionsList() {
    if (!adminPendingList) return;
    adminPendingList.innerHTML = '<p class="text-muted text-center">Laster forespørsler...</p>';

    try {
        const q = query(collection(db, 'users'), orderBy('deletionRequestedAt', 'desc'));
        const usersSnapshot = await getDocs(q);
        adminPendingList.innerHTML = '';

        let count = 0;
        usersSnapshot.forEach(userDoc => {
            const userData = userDoc.data();
            if (userData.status !== 'pending_deletion') return;
            count++;

            const userId = userDoc.id;
            const requestedDate = userData.deletionRequestedAt?.toDate ? userData.deletionRequestedAt.toDate() : new Date(userData.deletionRequestedAt);
            const deleteDate = new Date(requestedDate);
            deleteDate.setDate(deleteDate.getDate() + 30);

            const div = document.createElement('div');
            div.className = 'card bg-subtle mb-4';
            div.style.padding = '1rem';
            div.innerHTML = `
                <div class="mb-4">
                    <p class="font-semibold">${userData.displayName || 'Ukjent'}</p>
                    <p class="text-xs text-muted">ID: ${userId}</p>
                    <p class="text-xs text-error mt-2">Sletting forespurt: ${requestedDate.toLocaleDateString('no-NO')}</p>
                    <p class="text-xs font-semibold">Slettes automatisk: ${deleteDate.toLocaleDateString('no-NO')}</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-secondary btn-sm restore-user-btn" data-id="${userId}">Gjenopprett</button>
                    <button class="btn btn-primary btn-sm delete-now-btn" style="background-color: var(--color-error);" data-id="${userId}">Slett nå</button>
                </div>
            `;
            adminPendingList.appendChild(div);
        });

        if (count === 0) {
            adminPendingList.innerHTML = '<p class="text-muted text-center">Ingen forespørsler om sletting for øyeblikket.</p>';
        } else {
            // Add listeners
            adminPendingList.querySelectorAll('.restore-user-btn').forEach(btn => {
                btn.onclick = () => handleRestoreUser(btn.dataset.id);
            });
            adminPendingList.querySelectorAll('.delete-now-btn').forEach(btn => {
                btn.onclick = () => handlePermanentDeleteNow(btn.dataset.id);
            });
        }
    } catch (error) {
        console.error("Error loading pending deletions:", error);
        adminPendingList.innerHTML = `<p class="text-error">Feil: ${error.message}</p>`;
    }
}

async function handleRestoreUser(userId) {
    const confirmed = await showCustomConfirm("Er du sikker på at du vil gjenopprette denne kontoen?");
    if (!confirmed) return;

    try {
        const restoreFn = httpsCallable(functions, 'restoreUserAccount');
        const result = await restoreFn({ userId });
        showCustomAlert(result.data.message);
        loadPendingDeletionsList();
        loadMembersList();
    } catch (error) {
        console.error("Restore failed:", error);
        showCustomAlert("Gjenoppretting feilet: " + error.message);
    }
}

async function handlePermanentDeleteNow(userId) {
    const confirmed = await showCustomConfirm("ADVARSEL: Dette vil slette brukeren og alle deres data permanent umiddelbart. Handlingen kan ikke angres. Vil du fortsette?");
    if (!confirmed) return;

    try {
        const deleteFn = httpsCallable(functions, 'permanentDeleteNow');
        const result = await deleteFn({ userId });
        showCustomAlert(result.data.message);
        loadPendingDeletionsList();
    } catch (error) {
        console.error("Permanent delete failed:", error);
        showCustomAlert("Sletting feilet: " + error.message);
    }
}

// --- ARCHIVE MANAGEMENT ---

async function loadArchiveList() {
    if (!adminArchiveList) return;
    adminArchiveList.innerHTML = '<p class="text-muted text-center">Laster arkiv...</p>';

    try {
        // Fetch all archived users. Using orderBy might exclude documents without the field.
        const q = query(collection(db, 'archive'));
        const archiveSnapshot = await getDocs(q);
        adminArchiveList.innerHTML = '';

        let archiveDataArray = [];
        archiveSnapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            archiveDataArray.push(data);
        });

        // Sort client-side to handle both archivedAt and old endDate fields
        archiveDataArray.sort((a, b) => {
            const dateA = a.archivedAt?.toDate?.() || a.archivedAt?.toDate || a.endDate?.toDate?.() || a.endDate?.toDate || new Date(0);
            const dateB = b.archivedAt?.toDate?.() || b.archivedAt?.toDate || b.endDate?.toDate?.() || b.endDate?.toDate || new Date(0);
            return new Date(dateB) - new Date(dateA);
        });

        let count = 0;
        archiveDataArray.forEach(data => {
            count++;
            const userId = data.id;
            const archivedRaw = data.archivedAt || data.endDate;
            const archivedDate = archivedRaw?.toDate ? archivedRaw.toDate() : (archivedRaw ? new Date(archivedRaw) : new Date(0));

            const div = document.createElement('div');
            div.className = 'card bg-subtle mb-4';
            div.style.padding = '1rem';
            div.innerHTML = `
                <div class="mb-4">
                    <p class="font-semibold">${data.fullName || 'Ukjent'}</p>
                    <p class="text-xs text-muted">ID: ${userId} | E-post: ${data.email || 'Mangler'}</p>
                    <p class="text-xs text-muted mt-2">Arkivert: ${archivedDate.toLocaleDateString('no-NO')}</p>
                    <p class="text-xs text-muted">Rolle: ${data.role || 'member'}</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-secondary btn-sm restore-archive-btn" data-id="${userId}">Gjenopprett</button>
                    <button class="btn btn-ghost btn-sm wipe-archive-btn" style="color: var(--color-error);" data-id="${userId}">Slett fra arkiv</button>
                </div>
            `;
            adminArchiveList.appendChild(div);
        });

        if (count === 0) {
            adminArchiveList.innerHTML = '<p class="text-muted text-center">Arkivet er tomt.</p>';
        } else {
            // Add listeners
            adminArchiveList.querySelectorAll('.restore-archive-btn').forEach(btn => {
                btn.onclick = () => handleRestoreFromArchive(btn.dataset.id);
            });
            adminArchiveList.querySelectorAll('.wipe-archive-btn').forEach(btn => {
                btn.onclick = () => handleWipeFromArchive(btn.dataset.id);
            });
        }
    } catch (error) {
        console.error("Error loading archive:", error);
        adminArchiveList.innerHTML = `<p class="text-error">Feil: ${error.message}</p>`;
    }
}

async function handleRestoreFromArchive(userId) {
    const confirmed = await showCustomConfirm("Vil du gjenopprette denne brukeren? De vil få en ny konto og må be om nytt passord for å logge inn. De må også godta vilkårene på nytt.");
    if (!confirmed) return;

    try {
        const restoreFn = httpsCallable(functions, 'restoreFromArchive');
        const result = await restoreFn({ userId });
        showCustomAlert(result.data.message);
        loadArchiveList();
        loadMembersList();
    } catch (error) {
        console.error("Restore from archive failed:", error);
        showCustomAlert("Gjenoppretting feilet: " + error.message);
    }
}

async function handleWipeFromArchive(userId) {
    const confirmed = await showCustomConfirm("ER DU HELT SIKKER? Dette sletter all arkivert informasjon om brukeren for alltid. Dette kan ikke angres.");
    if (!confirmed) return;

    try {
        const wipeFn = httpsCallable(functions, 'wipeFromArchive');
        const result = await wipeFn({ userId });
        showCustomAlert(result.data.message);
        loadArchiveList();
    } catch (error) {
        console.error("Wipe from archive failed:", error);
        showCustomAlert("Sletting fra arkiv feilet: " + error.message);
    }
}

// Tab Switching logic handled by setupMembersTabs() above.

// Expand openMembersModal to also load pending if that tab is active
const originalOpenMembersModal = openMembersModal;
window.openMembersModal = async function () {
    await originalOpenMembersModal();
    if (!pendingDeletionsSection.classList.contains('hidden')) {
        loadPendingDeletionsList();
    }
};

// Add "Soft Delete" button to the edit user modal
async function initiateSoftDelete(userId) {
    const confirmed = await showCustomConfirm("Vil du sette denne kontoen til sletting? Brukeren vil miste tilgang umiddelbart, og kontoen slettes permanent om 30 dager.");
    if (!confirmed) return;

    try {
        await saveUserProfile(userId, {
            status: 'pending_deletion',
            deletionRequestedAt: serverTimestamp()
        });
        showCustomAlert("Brukeren er nå satt til sletting.");
        closeUserModal();
        loadMembersList();
        loadPendingDeletionsList();
    } catch (error) {
        console.error("Soft delete failed:", error);
        showCustomAlert("Kunne ikke starte sletting: " + error.message);
    }
}

// --- DOCUMENTS LOGIC ---

let currentDocCategory = 'referater';
let currentRetningslinjeType = 'brann'; // Default sub-tab

function closeDocumentsModal() {
    toggleModal(documentsModal, false);
}

function openDocumentsModal(category = 'referater') {
    toggleModal(documentsModal, true);
    currentDocCategory = category;

    // Refresh admin button visibility
    const canEditAll = authState.role === 'admin';
    const isSecretary = authState.role === 'sekretær' || authState.role === 'contributor';
    const canEditReferater = canEditAll || isSecretary;

    if (adminAddDocBtn) {
        if (category === 'referater') {
            adminAddDocBtn.classList.toggle('hidden', !canEditReferater);
        } else {
            adminAddDocBtn.classList.toggle('hidden', !canEditAll);
        }
    }

    // Reset UI based on category
    if (retningslinjerTabs) retningslinjerTabs.classList.add('hidden');
    if (documentsModalTitle) documentsModalTitle.textContent = 'Dokumenter';

    const headerControls = document.getElementById('documents-header-controls');

    if (category === 'referater') {
        if (documentsModalTitle) documentsModalTitle.textContent = 'Referater';
        if (adminAddDocBtn) adminAddDocBtn.innerText = '+ Nytt referat';
        if (headerControls) {
            // For referater, secretaries can see the controls. For others, only admin.
            const canSeeControls = category === 'referater' ? canEditReferater : canEditAll;
            headerControls.style.display = canSeeControls ? 'flex' : 'none';
            headerControls.style.justifyContent = 'flex-end';
        }
    } else if (category === 'vedtekter') {
        if (documentsModalTitle) documentsModalTitle.textContent = 'Vedtekter';
        if (adminAddDocBtn) adminAddDocBtn.innerText = '+ Rediger vedtekter';
        if (headerControls) {
            // For referater, secretaries can see the controls. For others, only admin.
            const canSeeControls = category === 'referater' ? canEditReferater : canEditAll;
            headerControls.style.display = canSeeControls ? 'flex' : 'none';
            headerControls.style.justifyContent = 'flex-end';
        }
    } else if (category === 'retningslinjer') {
        if (documentsModalTitle) documentsModalTitle.textContent = 'Retningslinjer';
        if (retningslinjerTabs) retningslinjerTabs.classList.remove('hidden');
        if (adminAddDocBtn) adminAddDocBtn.innerText = '+ Rediger liste';
        if (headerControls) {
            headerControls.style.display = 'grid';
            headerControls.style.gridTemplateColumns = '1fr auto 1fr';
        }

        // Reset to first tab if needed, or keep current
        if (!currentRetningslinjeType) currentRetningslinjeType = 'brann';
        updateRetningslinjerTabsUI();
    }

    loadDocumentsList(category);
}

function updateRetningslinjerTabsUI() {
    [tabFire, tabGlaze, tabWorkshop].forEach(tab => {
        if (!tab) return;
        if (tab.id === `tab-${currentRetningslinjeType === 'brann' ? 'fire' : currentRetningslinjeType === 'glasur' ? 'glaze' : 'workshop'}`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

function setupRetningslinjerTabs() {
    const tabs = [
        { btn: tabFire, type: 'brann' },
        { btn: tabGlaze, type: 'glasur' },
        { btn: tabWorkshop, type: 'verksted' }
    ];

    tabs.forEach(t => {
        if (t.btn) {
            t.btn.addEventListener('click', () => {
                currentRetningslinjeType = t.type;
                updateRetningslinjerTabsUI();
                loadDocumentsList('retningslinjer');
            });
        }
    });
}

async function loadDocumentsList(category) {
    if (!documentsListContainer) return;
    documentsListContainer.innerHTML = '<p class="text-muted text-center">Laster dokumenter...</p>';

    try {
        let q;
        // Use subcollection: documents/{category}/items
        const collectionRef = collection(db, 'documents', category, 'items');

        if (category === 'retningslinjer') {
            // Filter also by active sub-tab (type)
            q = query(
                collectionRef,
                where('type', '==', currentRetningslinjeType),
                orderBy('date', 'desc')
            );
        } else {
            q = query(
                collectionRef,
                orderBy('date', 'desc')
            );
        }

        if (category === 'vedtekter') {
            const querySnapshot = await getDocs(q);
            documentsListContainer.innerHTML = '';
            if (querySnapshot.empty) {
                documentsListContainer.innerHTML = '<p class="text-muted text-center py-4">Ingen vedtekter her ennå.</p>';
                currentVedtektId = null;
                currentVedtektData = null;
                return;
            }
            // Just take the first one
            const docSnap = querySnapshot.docs[0];
            const data = docSnap.data();
            currentVedtektId = docSnap.id;
            currentVedtektData = data;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'card';
            contentDiv.style.padding = '2rem';
            contentDiv.style.backgroundColor = 'var(--color-bg-surface)';
            contentDiv.style.border = '1px solid var(--color-border)';
            contentDiv.style.lineHeight = '1.8';
            contentDiv.style.fontSize = '1.1rem';
            contentDiv.innerHTML = data.content || '';
            documentsListContainer.appendChild(contentDiv);
            return;
        }

        const querySnapshot = await getDocs(q);
        documentsListContainer.innerHTML = '';
        if (querySnapshot.empty) {
            documentsListContainer.innerHTML = '<p class="text-muted text-center py-4">Ingen dokumenter her ennå.</p>';
            return;
        }

        querySnapshot.forEach(docSnap => {
            const item = createDocumentItem(docSnap, category);
            documentsListContainer.appendChild(item);
        });

    } catch (error) {
        console.error("Error loading documents:", error);
        documentsListContainer.innerHTML = `<p class="text-error">Kunne ikke laste: ${error.message}</p>`;
    }
}

function createDocumentItem(docSnap, category) {
    const data = docSnap.data();
    const id = docSnap.id;

    const canEditAll = authState.role === 'admin';
    const isSecretary = authState.role === 'sekretær' || authState.role === 'contributor';
    const canEditThisCategory = category === 'referater' ? (canEditAll || isSecretary) : canEditAll;

    const isVedtekter = category === 'vedtekter';
    const isRetningslinjer = category === 'retningslinjer';

    // Guidelines are non-boxed bullet points
    if (isRetningslinjer) {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'flex-start';
        item.style.gap = '0.75rem';
        item.style.padding = '0.5rem 0';
        item.style.borderBottom = '1px dashed var(--color-border)';

        // role-based canEdit now handled by canEditThisCategory

        item.innerHTML = `
            <span style="color: var(--color-primary); font-size: 1.25rem; line-height: 1;">•</span>
            <div style="flex: 1; font-size: 0.95rem; line-height: 1.5; color: var(--color-text-main);">${data.content}</div>
            ${(canEditThisCategory && !isRetningslinjer) ? `
                <button class="btn btn-ghost edit-doc-btn" data-id="${id}" style="padding: 0.25rem; min-width: auto; height: auto; opacity: 0.5;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                </button>
            ` : ''}
        `;

        if (canEditThisCategory) {
            const editBtn = item.querySelector('.edit-doc-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    openDocEntryModal(id, data);
                });
                item.addEventListener('mouseenter', () => { editBtn.style.opacity = '1'; });
                item.addEventListener('mouseleave', () => { editBtn.style.opacity = '0.5'; });
            }
        }

        return item;
    }

    const isReferat = category === 'referater';
    const item = document.createElement(isVedtekter ? 'div' : 'article');
    item.className = isVedtekter ? 'card' : `feed-item ${isReferat ? 'collapsible-item' : ''}`;
    item.style.marginBottom = '1.5rem';
    item.style.padding = '1.25rem';

    if (isVedtekter) {
        item.style.backgroundColor = 'var(--color-bg-surface)';
        item.style.border = '1px solid var(--color-border)';
    }

    // role-based canEdit now handled by canEditThisCategory

    // Format date
    const dateStr = data.date ? new Date(data.date).toLocaleDateString('no-NO') : 'Ukjent dato';

    // Format content: If category is referater or vedtekter, it's HTML from Quill
    let contentHtml = '';
    const isRichText = category === 'referater' || category === 'vedtekter';

    if (isRichText) {
        contentHtml = `<div class="text-sm ql-editor" style="line-height: 1.6; color: var(--color-text-main); padding: 0;">${data.content}</div>`;
    } else {
        contentHtml = `<div class="text-sm" style="white-space: pre-wrap; line-height: 1.6; color: var(--color-text-main);">${data.content}</div>`;
    }

    if (isReferat) {
        item.innerHTML = `
            <div class="collapsible-header">
                <div style="flex: 1;">
                    <h4 class="text-md font-semibold mb-1" style="margin: 0; color: var(--color-text-main); font-family: var(--font-display);">${data.name}</h4>
                    <p class="text-xs text-muted" style="margin: 0;">${dateStr}</p>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${canEditThisCategory ? `
                        <button class="btn btn-ghost btn-sm edit-doc-btn" data-id="${id}" style="padding: 0.25rem; min-width: auto; height: auto;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                    ` : ''}
                    <div class="toggle-arrow">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </div>
                </div>
            </div>
            <div class="collapsible-content">
                ${contentHtml}
            </div>
        `;

        const header = item.querySelector('.collapsible-header');
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking the edit button
            if (e.target.closest('.edit-doc-btn')) return;
            item.classList.toggle('expanded');
        });
    } else {
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                <div style="flex: 1;">
                    <h4 class="text-md font-semibold mb-1" style="margin: 0; color: var(--color-text-main); font-family: var(--font-display);">${data.name}</h4>
                    ${isVedtekter || isRetningslinjer ? '' : `<p class="text-xs text-muted mb-3">${dateStr}</p>`}
                    ${contentHtml}
                </div>
                ${canEdit ? `
                    <button class="btn btn-ghost btn-sm edit-doc-btn" data-id="${id}" style="padding: 0.25rem; min-width: auto; height: auto;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                    </button>
                ` : ''}
            </div>
        `;
    }

    if (canEditThisCategory) {
        const editBtn = item.querySelector('.edit-doc-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                openDocEntryModal(id, data);
            });
        }
    }

    return item;
}

async function openDocEntryModal(id = null, data = null) {
    if (!docEntryModal) return;

    docEntryForm.reset();
    if (quill) quill.setText('');
    docEntryIdInput.value = id || '';
    docEntryCategoryInput.value = currentDocCategory;
    docEntryTitle.innerText = id ? 'Rediger' : (currentDocCategory === 'retningslinjer' ? 'Rediger punktliste' : currentDocCategory === 'vedtekter' ? 'Rediger Vedtekter' : 'Legg til');

    const isRetningslinje = currentDocCategory === 'retningslinjer';
    const isVedtekter = currentDocCategory === 'vedtekter';
    const isReferat = currentDocCategory === 'referater';
    const isReferatEllerVedtekt = isReferat || isVedtekter;

    // Toggle specific fields based on category
    if (isVedtekter) {
        // Auto-load existing Vedtekt
        id = currentVedtektId;
        data = currentVedtektData;
        docEntryIdInput.value = id || '';
    }

    if (isRetningslinje) {
        // Multi-point inputs for Guidelines
        docEntryTypeGroup.classList.remove('hidden');
        docEntryNameGroup.classList.add('hidden');
        docEntryDateGroup.classList.add('hidden');
        docEntryContentInput.classList.add('hidden');
        docContentHint.classList.add('hidden');
        if (docQuillEditor) {
            docQuillEditor.classList.add('hidden');
            docQuillEditor.parentElement.querySelector('.ql-toolbar')?.classList.add('hidden');
        }
        docPointsContainer.classList.remove('hidden');
        addMorePointsBtn.classList.remove('hidden'); // Always allow more points for the list
        docContentLabel.innerText = 'Regler/Punkter';

        docPointsContainer.innerHTML = '<p class="text-sm text-muted">Henter punkter...</p>';

        try {
            // Fetch ALL points for this type to allow batch editing
            const collectionRef = collection(db, 'documents', 'retningslinjer', 'items');
            const q = query(
                collectionRef,
                where('type', '==', currentRetningslinjeType),
                orderBy('date', 'desc') // Or some other order
            );
            const snapshot = await getDocs(q);

            docPointsContainer.innerHTML = '';
            if (!snapshot.empty) {
                // Sort by something if needed? Let's just use the order they come in or by date
                snapshot.docs.forEach(docSnap => {
                    addDocPointInput(docSnap.data().content);
                });
            }
            // Always add one empty at the end
            addDocPointInput();

        } catch (error) {
            console.error("Error loading points for batch edit:", error);
            docPointsContainer.innerHTML = '';
            addDocPointInput();
        }

        docEntryNameInput.required = false;
        docEntryDateInput.required = false;
        docEntryContentInput.required = false;
    } else if (isVedtekter) {
        // Simple editor for Vedtekter
        docEntryTypeGroup.classList.add('hidden');
        docEntryNameGroup.classList.add('hidden');
        docEntryDateGroup.classList.add('hidden');
        docPointsContainer.classList.add('hidden');
        addMorePointsBtn.classList.add('hidden');

        if (quill) {
            docEntryContentInput.classList.add('hidden');
            docContentHint.classList.add('hidden');
            if (docRichTextHint) docRichTextHint.classList.remove('hidden');
            if (docQuillEditor) {
                docQuillEditor.classList.remove('hidden');
                const toolbar = docQuillEditor.parentElement.querySelector('.ql-toolbar');
                if (toolbar) toolbar.classList.remove('hidden');
                docQuillEditor.style.display = 'block';
            }
        }
        docEntryContentInput.required = false;
        docEntryNameInput.required = false;
        docEntryDateInput.required = false;
    } else {
        // Standard Title/Date fields
        docEntryTypeGroup.classList.add('hidden');
        docEntryNameGroup.classList.remove('hidden');
        docEntryDateGroup.classList.remove('hidden');
        docPointsContainer.classList.add('hidden');
        addMorePointsBtn.classList.add('hidden');

        if (isReferatEllerVedtekt && quill) {
            // Rich Text for Referater/Vedtekter
            docEntryContentInput.classList.add('hidden');
            docContentHint.classList.add('hidden');
            if (docRichTextHint) docRichTextHint.classList.remove('hidden');
            if (docQuillEditor) {
                docQuillEditor.classList.remove('hidden');
                // Ensure toolbar is visible
                const toolbar = docQuillEditor.parentElement.querySelector('.ql-toolbar');
                if (toolbar) toolbar.classList.remove('hidden');
                docQuillEditor.style.display = 'block';
            }
            docEntryContentInput.required = false;
        } else {
            // Normal fallback (Guidelines etc)
            docEntryContentInput.classList.remove('hidden');
            docContentHint.classList.remove('hidden');
            if (docRichTextHint) docRichTextHint.classList.add('hidden');
            if (docQuillEditor) {
                docQuillEditor.classList.add('hidden');
                const toolbar = docQuillEditor.parentElement.querySelector('.ql-toolbar');
                if (toolbar) toolbar.classList.add('hidden');
            }
            docEntryContentInput.required = true;
        }

        docContentLabel.innerText = 'Innhold';
        docEntryNameInput.required = true;
        docEntryDateInput.required = true;
    }

    if (data && !isRetningslinje) {
        if (!isVedtekter) {
            docEntryNameInput.value = data.name || '';
            docEntryDateInput.value = data.date || '';
        }
        if (isReferatEllerVedtekt && quill) {
            quill.root.innerHTML = data.content || '';
        } else {
            docEntryContentInput.value = data.content || '';
        }
        if (data.type) docEntryTypeInput.value = data.type;
    } else if (!isRetningslinje) {
        docEntryDateInput.value = new Date().toISOString().split('T')[0];
    }

    // Set default type if retningslinjer
    if (isRetningslinje) {
        docEntryTypeInput.value = currentRetningslinjeType;
        if (docTypeDisplay) {
            docTypeDisplay.innerText = currentRetningslinjeType;
            docTypeDisplay.classList.remove('hidden');
        }
        if (docEntryTypeInput) docEntryTypeInput.classList.add('hidden');
    } else {
        if (docTypeDisplay) docTypeDisplay.classList.add('hidden');
        if (docEntryTypeInput) docEntryTypeInput.classList.remove('hidden');
    }

    if (id && !isRetningslinje) deleteDocEntryBtn.classList.remove('hidden');
    else deleteDocEntryBtn.classList.add('hidden');

    toggleModal(docEntryModal, true);
}

function addDocPointInput(value = '') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input doc-point-input';
    input.placeholder = 'Skriv punktet her...';
    input.value = value;
    docPointsContainer.appendChild(input);
    input.focus();
}

if (addMorePointsBtn) {
    addMorePointsBtn.addEventListener('click', () => addDocPointInput());
}

function closeDocEntryModal() {
    toggleModal(docEntryModal, false);
}

async function handleDocEntrySubmit(e) {
    e.preventDefault();

    const id = docEntryIdInput.value;
    const category = docEntryCategoryInput.value;
    const isRetningslinje = category === 'retningslinjer';
    const isReferatEllerVedtekt = category === 'referater' || category === 'vedtekter';

    let points = [];
    if (isRetningslinje) {
        points = Array.from(document.querySelectorAll('.doc-point-input')).map(i => i.value.trim()).filter(v => v !== '');
    } else if (isReferatEllerVedtekt && quill) {
        // For Referater and Vedtekter, we use the rich text content
        const html = quill.root.innerHTML.trim();
        // Check if there is actual content (not just empty tags)
        if (quill.getText().trim().length > 0) {
            points = [html];
        } else {
            points = []; // Will trigger validation below
        }
    } else {
        const val = docEntryContentInput.value.trim();
        if (val) points = [val];
    }

    if (points.length === 0 && !isRetningslinje) {
        showCustomAlert("Fyll ut innhold.");
        return;
    }
    const isVedtekter = category === 'vedtekter';
    if (!isRetningslinje && !isVedtekter && (!docEntryNameInput.value.trim() || !docEntryDateInput.value)) {
        showCustomAlert("Fyll ut tittel og dato.");
        return;
    }

    const originalText = saveDocEntryBtn.textContent;
    saveDocEntryBtn.disabled = true;
    saveDocEntryBtn.innerText = 'Lagrer...';

    try {
        const baseData = {
            category: category,
            updatedAt: serverTimestamp(),
            updatedBy: authState.user.uid
        };

        if (isRetningslinje) {
            // BATCH SYNC for Retningslinjer
            const type = docEntryTypeInput.value;
            const collectionRef = collection(db, 'documents', 'retningslinjer', 'items');

            // 1. Fetch ALL existing for this type
            const q = query(collectionRef, where('type', '==', type));
            const snapshot = await getDocs(q);

            // 2. Delete ALL existing
            const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
            await Promise.all(deletePromises);

            // 3. Add ALL new
            const addPromises = points.map((content, index) => {
                return addDoc(collectionRef, {
                    ...baseData,
                    type: type,
                    name: 'Retningslinje',
                    date: new Date().toISOString().split('T')[0],
                    content: content,
                    order: index, // Maintain order
                    createdAt: serverTimestamp()
                });
            });
            await Promise.all(addPromises);

        } else if (id) {
            // Editing one existing non-retningslinje doc
            const docData = {
                ...baseData,
                content: points[0]
            };
            if (category !== 'vedtekter') {
                docData.name = docEntryNameInput.value;
                docData.date = docEntryDateInput.value;
            } else {
                docData.name = 'Vedtekter';
                docData.date = new Date().toISOString().split('T')[0];
            }
            await setDoc(doc(db, 'documents', category, 'items', id), docData, { merge: true });
        } else {
            // Adding new non-retningslinje doc(s)
            const collectionRef = collection(db, 'documents', category, 'items');
            const promises = points.map(content => {
                const docData = {
                    ...baseData,
                    content: content,
                    createdAt: serverTimestamp()
                };
                if (category === 'vedtekter') {
                    docData.name = 'Vedtekter';
                    docData.date = new Date().toISOString().split('T')[0];
                } else {
                    docData.name = docEntryNameInput.value;
                    docData.date = docEntryDateInput.value;
                }
                return addDoc(collectionRef, docData);
            });
            await Promise.all(promises);
        }

        showCustomAlert(isRetningslinje ? "Liste oppdatert!" : "Dokument lagret!");
        closeDocEntryModal();
        loadDocumentsList(category);
    } catch (error) {
        console.error("Error saving document:", error);
        showCustomAlert("Feil under lagring: " + error.message);
    } finally {
        saveDocEntryBtn.textContent = originalText;
        saveDocEntryBtn.disabled = false;
    }
}

// --- DOCUMENTS LOGIC (UPDATED PATHS) ---
// ... (rest of the file updates for paths)

async function handleDeleteDocEntry() {
    const id = docEntryIdInput.value;
    const category = docEntryCategoryInput.value; // Need category to delete
    if (!id) return;

    const confirmed = await showCustomConfirm("Er du sikker på at du vil slette dette dokumentet?");
    if (!confirmed) return;

    try {
        // Updated path
        await deleteDoc(doc(db, 'documents', category, 'items', id));
        showCustomAlert("Dokument slettet.");
        closeDocEntryModal();
        loadDocumentsList(currentDocCategory);
    } catch (error) {
        console.error("Error deleting document:", error);
        showCustomAlert("Kunne ikke slette: " + error.message);
    }
}

// --- TOS LOGIC ---

function checkTOSAcceptance(profile) {
    if (!tosModal) return;

    // If logged in but hasn't accepted terms
    if (authState.user && !profile?.termsAccepted) {
        toggleModal(tosModal, true);
    } else {
        // Hide if accepted or not logged in
        if (tosModal && !tosModal.classList.contains('hidden')) {
            toggleModal(tosModal, false);
        }
    }
}

if (tosCheckbox && acceptTosBtn) {
    tosCheckbox.addEventListener('change', () => {
        acceptTosBtn.disabled = !tosCheckbox.checked;
    });

    acceptTosBtn.addEventListener('click', async () => {
        if (!authState.user) return;

        const originalText = acceptTosBtn.textContent;
        acceptTosBtn.textContent = 'Lagrer...';
        acceptTosBtn.disabled = true;

        try {
            await setDoc(doc(db, 'users', authState.user.uid), {
                termsAccepted: true,
                termsAcceptedAt: serverTimestamp()
            }, { merge: true });

            // Update local state immediately
            if (authState.profile) {
                authState.profile.termsAccepted = true;
            }

            toggleModal(tosModal, false);

            // If on login page, redirect now
            if (window.location.pathname.endsWith('/login.html')) {
                window.location.href = 'medlem.html';
            } else {
                showCustomAlert("Takk! Du har nå full tilgang til Leirefolket.");
                updateUI(authState.user, authState.profile);
            }
        } catch (error) {
            console.error("Error accepting TOS:", error);
            showCustomAlert("Det oppsto en feil under lagring. Prøv igjen.");
            acceptTosBtn.textContent = originalText;
            acceptTosBtn.disabled = false;
        }
    });
}

if (declineTosBtn) {
    declineTosBtn.addEventListener('click', async () => {
        const confirmed = await showCustomConfirm("Hvis du ikke godtar vilkårene, kan du ikke bruke våre tjenester. Vil du logge ut?");
        if (confirmed) {
            await signOut(auth);
            toggleModal(tosModal, false);

            // Ensure they are on login page or redirected there
            if (!window.location.pathname.endsWith('/login.html')) {
                window.location.href = 'login.html';
            }
        }
    });
}
// --- PUBLISHING MODALS ---
newPostBtn?.addEventListener('click', () => toggleModal(postModal, true));
closePostModalBtn?.addEventListener('click', () => toggleModal(postModal, false));
cancelPostModalBtn?.addEventListener('click', () => toggleModal(postModal, false));
postModalOverlay?.addEventListener('click', () => toggleModal(postModal, false));

newEventBtn?.addEventListener('click', () => toggleModal(eventModal, true));
closeEventModalBtn?.addEventListener('click', () => toggleModal(eventModal, false));
cancelEventModalBtn?.addEventListener('click', () => toggleModal(eventModal, false));
eventModalOverlay?.addEventListener('click', () => toggleModal(eventModal, false));





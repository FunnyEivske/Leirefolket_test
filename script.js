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
    orderBy,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL STATE --- //
let profileImageOffset = 0;
let resetProfileAdjustment = null;

export let authState = {
    user: null,
    role: null, // 'member', 'admin', eller null
    profile: null // { displayName: '...', photoURL: '...' }
};

let profileUnsubscribe = null;
let galleryUnsubscribe = null; // Listener for user's own gallery
let notificationsUnsubscribe = null;
let currentAdminSelections = new Set();
let sidebarMembersLimit = 5; // Initial limit for sidebar display

// Global users cache for tagging/mentions
export let allUsersCache = [];
let usersLoadPromise = null;

// Secondary Auth for admin user management (to avoid logging out current admin)
let secondaryApp, secondaryAuth;

// Document and Cropping state
let currentVedtektId = null;
let currentVedtektData = null;
let currentCropCallback = null;
let currentCropOffset = 0;
let currentCropReset = null;

// Helper functions for page identification
function isMemberPage() {
    const path = window.location.pathname;
    return path.endsWith('/medlem.html') || path.endsWith('/medlem') || path.endsWith('/medlem/');
}

function isLoginPage() {
    const path = window.location.pathname;
    return path.endsWith('/login.html') || path.endsWith('/login') || path.endsWith('/login/');
}

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

// --- UI-ELEMENTER (Initialiseres i initUI()) ---
let loginForm, forgotPasswordBtn, loginError, loginSuccess;
let mobileMenuButton, mobileMenu, dropdownLogoutButton, mobileLogoutButton;
let loginLink, memberLink, logoutButton, mobileLoginLink, mobileMemberLink;
let profileName, profileRoleText, profileImg, openProfileModal, profileModal, profileModalOverlay, closeProfileModalButton;
let profileForm, displayNameInput, profileImageFileInput, saveProfileButton, profileSaveStatus;
let memberDurationValue, galleryCountValue;
let uploadGalleryBtn, uploadModal, uploadModalOverlay, closeUploadModalBtn, uploadForm, uploadFilesInput, uploadDropZone, pendingUploadsContainer, uploadActions, confirmUploadBtn, modalGalleryContainer, dashboardGalleryPreview;
let imageLightbox, lightboxOverlay, lightboxImg, lightboxDescription, closeLightboxBtn;
let sidebarMembersList;
let adminPublishCard, publishCardTitle, newPostBtn, newEventBtn, adminPublishSeparator, adminToolsCard, adminGalleryBtn, adminTriggerContainer, openAdminControlBtn;
let postModal, postModalOverlay, closePostModalBtn, cancelPostModalBtn;
let universalCropModal, universalCropOverlay, closeUniversalCropBtn, cancelUniversalCropBtn, applyUniversalCropBtn, modalCropImage, modalCropViewport, modalCropPreviewWrapper;
let eventModal, eventModalOverlay, closeEventModalBtn, cancelEventModalBtn;
let adminImageModal, adminImageModalOverlay, closeAdminModalBtn, cancelAdminModalBtn, saveAdminSelectionBtn, adminUserList, adminModalTitle;
let adminStatusBtn, adminToolsHeader, adminToolsContent, adminToolsChevron, adminStatusModal, adminStatusModalOverlay, closeStatusModalBtn, cancelStatusModalBtn, saveStatusBtn, workshopCustomStatusDisplay, workshopHoursDisplay, customStatusInput, openingDayInputs;
let adminMembersBtn, createUserForm, createUserBtn, editUserIdInput, userMemberSinceInput, userOrganizationRoleInput;
let adminMembersModal, adminMembersModalOverlay, closeMembersModalBtn, closeMembersFooterBtn, adminMembersList, tabActiveMembers, tabPendingDeletions, tabArchive, tabAddMember, activeMembersSection, pendingDeletionsSection, archiveSection, addMemberSection, adminPendingList, adminArchiveList, adminSoftDeleteBtn;
let adminControlModal, adminControlModalOverlay, closeAdminControlModalBtn, closeAdminControlFooterBtn, adminPanelGalleryBtn, adminPanelStatusBtn, adminPanelMembersBtn;
let expandAllUsersBtn, collapseAllUsersBtn, activeImagesGrid, activeImageCount;
let tosModal, tosCheckbox, acceptTosBtn, declineTosBtn;
let messageModal, messageModalText, messageModalClose, messageModalOverlay;
let confirmModal, confirmModalText, confirmModalOk, confirmModalCancel, confirmModalOverlay;
let openDocumentsBtn, documentsModal, documentsModalOverlay, closeDocumentsModalBtn, closeDocumentsFooterBtn, btnReferater, btnRetningslinjer, btnVedtekter, documentsModalTitle, retningslinjerTabs, tabFire, tabGlaze, tabWorkshop, documentsListContainer, adminAddDocBtn;

let docEntryModal, docEntryModalOverlay, closeDocEntryModalBtn, cancelDocEntryModalBtn, docEntryForm, docEntryIdInput, docEntryCategoryInput, docEntryNameInput, docEntryDateInput, docEntryContentInput, saveDocEntryBtn, deleteDocEntryBtn, docEntryTitle, docEntryTypeGroup, docEntryTypeInput, docTypeDisplay, docEntryNameGroup, docEntryDateGroup, docPointsContainer, addMorePointsBtn, docContentHint, docContentLabel, docQuillEditor, docRichTextHint;

function initUI() {
    console.log("Initialiserer UI-elementer...");
    loginForm = document.getElementById('login-form');
    forgotPasswordBtn = document.getElementById('forgot-password-btn');
    loginError = document.getElementById('login-error');
    loginSuccess = document.getElementById('login-success');
    mobileMenuButton = document.getElementById('mobile-menu-button');
    mobileMenu = document.getElementById('mobile-menu');
    dropdownLogoutButton = document.getElementById('dropdown-logout-button');
    mobileLogoutButton = document.getElementById('mobile-logout-button');
    loginLink = document.getElementById('login-link');
    memberLink = document.getElementById('member-link');
    logoutButton = document.getElementById('logout-button');
    mobileLoginLink = document.getElementById('mobile-login-link');
    mobileMemberLink = document.getElementById('mobile-member-link');
    profileName = document.getElementById('profile-name');
    profileRoleText = document.getElementById('profile-role-text');
    profileImg = document.getElementById('profile-img');
    openProfileModal = document.getElementById('open-profile-modal');
    profileModal = document.getElementById('profile-modal');
    profileModalOverlay = document.getElementById('profile-modal-overlay');
    closeProfileModalButton = document.getElementById('close-profile-modal');
    profileForm = document.getElementById('profile-form');
    displayNameInput = document.getElementById('display-name-input');
    profileImageFileInput = document.getElementById('profile-image-file-input');
    saveProfileButton = document.getElementById('save-profile-button');
    profileSaveStatus = document.getElementById('profile-save-status');
    memberDurationValue = document.getElementById('member-duration-value');
    galleryCountValue = document.getElementById('gallery-count-value');
    uploadGalleryBtn = document.getElementById('upload-gallery-btn');
    uploadModal = document.getElementById('upload-modal');
    uploadModalOverlay = document.getElementById('upload-modal-overlay');
    closeUploadModalBtn = document.getElementById('close-upload-modal');
    uploadForm = document.getElementById('upload-form');
    uploadFilesInput = document.getElementById('upload-files-input');
    uploadDropZone = document.getElementById('upload-drop-zone');
    pendingUploadsContainer = document.getElementById('pending-uploads-container');
    uploadActions = document.getElementById('upload-actions');
    confirmUploadBtn = document.getElementById('confirm-upload-btn');
    modalGalleryContainer = document.getElementById('modal-gallery-container');
    dashboardGalleryPreview = document.getElementById('dashboard-gallery-preview');
    imageLightbox = document.getElementById('image-lightbox');
    lightboxOverlay = document.getElementById('lightbox-overlay');
    lightboxImg = document.getElementById('lightbox-img');
    lightboxDescription = document.getElementById('lightbox-description');
    closeLightboxBtn = document.getElementById('close-lightbox');
    sidebarMembersList = document.getElementById('sidebar-members-list');
    adminPublishCard = document.getElementById('admin-publish-card');
    publishCardTitle = document.getElementById('publish-card-title');
    newPostBtn = document.getElementById('new-post-btn');
    newEventBtn = document.getElementById('new-event-btn');
    adminPublishSeparator = document.getElementById('admin-publish-separator');
    adminToolsCard = document.getElementById('admin-tools-card');
    adminGalleryBtn = document.getElementById('admin-gallery-btn');
    adminTriggerContainer = document.getElementById('admin-trigger-container');
    openAdminControlBtn = document.getElementById('open-admin-control-btn');
    postModal = document.getElementById('post-modal');
    postModalOverlay = document.getElementById('post-modal-overlay');
    closePostModalBtn = document.getElementById('close-post-modal');
    cancelPostModalBtn = document.getElementById('cancel-post-modal');
    universalCropModal = document.getElementById('universal-crop-modal');
    universalCropOverlay = document.getElementById('universal-crop-overlay');
    closeUniversalCropBtn = document.getElementById('close-universal-crop');
    cancelUniversalCropBtn = document.getElementById('cancel-universal-crop');
    applyUniversalCropBtn = document.getElementById('apply-universal-crop');
    modalCropImage = document.getElementById('modal-crop-image');
    modalCropViewport = document.getElementById('modal-crop-viewport');
    modalCropPreviewWrapper = document.getElementById('modal-crop-preview-wrapper');
    eventModal = document.getElementById('event-modal');
    eventModalOverlay = document.getElementById('event-modal-overlay');
    closeEventModalBtn = document.getElementById('close-event-modal');
    cancelEventModalBtn = document.getElementById('cancel-event-modal');
    adminImageModal = document.getElementById('admin-image-modal');
    adminImageModalOverlay = document.getElementById('admin-image-modal-overlay');
    closeAdminModalBtn = document.getElementById('close-admin-modal');
    cancelAdminModalBtn = document.getElementById('cancel-admin-modal');
    saveAdminSelectionBtn = document.getElementById('save-admin-selection');
    adminUserList = document.getElementById('admin-user-list');
    adminModalTitle = document.getElementById('admin-modal-title');
    adminStatusBtn = document.getElementById('admin-status-btn');
    adminToolsHeader = document.getElementById('admin-tools-header');
    adminToolsContent = document.getElementById('admin-tools-content');
    adminToolsChevron = document.getElementById('admin-tools-chevron');
    adminStatusModal = document.getElementById('admin-status-modal');
    adminStatusModalOverlay = document.getElementById('admin-status-modal-overlay');
    closeStatusModalBtn = document.getElementById('close-status-modal');
    cancelStatusModalBtn = document.getElementById('cancel-status-modal');
    saveStatusBtn = document.getElementById('save-status-btn');
    workshopCustomStatusDisplay = document.getElementById('workshop-custom-status');
    workshopHoursDisplay = document.getElementById('workshop-hours-display');
    customStatusInput = document.getElementById('custom-status-input');
    openingDayInputs = document.querySelectorAll('.opening-day-input');
    adminMembersBtn = document.getElementById('admin-members-btn');
    createUserForm = document.getElementById('admin-create-user-form');
    createUserBtn = document.getElementById('create-user-btn');
    editUserIdInput = document.getElementById('edit-user-id');
    userMemberSinceInput = document.getElementById('new-user-member-since');
    userOrganizationRoleInput = document.getElementById('new-user-organization-role');
    adminMembersModal = document.getElementById('admin-members-modal');
    adminMembersModalOverlay = document.getElementById('admin-members-modal-overlay');
    closeMembersModalBtn = document.getElementById('close-members-modal');
    closeMembersFooterBtn = document.getElementById('close-members-footer-btn');
    adminMembersList = document.getElementById('admin-members-list');
    tabActiveMembers = document.getElementById('tab-active-members');
    tabPendingDeletions = document.getElementById('tab-pending-deletions');
    tabArchive = document.getElementById('tab-archive');
    tabAddMember = document.getElementById('tab-add-member');
    activeMembersSection = document.getElementById('active-members-section');
    pendingDeletionsSection = document.getElementById('pending-deletions-section');
    archiveSection = document.getElementById('archive-section');
    addMemberSection = document.getElementById('add-member-section');
    adminPendingList = document.getElementById('admin-pending-list');
    adminArchiveList = document.getElementById('admin-archive-list');
    adminSoftDeleteBtn = document.getElementById('admin-soft-delete-btn');
    adminControlModal = document.getElementById('admin-control-modal');
    adminControlModalOverlay = document.getElementById('admin-control-modal-overlay');
    closeAdminControlModalBtn = document.getElementById('close-admin-control-modal');
    closeAdminControlFooterBtn = document.getElementById('close-admin-control-footer');
    adminPanelGalleryBtn = document.getElementById('admin-panel-gallery-btn');
    adminPanelStatusBtn = document.getElementById('admin-panel-status-btn');
    adminPanelMembersBtn = document.getElementById('admin-panel-members-btn');
    expandAllUsersBtn = document.getElementById('expand-all-users');
    collapseAllUsersBtn = document.getElementById('collapse-all-users');
    activeImagesGrid = document.getElementById('active-images-grid');
    activeImageCount = document.getElementById('active-image-count');
    tosModal = document.getElementById('tos-modal');
    tosCheckbox = document.getElementById('tos-checkbox');
    acceptTosBtn = document.getElementById('accept-tos-btn');
    declineTosBtn = document.getElementById('decline-tos-btn');
    messageModal = document.getElementById('message-modal');
    messageModalText = document.getElementById('message-modal-text');
    messageModalClose = document.getElementById('message-modal-close');
    messageModalOverlay = document.getElementById('message-modal-overlay');

    confirmModal = document.getElementById('confirm-modal');
    confirmModalText = document.getElementById('confirm-modal-text');
    confirmModalOk = document.getElementById('confirm-modal-ok');
    confirmModalCancel = document.getElementById('confirm-modal-cancel');
    confirmModalOverlay = document.getElementById('confirm-modal-overlay');
    openDocumentsBtn = document.getElementById('open-documents-btn');
    documentsModal = document.getElementById('view-documents-modal');
    documentsModalOverlay = document.getElementById('view-documents-modal-overlay');
    closeDocumentsModalBtn = document.getElementById('close-documents-modal');
    closeDocumentsFooterBtn = document.getElementById('close-documents-footer-btn');
    btnReferater = document.getElementById('btn-referater');
    btnRetningslinjer = document.getElementById('btn-retningslinjer');
    btnVedtekter = document.getElementById('btn-vedtekter');
    documentsModalTitle = document.getElementById('documents-modal-title');
    retningslinjerTabs = document.getElementById('retningslinjer-tabs');
    tabFire = document.getElementById('tab-fire');
    tabGlaze = document.getElementById('tab-glaze');
    tabWorkshop = document.getElementById('tab-workshop');
    documentsListContainer = document.getElementById('documents-list-container');
    adminAddDocBtn = document.getElementById('admin-add-doc-btn');
    docEntryModal = document.getElementById('doc-entry-modal');
    docEntryModalOverlay = document.getElementById('doc-entry-modal-overlay');
    closeDocEntryModalBtn = document.getElementById('close-doc-entry-modal');
    cancelDocEntryModalBtn = document.getElementById('cancel-doc-entry-modal');
    docEntryForm = document.getElementById('doc-entry-form');
    docEntryIdInput = document.getElementById('doc-entry-id');
    docEntryCategoryInput = document.getElementById('doc-entry-category');
    docEntryNameInput = document.getElementById('doc-entry-name');
    docEntryDateInput = document.getElementById('doc-entry-date');
    docEntryContentInput = document.getElementById('doc-entry-content');
    saveDocEntryBtn = document.getElementById('save-doc-entry-btn');
    deleteDocEntryBtn = document.getElementById('delete-doc-entry-btn');
    docEntryTitle = document.getElementById('doc-entry-title');
    docEntryTypeGroup = document.getElementById('doc-entry-type-group');
    docEntryTypeInput = document.getElementById('doc-entry-type');
    docTypeDisplay = document.getElementById('doc-type-display');
    docEntryNameGroup = document.getElementById('doc-entry-name-group');
    docEntryDateGroup = document.getElementById('doc-entry-date-group');
    docPointsContainer = document.getElementById('doc-points-container');
    addMorePointsBtn = document.getElementById('add-more-points-btn');
    docContentHint = document.getElementById('doc-content-hint');
    docContentLabel = document.getElementById('doc-content-label');
    docQuillEditor = document.getElementById('doc-quill-editor');
    docRichTextHint = document.getElementById('doc-rich-text-hint');

    attachEventListeners();
    
    // Initialize secondary if not already done
    try {
        secondaryApp = initializeApp(firebaseConfig, "Secondary");
    } catch (e) {
        secondaryApp = getApp("Secondary");
    }
    secondaryAuth = getAuth(secondaryApp);
}

function attachEventListeners() {
    console.log("Kobler til event-lyttere...");
    
    if (loginForm) {
        console.log("Login-skjema funnet, kobler til submit.");
        loginForm.addEventListener('submit', handleLogin);
    }
    if (forgotPasswordBtn) forgotPasswordBtn.addEventListener('click', handleForgotPassword);
    if (dropdownLogoutButton) dropdownLogoutButton.addEventListener('click', handleLogout);
    if (mobileLogoutButton) mobileLogoutButton.addEventListener('click', handleLogout);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu?.classList.remove('hidden');
            const isOpen = mobileMenu?.classList.toggle('show');
            updateScrollLock();
            mobileMenuButton.innerHTML = isOpen ? `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            ` : `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 6h16M4 12h16m-7 6h7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
        });
        mobileMenu?.querySelectorAll('a, button').forEach(link => {
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

    if (openProfileModal) openProfileModal.addEventListener('click', () => {
        if (displayNameInput) displayNameInput.value = authState.profile?.displayName || '';
        toggleModal(profileModal, true);
    });
    closeProfileModalButton?.addEventListener('click', () => toggleModal(profileModal, false));
    profileModalOverlay?.addEventListener('click', () => toggleModal(profileModal, false));
    profileForm?.addEventListener('submit', handleProfileSave);

    uploadGalleryBtn?.addEventListener('click', openUploadModal);
    uploadForm?.addEventListener('submit', handleGalleryUploadSubmit);
    closeUploadModalBtn?.addEventListener('click', closeUploadModal);
    uploadModalOverlay?.addEventListener('click', closeUploadModal);

    closeLightboxBtn?.addEventListener('click', closeLightbox);
    lightboxOverlay?.addEventListener('click', closeLightbox);

    closeAdminModalBtn?.addEventListener('click', () => toggleModal(adminImageModal, false));
    cancelAdminModalBtn?.addEventListener('click', () => toggleModal(adminImageModal, false));
    saveAdminSelectionBtn?.addEventListener('click', saveAdminSelection);
    adminImageModalOverlay?.addEventListener('click', () => toggleModal(adminImageModal, false));

    closeStatusModalBtn?.addEventListener('click', () => toggleModal(adminStatusModal, false));
    cancelStatusModalBtn?.addEventListener('click', () => toggleModal(adminStatusModal, false));
    adminStatusModalOverlay?.addEventListener('click', () => toggleModal(adminStatusModal, false));
    saveStatusBtn?.addEventListener('click', saveWorkshopStatus);

    closeMembersModalBtn?.addEventListener('click', closeMembersModal);
    closeMembersFooterBtn?.addEventListener('click', closeMembersModal);
    adminMembersModalOverlay?.addEventListener('click', closeMembersModal);

    setupMembersTabs();

    closeDocumentsModalBtn?.addEventListener('click', closeDocumentsModal);
    closeDocumentsFooterBtn?.addEventListener('click', closeDocumentsModal);
    documentsModalOverlay?.addEventListener('click', closeDocumentsModal);

    btnReferater?.addEventListener('click', () => openDocumentsModal('referater'));
    btnRetningslinjer?.addEventListener('click', () => openDocumentsModal('retningslinjer'));
    btnVedtekter?.addEventListener('click', () => openDocumentsModal('vedtekter'));

    setupRetningslinjerTabs();

    adminAddDocBtn?.addEventListener('click', () => openDocEntryModal());
    closeDocEntryModalBtn?.addEventListener('click', closeDocEntryModal);
    cancelDocEntryModalBtn?.addEventListener('click', closeDocEntryModal);
    docEntryModalOverlay?.addEventListener('click', closeDocEntryModal);
    docEntryForm?.addEventListener('submit', handleDocEntrySubmit);
    deleteDocEntryBtn?.addEventListener('click', handleDeleteDocEntry);

    openAdminControlBtn?.addEventListener('click', () => toggleModal(adminControlModal, true));
    closeAdminControlModalBtn?.addEventListener('click', () => toggleModal(adminControlModal, false));
    closeAdminControlFooterBtn?.addEventListener('click', () => toggleModal(adminControlModal, false));
    adminControlModalOverlay?.addEventListener('click', () => toggleModal(adminControlModal, false));

    adminPanelGalleryBtn?.addEventListener('click', () => { toggleModal(adminControlModal, false); openAdminModal(); });
    adminPanelStatusBtn?.addEventListener('click', () => { toggleModal(adminControlModal, false); openStatusModal(); });
    adminPanelMembersBtn?.addEventListener('click', () => { toggleModal(adminControlModal, false); openMembersModal(); });

    expandAllUsersBtn?.addEventListener('click', () => {
        document.querySelectorAll('.user-group').forEach(group => {
            if (!group.classList.contains('expanded')) {
                group.querySelector('.user-group-header').click();
            }
        });
    });

    collapseAllUsersBtn?.addEventListener('click', () => {
        document.querySelectorAll('.user-group').forEach(group => {
            group.classList.remove('expanded');
        });
    });

    if (declineTosBtn) {
        declineTosBtn.addEventListener('click', async () => {
            const confirmed = await showCustomConfirm("Hvis du ikke godtar vilkårene, kan du ikke bruke våre tjenester. Vil kanskje du logge ut?");
            if (confirmed) {
                await signOut(auth);
                toggleModal(tosModal, false);
                if (!window.location.pathname.endsWith('/login.html')) window.location.href = 'login.html';
            }
        });
    }

    newPostBtn?.addEventListener('click', () => toggleModal(postModal, true));
    closePostModalBtn?.addEventListener('click', () => toggleModal(postModal, false));
    cancelPostModalBtn?.addEventListener('click', () => toggleModal(postModal, false));
    postModalOverlay?.addEventListener('click', () => toggleModal(postModal, false));

    newEventBtn?.addEventListener('click', () => toggleModal(eventModal, true));
    closeEventModalBtn?.addEventListener('click', () => toggleModal(eventModal, false));
    cancelEventModalBtn?.addEventListener('click', () => toggleModal(eventModal, false));
    eventModalOverlay?.addEventListener('click', () => toggleModal(eventModal, false));

    // Upload zones
    resetProfileAdjustment = setupUploadZone('profile-image-file-input', 'profile-upload-drop-zone', 'profile-image-preview', 'profile-preview-container');
    const profileInput = document.getElementById('profile-image-file-input');
    if (profileInput) {
        profileInput.addEventListener('cropComplete', (e) => {
            profileImageOffset = e.detail.offset;
        });
    }

    // Gallery upload zone
    setupUploadZone('upload-files-input', 'upload-drop-zone', null, null, true);

    // Universal Crop Modal Listeners
    if (applyUniversalCropBtn) {
        applyUniversalCropBtn.addEventListener('click', () => {
            if (currentCropCallback) {
                currentCropCallback(currentCropOffset);
            }
            toggleModal(universalCropModal, false);
        });
    }
    if (cancelUniversalCropBtn || closeUniversalCropBtn) {
        [cancelUniversalCropBtn, closeUniversalCropBtn].forEach(btn => {
            if (btn) btn.addEventListener('click', () => toggleModal(universalCropModal, false));
        });
    }
    if (universalCropOverlay) {
        universalCropOverlay.addEventListener('click', () => toggleModal(universalCropModal, false));
    }

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
                closeMembersModal();
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
}

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

// --- UNIVERSAL CROP MODAL LOGIC ---

export function openUniversalCropModal(file, aspectRatioClass, callback) {
    if (!file || !universalCropModal || !modalCropImage) return;

    currentCropCallback = callback;
    currentCropOffset = 0;

    // Set aspect ratio class
    modalCropViewport.className = 'crop-viewport ' + aspectRatioClass;

    const reader = new FileReader();
    reader.onload = (e) => {
        modalCropImage.src = e.target.result;
        toggleModal(universalCropModal, true);

        // Initialize adjustment for the modal
        // We use a small timeout to ensure modal is visible and dimensions are correct
        setTimeout(() => {
            currentCropReset = setupImageAdjustment('modal-crop-preview-wrapper', 'modal-crop-image', (offset) => {
                currentCropOffset = offset;
            });
            if (currentCropReset) currentCropReset(0);
        }, 300);
    };
    reader.readAsDataURL(file);
}
window.openUniversalCropModal = openUniversalCropModal;

// Modal button listeners removed from here and moved to attachEventListeners

// --- HJELPEFUNKSJONER ---

export function updateScrollLock() {
    const allModals = document.querySelectorAll('.lightbox, .modal-container');
    const anyModalOpen = Array.from(allModals).some(m => {
        const style = window.getComputedStyle(m);
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
export function resizeAndConvertToBase64(file, maxWidth = 800) {
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

/**
 * Hjelpefunksjon for å sette opp en premium "opplastingssone".
 * Håndterer både klikk og drag-and-drop.
 */
export function setupUploadZone(inputId, dropZoneId, previewImgId, previewWrapperId, isMultiple = false) {
    const input = document.getElementById(inputId);
    const dropZone = document.getElementById(dropZoneId);
    const previewImg = previewImgId ? document.getElementById(previewImgId) : null;
    const previewWrapper = previewWrapperId ? document.getElementById(previewWrapperId) : null;

    if (!input || !dropZone) return null;

    let resetPreview = null;

    dropZone.addEventListener('click', (e) => {
        if (e.target !== input) {
            input.click();
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    const handleFiles = async (files) => {
        if (files.length > 0) {
            const allowedFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
            if (allowedFiles.length === 0) {
                showCustomAlert("Vennligst velg bilde(r) (JPG/PNG).");
                return;
            }

            if (isMultiple) {
                // Multi-upload handling (Gallery)
                const dataTransfer = new DataTransfer();
                allowedFiles.forEach(f => dataTransfer.items.add(f));
                input.files = dataTransfer.files;
                renderPendingUploads(input.files);
            } else {
                // Single-upload handling (Profile, Posts, Events)
                const file = allowedFiles[0];
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                input.files = dataTransfer.files;

                let aspectClass = 'square';
                if (previewWrapper) {
                    if (previewWrapper.classList.contains('banner')) aspectClass = 'banner';
                    if (previewWrapper.classList.contains('post')) aspectClass = 'post';
                }

                openUniversalCropModal(file, aspectClass, (offset) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (previewImg) previewImg.src = event.target.result;
                        if (previewWrapper) {
                            previewWrapper.classList.remove('hidden');
                            // Setup/Reset preview adjustment
                            if (!resetPreview) {
                                resetPreview = setupImageAdjustment(previewWrapperId, previewImgId, null, { readonly: true });
                            }
                            if (resetPreview) resetPreview(offset);
                        }
                    };
                    reader.readAsDataURL(file);
                    input.dataset.cropOffset = offset;
                    input.dispatchEvent(new CustomEvent('cropComplete', { detail: { offset } }));
                });
            }
        }
    };

    dropZone.addEventListener('drop', (e) => {
        handleFiles(e.dataTransfer.files);
    });

    input.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    return (offset) => {
        if (resetPreview) resetPreview(offset);
    };
}
window.setupUploadZone = setupUploadZone;

/**
 * Viser forhåndsvisning av flere filer som skal lastes opp (Galleriet)
 */
function renderPendingUploads(files) {
    if (!pendingUploadsContainer || !uploadActions || !uploadDropZone) return;

    pendingUploadsContainer.innerHTML = '';
    
    if (files.length > 0) {
        pendingUploadsContainer.classList.remove('hidden');
        uploadActions.classList.remove('hidden');
        uploadDropZone.classList.add('hidden');

        Array.from(files).forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const card = document.createElement('div');
                card.className = 'pending-upload-card';
                card.innerHTML = `
                    <div class="pending-preview-wrapper">
                        <img src="${e.target.result}" class="pending-preview">
                    </div>
                    <div class="pending-info">
                        <input type="text" class="form-input text-xs pending-description" placeholder="Legg til beskrivelse (valgfritt)">
                    </div>
                `;
                pendingUploadsContainer.appendChild(card);
            };
            reader.readAsDataURL(file);
        });
    } else {
        pendingUploadsContainer.classList.add('hidden');
        uploadActions.classList.add('hidden');
        uploadDropZone.classList.remove('hidden');
    }
}
window.setupUploadZone = setupUploadZone;

/**
 * Oppsett for dra-for-å-justere utsnitt (vertikal offset)
 */
export function setupImageAdjustment(previewWrapperId, previewImgId, onOffsetChange, options = {}) {
    const { readonly = false } = options;
    const wrapper = document.getElementById(previewWrapperId);
    if (!wrapper) return;

    const img = wrapper.querySelector('img');
    const viewport = wrapper.querySelector('.crop-viewport');
    const overlay = wrapper.querySelector('.crop-overlay');

    if (!wrapper || !img || !viewport) return;

    let isDragging = false;
    let startY = 0;
    let currentTopPercent = 0; // Top position of viewport in % of image height

    const updateUI = () => {
        const imgHeight = img.offsetHeight;
        const viewportHeight = viewport.offsetHeight;

        if (imgHeight === 0 || viewportHeight === 0) return;

        const maxTopPx = imgHeight - viewportHeight;
        const topPx = (currentTopPercent / 100) * imgHeight;
        const finalTopPx = Math.max(0, Math.min(topPx, maxTopPx));

        // Update viewport position relative to image
        viewport.style.top = `${finalTopPx}px`;

        // Update overlay mask (clip-path)
        const topPct = (finalTopPx / imgHeight) * 100;
        const bottomPct = ((finalTopPx + viewportHeight) / imgHeight) * 100;

        overlay.style.clipPath = `polygon(
            0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, 
            0% ${topPct}%, 100% ${topPct}%, 100% ${bottomPct}%, 0% ${bottomPct}%, 0% ${topPct}%
        )`;

        if (onOffsetChange) onOffsetChange(currentTopPercent);
    };

    const startDrag = (e) => {
        // Find if we clicked the viewport or something inside it
        if (!viewport.contains(e.target)) return;
        
        isDragging = true;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = viewport.getBoundingClientRect();
        startY = clientY - rect.top;
        document.body.style.cursor = 'grabbing';
        
        // Prevent scrolling while dragging on mobile
        if (e.type === 'touchstart') e.preventDefault();
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const imgRect = img.getBoundingClientRect();

        let newTopPx = clientY - imgRect.top - startY;
        const maxTopPx = img.offsetHeight - viewport.offsetHeight;
        newTopPx = Math.max(0, Math.min(newTopPx, maxTopPx));

        currentTopPercent = (newTopPx / img.offsetHeight) * 100;
        updateUI();
    };

    const endDrag = () => {
        isDragging = false;
        document.body.style.cursor = 'default';
    };

    if (!readonly) {
        viewport.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', doDrag);
        window.addEventListener('mouseup', endDrag);

        viewport.addEventListener('touchstart', startDrag, { passive: false });
        window.addEventListener('touchmove', doDrag, { passive: false });
        window.addEventListener('touchend', endDrag);
    } else {
        viewport.style.cursor = 'default';
        const hint = wrapper.querySelector('.crop-hint');
        if (hint) hint.classList.add('hidden');
    }

    // Initial setup when image loads
    img.onload = () => {
        setTimeout(updateUI, 100); // Small delay to ensure layout
    };

    // Reset function
    return (topPercent = 0) => {
        currentTopPercent = topPercent;
        updateUI();
    };
}
window.setupImageAdjustment = setupImageAdjustment;

/**
 * Universell beskjæring og komprimering basert på vertikal offset
 */
export async function cropAndCompressUniversal(file, topPercent, options = {}) {
    const {
        targetWidth = 1000,
        targetHeight = 400,
        quality = 0.8
    } = options;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                // The logic: 
                // topPercent is where the TOP of the viewport is relative to the image height.
                // We want to crop from that Y-coordinate.

                // First, imagine the image is resized to targetWidth.
                const scale = targetWidth / img.width;
                const scaledImgHeight = img.height * scale;

                // The source Y coordinate in original image pixels
                const sourceY = (topPercent / 100) * img.height;

                // The source height in original image pixels (maintaining aspect ratio)
                // targetHeight / targetWidth = sourceHeight / img.width
                const sourceHeight = (targetHeight / targetWidth) * img.width;

                ctx.drawImage(
                    img,
                    0, sourceY, img.width, sourceHeight, // Source rect
                    0, 0, targetWidth, targetHeight     // Target rect
                );

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
    });
}
window.cropAndCompressUniversal = cropAndCompressUniversal;

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
            
            // Start notifikasjons-lytter
            setupNotificationsListener(uid);
            // Pre-load brukere for tagging
            loadAllUsersForCache();
            
        } else {
            // Hvis dokumentet ikke finnes (ny bruker), sett standardverdier
            authState.profile = {
                displayName: authState.user?.email?.split('@')[0] || 'Medlem',
                photoURL: null,
                memberSince: serverTimestamp(),
                status: 'active'
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

// Laster alle brukere for @mention autocomplete (kjøres bare én gang, eller på initiativ)
async function loadAllUsersForCache() {
    if (usersLoadPromise) return usersLoadPromise;
    
    usersLoadPromise = (async () => {
        try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            allUsersCache = usersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).filter(user => user.status !== 'pending_deletion');
            return allUsersCache;
        } catch (error) {
            console.error("Feil ved lasting av brukere for tagging:", error);
            return [];
        }
    })();
    
    return usersLoadPromise;
}

export function getAllCachedUsers() {
    return allUsersCache || [];
}

// Funksjon for tagging.js for å hente filtrerte brukere
export async function getSearchableUsers(term) {
    if (!allUsersCache || allUsersCache.length === 0) {
        await loadAllUsersForCache();
    }
    
    const lowerTerm = term.toLowerCase().replace(/\s/g, '');
    return allUsersCache.filter(user => {
        if(!user.displayName) return false;
        const nameClean = user.displayName.toLowerCase().replace(/\s/g, '');
        return nameClean.includes(lowerTerm);
    }).slice(0, 5); // Return max 5 options
}

// Lytter på notifikasjoner for den innloggede brukeren
function setupNotificationsListener(uid) {
    if (notificationsUnsubscribe) notificationsUnsubscribe();
    if (!uid) return null;

    const notifRef = collection(db, `users/${uid}/notifications`);
    const q = query(notifRef, where("read", "==", false), orderBy("createdAt", "desc"));

    notificationsUnsubscribe = onSnapshot(q, (snapshot) => {
        const notifications = [];
        snapshot.forEach(doc => {
            notifications.push({ id: doc.id, ...doc.data() });
        });
        
        updateNotificationsUI(uid, notifications);
    }, (error) => {
        // Om vi mangler index får vi feil inntil linken i konsollen er klikket.
        console.warn("Notifications listener error (kan skyldes manglende index): ", error);
        // Fallback for å unngå total krasj
        const simpleQ = query(notifRef, where("read", "==", false));
        notificationsUnsubscribe = onSnapshot(simpleQ, (snap) => {
            const notifs = [];
            snap.forEach(d => {
                const data = d.data();
                notifs.push({ id: d.id, ...data });
            });
            notifs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
            updateNotificationsUI(uid, notifs);
        }, (err) => {
            console.error("Simple notifications listener failed:", err);
        });
    });
}

// --- NOTIFIKASJONER ---

function formatRelativeTime(date) {
    if (!date) return '';
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Nå';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}t`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
    
    return date.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' });
}

function updateNotificationsUI(uid, notifications) {
    // Desktop UI
    const wrapper = document.getElementById('notifications-wrapper');
    const badge = document.getElementById('notifications-badge');
    const list = document.getElementById('notifications-list');
    
    // Mobile UI
    const mobileWrapper = document.getElementById('mobile-notifications-wrapper');
    const mobileBadge = document.getElementById('mobile-notifications-badge');

    if (!wrapper && !mobileWrapper) return;
    
    if (wrapper) wrapper.classList.remove('hidden');
    if (mobileWrapper) mobileWrapper.classList.remove('hidden');
    
    const profileNotifWrapper = document.querySelector('.profile-notif-wrapper');
    if (profileNotifWrapper) profileNotifWrapper.classList.remove('hidden');


    const unreadCount = notifications.length;

    if (unreadCount > 0) {
        if (badge) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
        }
        if (mobileBadge) {
            mobileBadge.textContent = unreadCount;
            mobileBadge.classList.remove('hidden');
        }
    } else {
        if (badge) badge.classList.add('hidden');
        if (mobileBadge) mobileBadge.classList.add('hidden');
    }

    // Oppdater dropdown liste (kun for desktop i første omgang, eller delt)
    if (list) {
        if (unreadCount === 0) {
            list.innerHTML = '<p class="text-sm text-muted text-center py-2">Ingen nye varsler.</p>';
        } else {
            list.innerHTML = '';
            notifications.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

            notifications.forEach(notif => {
                const item = document.createElement('div');
                item.className = 'notif-item';
                item.style.padding = '0.75rem 1rem';
                item.style.borderBottom = '1px solid var(--color-border)';
                item.style.cursor = 'pointer';
                item.style.transition = 'background-color 0.2s';
                
                const date = notif.createdAt?.toDate ? notif.createdAt.toDate() : new Date(notif.createdAt);
                const timeStr = formatRelativeTime(date);

                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                        <p style="margin: 0; font-size: 0.85rem; line-height: 1.4; color: var(--color-text-main);"><strong>${notif.text}</strong></p>
                        <span style="font-size: 0.7rem; color: var(--color-text-muted); white-space: nowrap;">${timeStr}</span>
                    </div>
                `;
                
                // Hover effect
                item.addEventListener('mouseenter', () => item.style.backgroundColor = 'var(--color-bg-subtle)');
                item.addEventListener('mouseleave', () => item.style.backgroundColor = 'transparent');
                
                item.addEventListener('click', async () => {
                    try {
                        await setDoc(doc(db, `users/${uid}/notifications`, notif.id), { read: true }, { merge: true });
                        const dropdown = document.getElementById('notifications-dropdown');
                        if(dropdown) dropdown.classList.add('hidden');
                        
                        // Redirection logic
                        if (notif.sourcePath?.includes('arrangements')) {
                            const tabEvents = document.getElementById('tab-events');
                            if (tabEvents) tabEvents.click();
                            document.getElementById('events-section')?.scrollIntoView({ behavior: 'smooth' });
                        } else {
                            const tabPosts = document.getElementById('tab-posts');
                            if (tabPosts) tabPosts.click();
                            document.getElementById('posts-section')?.scrollIntoView({ behavior: 'smooth' });
                        }
                    } catch (e) { console.error(e); }
                });
                
                list.appendChild(item);
            });
            
            // Mark all read button
            const markAll = document.createElement('button');
            markAll.className = 'btn btn-ghost btn-sm btn-full mt-2';
            markAll.textContent = 'Marker alle som lest';
            markAll.onclick = async (e) => {
                e.stopPropagation();
                const batch = writeBatch(db);
                notifications.forEach(n => {
                    batch.update(doc(db, `users/${uid}/notifications`, n.id), { read: true });
                });
                await batch.commit();
            };
            list.appendChild(markAll);
        }
    }
}

// Toggle notifications menu
document.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.getElementById('notifications-wrapper');
    const dropdown = document.getElementById('notifications-dropdown');
    
    if (wrapper && dropdown) {
        wrapper.addEventListener('click', (e) => {
            // Unngå problemer hvis man klikker på dropdown selve
            if(dropdown.contains(e.target)) return;
            
            const isHidden = dropdown.classList.contains('hidden');
            dropdown.classList.toggle('hidden');
            wrapper.classList.toggle('active', isHidden);
            
            // For sidebar context, we might want to rotate a chevron if it exists
            const chevron = document.getElementById('notifications-chevron');
            if (chevron) {
                chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
        
        // Klikk utenfor for å lukke
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                dropdown.classList.add('hidden');
                const chevron = document.getElementById('notifications-chevron');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            }
        });
    }

});

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
export function openLightbox(url, description) {
    if (!imageLightbox || !lightboxImg) return;
    lightboxImg.src = url;
    if (lightboxDescription) {
        lightboxDescription.textContent = description || '';
    }
    toggleModal(imageLightbox, true);
}
window.openLightbox = openLightbox;

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

            console.log("Resizing and converting file:", file.name);
            const base64Image = await resizeAndConvertToBase64(file, 800);
            console.log("Converted to base64. Length:", base64Image.length);

            await addDoc(galleryRef, {
                imageUrl: base64Image,
                description: individualDesc || null,
                createdAt: serverTimestamp(),
                uploadedBy: uid
            });
            console.log("Successfully added document to gallery.");
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

    // Publisering & Dokumenter Card
    if (adminPublishCard) {
        // Alltid vis for innloggede (siden den inneholder Dokumenter)
        adminPublishCard.classList.toggle('hidden', !user);
        updateScrollLock();

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
    if (isMemberPage()) {
        if (!authState.user) {
            window.location.href = 'login.html';
        }
    }
}

function protectLoginPage() {
    if (isLoginPage()) {
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

        // Alt ok - gå til medlemssiden
        console.log("Innlogging vellykket! Viderekobler umiddelbart...");
        window.location.href = 'medlem.html';
        return; 

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
        window.location.href = 'index.html';
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

        // 1. Behandle bilde (Base64 med universell beskjæring)
        if (file) {
            const allowedTypes = ['image/jpeg', 'image/png'];
            if (!allowedTypes.includes(file.type)) {
                throw new Error("Kun JPG og PNG-filer er tillatt.");
            }
            console.log("Processing file with offset:", profileImageOffset);
            statusMsg.textContent = 'Behandler bilde...';

            newPhotoURL = await cropAndCompressUniversal(file, profileImageOffset, {
                targetWidth: 400,
                targetHeight: 400, // Profilbilde er kvadratisk
                previewHeight: 200
            });
            console.log("Image adjusted and converted");
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

        // Tøm preview
        const profilePreviewContainer = document.getElementById('profile-preview-container');
        const profilePreviewImg = document.getElementById('profile-image-preview');
        setTimeout(() => {
            toggleModal(profileModal, false);
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
            if (statusMsg) statusMsg.textContent = '';
            // Reset input og preview
            profileImageFileInput.value = '';
            if (profilePreviewContainer) profilePreviewContainer.classList.add('hidden');
            if (profilePreviewImg) profilePreviewImg.src = '';
            profileImageOffset = 0;
            if (resetProfileAdjustment) resetProfileAdjustment(0);
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
            'it administrator': 10
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
            if (orgRoleStr.toLowerCase().startsWith('it ')) {
                orgRoleStr = 'IT ' + orgRoleStr.slice(3).charAt(0).toUpperCase() + orgRoleStr.slice(4).toLowerCase();
            } else {
                orgRoleStr = orgRoleStr.split(' - ').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' - ');
            }

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
            moreBtn.textContent = 'Vis flere';
            moreBtn.onclick = () => {
                // Øk grensen med 10 av gangen
                sidebarMembersLimit += 10;
                loadSidebarMembersList();
            };
            sidebarMembersList.appendChild(moreBtn);
        } else {
            // Alle er lastet inn i sidebaren, nå kan vi vise knappen for å se alle i modallen
            const allBtn = document.createElement('button');
            allBtn.className = 'btn btn-ghost btn-sm btn-full mt-2';
            allBtn.style.fontSize = '0.75rem';
            allBtn.textContent = 'Se alle medlemmer';
            allBtn.onclick = () => openMembersModal();
            sidebarMembersList.appendChild(allBtn);
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

// **OPPDATERT**: Laster faktiske brukere med lazy-loading og aktiv preview
async function loadAdminImages() {
    if (!adminUserList) return;
    adminUserList.innerHTML = '<p class="text-muted text-center">Laster brukere...</p>';
    currentAdminSelections.clear();

    try {
        // 1. Hent nåværende offentlige bilder fra 'items' undersamlingen
        const itemsSnapshot = await getDocs(collection(db, 'site_content', 'gallery', 'items'));
        itemsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.imageUrl) currentAdminSelections.add(data.imageUrl);
        });

        // Oppdater teller og preview umiddelbart
        renderActiveGalleryPreview();

        // 2. Hent alle brukere fra 'users' samlingen
        const usersSnapshot = await getDocs(collection(db, 'users'));

        if (usersSnapshot.empty) {
            adminUserList.innerHTML = '<p class="text-muted text-center">Ingen brukere funnet.</p>';
            return;
        }

        adminUserList.innerHTML = '';

        // Loop gjennom hver bruker og lag headere (uten å hente bilder enda)
        usersSnapshot.docs.forEach(userDoc => {
            const userData = userDoc.data();
            const userId = userDoc.id;
            const displayName = userData.displayName || 'Ukjent bruker';

            const userGroup = document.createElement('div');
            userGroup.className = 'user-group';
            userGroup.dataset.userId = userId;
            userGroup.dataset.loaded = "false";

            const header = document.createElement('div');
            header.className = 'user-group-header';
            header.innerHTML = `
                <span class="text-sm font-semibold">${displayName}</span>
                <svg class="collapse-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            
            const content = document.createElement('div');
            content.className = 'user-group-content';
            content.innerHTML = '<p class="text-xs text-muted py-2">Laster bilder...</p>';

            header.addEventListener('click', () => {
                const isExpanded = userGroup.classList.toggle('expanded');
                if (isExpanded && userGroup.dataset.loaded === "false") {
                    loadUserGalleryForAdmin(userId, content, userGroup);
                }
            });

            userGroup.appendChild(header);
            userGroup.appendChild(content);
            adminUserList.appendChild(userGroup);
        });

    } catch (error) {
        console.error("Error loading admin images:", error);
        adminUserList.innerHTML = `<p class="text-error text-center">Feil: ${error.message}</p>`;
    }
}

// Hjelpefunksjon for lazy-loading av brukerens bilder
async function loadUserGalleryForAdmin(userId, container, groupElement) {
    try {
        const gallerySnapshot = await getDocs(collection(db, `users/${userId}/gallery_images`));
        container.innerHTML = '';

        if (gallerySnapshot.empty) {
            container.innerHTML = '<p class="text-xs text-muted italic py-2">Ingen bilder i dette galleriet.</p>';
        } else {
            const grid = document.createElement('div');
            grid.className = 'gallery-preview-grid';

            gallerySnapshot.forEach(imgDoc => {
                const imgData = imgDoc.data();
                const url = imgData.imageUrl;
                const isSelected = currentAdminSelections.has(url);

                const item = document.createElement('div');
                item.className = `admin-gallery-item ${isSelected ? 'selected' : ''}`;
                item.dataset.url = url;
                item.innerHTML = `
                    <img src="${url}" loading="lazy">
                    <div class="admin-gallery-check">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                `;

                item.addEventListener('click', () => {
                    const selected = item.classList.toggle('selected');
                    if (selected) {
                        currentAdminSelections.add(url);
                    } else {
                        currentAdminSelections.delete(url);
                    }
                    renderActiveGalleryPreview();
                });

                grid.appendChild(item);
            });
            container.appendChild(grid);
        }
        groupElement.dataset.loaded = "true";
    } catch (e) {
        console.error("Feil ved lasting av brukergalleri:", e);
        container.innerHTML = '<p class="text-error text-xs">Kunne ikke laste bilder.</p>';
    }
}

// Oppdaterer den sticky preview-seksjonen øverst
function renderActiveGalleryPreview() {
    if (!activeImagesGrid || !activeImageCount) return;

    activeImageCount.textContent = `${currentAdminSelections.size} bilder valgt`;
    activeImagesGrid.innerHTML = '';

    if (currentAdminSelections.size === 0) {
        activeImagesGrid.innerHTML = '<p class="text-xs text-muted w-full text-center py-2">Ingen bilder valgt</p>';
        return;
    }

    currentAdminSelections.forEach(url => {
        const item = document.createElement('div');
        item.className = 'active-image-item';
        item.innerHTML = `
            <img src="${url}">
            <button class="active-image-remove" title="Fjern fra utvalg">×</button>
        `;

        item.querySelector('.active-image-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            currentAdminSelections.delete(url);
            
            // Sync med hovedlisten hvis bildet er synlig der
            const mainItems = document.querySelectorAll(`.admin-gallery-item[data-url="${url}"]`);
            mainItems.forEach(mi => mi.classList.remove('selected'));
            
            renderActiveGalleryPreview();
        });

        activeImagesGrid.appendChild(item);
    });
}


// --- ADMIN SAVE SELECTION ---
async function saveAdminSelection() {
    const selectedImages = Array.from(currentAdminSelections);

    const btn = document.getElementById('save-admin-selection');
    const originalText = btn.textContent;
    btn.textContent = 'Lagrer...';
    btn.disabled = true;

    try {
        // 1. Hent alle elementer i det offentlige galleriet
        const itemsRef = collection(db, 'site_content', 'gallery', 'items');
        const itemsSnapshot = await getDocs(itemsRef);

        // 2. Bruk batch for effektivitet
        const batch = writeBatch(db);

        // Slett alle gamle oppføringer
        itemsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // 3. Legg til nye koblinger
        selectedImages.forEach((url, index) => {
            const newDocRef = doc(itemsRef); // Generer ny ID
            batch.set(newDocRef, {
                imageUrl: url,
                order: index,
                updatedAt: serverTimestamp(),
                updatedBy: authState.user.uid
            });
        });

        // 4. Oppdater hoved-dokumentet logging
        batch.set(doc(db, 'site_content', 'gallery'), {
            lastUpdated: serverTimestamp(),
            updatedBy: authState.user.uid
        }, { merge: true });

        await batch.commit();
        
        showCustomAlert("Galleriet har blitt oppdatert!");
        toggleModal(adminImageModal, false);

    } catch (error) {
        console.error("Error saving admin selection:", error);
        showCustomAlert(`Feil ved lagring: ${error.message}`);
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


// --- EVENT LISTENERS (ATTACHED IN attachEventListeners()) ---




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
    if (createUserForm) createUserForm.reset();

    // Reset fields that might have been disabled during edit
    const emailInput = document.getElementById('new-user-email');
    const passInput = document.getElementById('new-user-password');
    const userModalTitle = document.getElementById('user-modal-title');

    if (emailInput) {
        emailInput.disabled = false;
        emailInput.required = true;
    }
    if (passInput) {
        passInput.disabled = false;
        passInput.required = true;
    }
    // Note: userModalTitle is usually an h3 in the header, might be 'admin-modal-title'
    const modalTitle = document.querySelector('#admin-members-modal h3');
    if (modalTitle) modalTitle.textContent = 'Legg til ny bruker';
    if (editUserIdInput) editUserIdInput.value = '';
    if (adminSoftDeleteBtn) adminSoftDeleteBtn.classList.add('hidden');
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
            'it administrator': 10
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
            if (orgRoleStr.toLowerCase().startsWith('it ')) {
                orgRoleStr = 'IT ' + orgRoleStr.slice(3).charAt(0).toUpperCase() + orgRoleStr.slice(4).toLowerCase();
            } else {
                orgRoleStr = orgRoleStr.split(' - ').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' - ');
            }

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
        closeMembersModal();
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

function setupMembersTabs() {
    const tabs = [
        { btn: tabActiveMembers, section: activeMembersSection },
        { btn: tabPendingDeletions, section: pendingDeletionsSection },
        { btn: tabArchive, section: archiveSection },
        { btn: tabAddMember, section: addMemberSection }
    ];

    tabs.forEach(t => {
        if (t.btn) {
            t.btn.addEventListener('click', () => {
                // Remove active class from all tabs
                tabs.forEach(tab => tab.btn?.classList.remove('active'));
                // Hide all sections
                tabs.forEach(tab => tab.section?.classList.add('hidden'));

                // Add active class and show section
                t.btn.classList.add('active');
                t.section?.classList.remove('hidden');

                // Load appropriate list if needed
                if (t.btn === tabPendingDeletions) loadPendingDeletionsList();
                if (t.btn === tabArchive) loadArchiveList();
                if (t.btn === tabActiveMembers) loadMembersList();
            });
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

// --- INITIALISERING ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}


import { app, auth, db, appId, authReady, sendPasswordResetEmail } from './firebase.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    addDoc,
    deleteDoc,
    collection,
    query,
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

// Gallery Uploads (Personal)
const uploadGalleryBtn = document.getElementById('upload-gallery-btn');
const uploadModal = document.getElementById('upload-modal');
const uploadModalOverlay = document.getElementById('upload-modal-overlay');
const closeUploadModalBtn = document.getElementById('close-upload-modal');
const uploadForm = document.getElementById('upload-form');
const uploadFilesInput = document.getElementById('upload-files-input');
const uploadDescriptionInput = document.getElementById('upload-description-input');
const confirmUploadBtn = document.getElementById('confirm-upload-btn');
const myGalleryContainer = document.getElementById('my-gallery-container');

// Admin
const newPostBtn = document.getElementById('new-post-btn');
const newPostContainer = document.getElementById('new-post-container');
const adminToolsCard = document.getElementById('admin-tools-card');
const adminGalleryBtn = document.getElementById('admin-gallery-btn');
// const adminPromotedBtn = document.getElementById('admin-promoted-btn'); // REMOVED
const adminImageModal = document.getElementById('admin-image-modal');
const adminImageModalOverlay = document.getElementById('admin-image-modal-overlay');
const closeAdminModalBtn = document.getElementById('close-admin-modal');
const cancelAdminModalBtn = document.getElementById('cancel-admin-modal');
const saveAdminSelectionBtn = document.getElementById('save-admin-selection');
const adminUserList = document.getElementById('admin-user-list');
const adminModalTitle = document.getElementById('admin-modal-title');

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

// --- HJELPEFUNKSJONER ---

function showCustomAlert(message) {
    if (messageModal && messageModalText) {
        messageModalText.textContent = message;
        messageModal.classList.remove('hidden');
        return new Promise(resolve => {
            const closeHandler = () => {
                messageModal.classList.add('hidden');
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

function showCustomConfirm(message) {
    if (confirmModal && confirmModalText) {
        confirmModalText.textContent = message;
        confirmModal.classList.remove('hidden');
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
                confirmModal.classList.add('hidden');
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
        } else {
            // Hvis dokumentet ikke finnes (ny bruker), sett standardverdier
            authState.profile = {
                displayName: authState.user?.email?.split('@')[0] || 'Medlem',
                photoURL: null
            };
            authState.role = 'member';
            // Opprett dokumentet første gang
            saveUserProfile(uid, authState.profile);
        }
        updateUI(authState.user, authState.profile);
    }, (error) => {
        console.error("Error in user listener:", error);
    });
    return unsubscribe;
}

// Lytter til brukerens personlige galleri
function setupGalleryListener(uid) {
    if (!uid || !myGalleryContainer) return null;

    // Vi sorterer ikke i query (enklere uten index) - legg evt. til orderBy om nødvendig
    const galleryParams = `users/${uid}/gallery_images`;
    const galleryRef = collection(db, galleryParams);

    myGalleryContainer.innerHTML = '<p class="text-muted text-sm" style="grid-column: 1/-1;">Laster...</p>';

    const unsubscribe = onSnapshot(galleryRef, (snapshot) => {
        myGalleryContainer.innerHTML = '';
        if (snapshot.empty) {
            myGalleryContainer.innerHTML = '<p class="text-muted text-sm" style="grid-column: 1/-1;">Du har ingen bilder ennå.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;

            const item = document.createElement('div');
            item.className = 'gallery-preview-item bg-subtle';
            item.style.position = 'relative'; // For delete button positioning

            // Image
            const img = document.createElement('img');
            img.src = data.imageUrl;
            img.alt = data.description || 'Galleri bilde';
            img.loading = 'lazy';
            item.appendChild(img);

            // Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'gallery-delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Slett bilde';

            deleteBtn.onclick = (e) => {
                e.preventDefault();
                deleteGalleryImage(uid, id);
            };

            item.appendChild(deleteBtn);

            // Description Tooltip/Text
            if (data.description) {
                const desc = document.createElement('div');
                desc.textContent = data.description;
                desc.style.position = 'absolute';
                desc.style.bottom = '0';
                desc.style.left = '0';
                desc.style.right = '0';
                desc.style.background = 'rgba(0,0,0,0.6)';
                desc.style.color = '#fff';
                desc.style.fontSize = '0.75rem';
                desc.style.padding = '0.25rem 0.5rem';
                desc.style.whiteSpace = 'nowrap';
                desc.style.overflow = 'hidden';
                desc.style.textOverflow = 'ellipsis';
                item.appendChild(desc);
            }

            myGalleryContainer.appendChild(item);
        });
    }, (error) => {
        console.error("Error fetching gallery:", error);
        myGalleryContainer.innerHTML = '<p class="text-error text-sm" style="grid-column: 1/-1;">Feil ved lasting.</p>';
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
    if (uploadModal) uploadModal.classList.remove('hidden');
}

function closeUploadModal() {
    if (uploadModal) uploadModal.classList.add('hidden');
    if (uploadForm) uploadForm.reset();
}

async function handleGalleryUploadSubmit(e) {
    e.preventDefault();

    const files = uploadFilesInput.files;
    const description = uploadDescriptionInput.value.trim();

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

        // Loop gjennom alle valgte filer
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const base64Image = await resizeAndConvertToBase64(file, 800);

            await addDoc(galleryRef, {
                imageUrl: base64Image,
                description: description || null, // Shared description for batch
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

    // Vis admin-knapper hvis admin
    if (authState.role === 'admin') {
        if (newPostBtn) newPostBtn.classList.remove('hidden');
        if (adminToolsCard) adminToolsCard.classList.remove('hidden');
    } else {
        if (newPostBtn) newPostBtn.classList.add('hidden');
        if (adminToolsCard) adminToolsCard.classList.add('hidden');
    }

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
        if (authState.user) {
            window.location.href = 'medlem.html';
        }
    }
}

// --- HANDLERS ---

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (loginError) loginError.textContent = '';
    if (loginSuccess) loginSuccess.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login failed:", error.code);
        if (loginError) {
            if (error.code === 'auth/invalid-credential') {
                loginError.textContent = 'Feil e-post eller passord.';
            } else {
                loginError.textContent = 'En feil oppstod. Prøv igjen.';
            }
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

// --- ADMIN MODAL LOGIC ---

function openAdminModal() {
    // Vi støtter nå kun "gallery" (offentlig administrasjon)
    if (adminModalTitle) {
        adminModalTitle.textContent = 'Administrer offentlig galleri';
    }
    if (adminImageModal) adminImageModal.classList.remove('hidden');
    loadAdminImages();
}

function closeAdminModal() {
    if (adminImageModal) adminImageModal.classList.add('hidden');
}

// **OPPDATERT**: Laster faktiske brukere og deres bilder
async function loadAdminImages() {
    if (!adminUserList) return;
    adminUserList.innerHTML = '<p class="text-muted text-center">Laster brukere...</p>';

    try {
        // Hent alle brukere fra 'users' samlingen
        // NB: Dette krever at reglene tillater lesing av 'users' for admin
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
            userGroup.className = 'user-group mb-4';

            const header = document.createElement('h4');
            header.className = 'text-sm font-semibold mb-2';
            header.textContent = `${displayName} (${userId})`;
            userGroup.appendChild(header);

            if (gallerySnapshot.empty) {
                const noImg = document.createElement('p');
                noImg.className = 'text-sm text-muted';
                noImg.textContent = 'Ingen bilder lastet opp.';
                userGroup.appendChild(noImg);
            } else {
                const grid = document.createElement('div');
                grid.className = 'gallery-preview-grid';

                gallerySnapshot.forEach(imgDoc => {
                    const imgData = imgDoc.data();

                    const item = document.createElement('div');
                    item.className = 'gallery-preview-item bg-subtle';
                    item.style.position = 'relative';

                    const img = document.createElement('img');
                    img.src = imgData.imageUrl;

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'admin-image-select';
                    checkbox.value = imgData.imageUrl; // Vi lagrer URL-en
                    checkbox.dataset.userId = userId;
                    checkbox.style.position = 'absolute';
                    checkbox.style.top = '0.5rem';
                    checkbox.style.right = '0.5rem';
                    checkbox.style.width = '1.25rem';
                    checkbox.style.height = '1.25rem';
                    checkbox.style.cursor = 'pointer';

                    item.appendChild(img);
                    item.appendChild(checkbox);
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

    // Finn alle valgte bilder
    const checkboxes = document.querySelectorAll('.admin-image-select:checked');
    const selectedImages = Array.from(checkboxes).map(cb => cb.value);

    // Lagre valget i 'site_content' samlingen
    const contentRef = doc(db, 'site_content', 'gallery');

    const btn = document.getElementById('save-admin-selection');
    const originalText = btn.textContent;
    btn.textContent = 'Lagrer...';
    btn.disabled = true;

    try {
        await setDoc(contentRef, {
            images: selectedImages,
            updatedAt: serverTimestamp(),
            updatedBy: authState.user.uid
        });

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


// --- EVENT LISTENERS ---

// Mobilmeny
if (mobileMenuButton) {
    mobileMenuButton.addEventListener('click', () => {
        mobileMenu.classList.toggle('show');
    });
}

// Login
if (loginForm) loginForm.addEventListener('submit', handleLogin);
if (forgotPasswordBtn) forgotPasswordBtn.addEventListener('click', handleForgotPassword);

// Logout
if (dropdownLogoutButton) dropdownLogoutButton.addEventListener('click', handleLogout);
if (mobileLogoutButton) mobileLogoutButton.addEventListener('click', handleLogout);
if (logoutButton) logoutButton.addEventListener('click', handleLogout);

// Profil Modal
if (openProfileModal) {
    openProfileModal.addEventListener('click', () => {
        displayNameInput.value = authState.profile?.displayName || '';
        profileImageUrlInput.value = authState.profile?.photoURL || '';
        profileModal.classList.remove('hidden');
    });
}
function closeModal() { if (profileModal) profileModal.classList.add('hidden'); }
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


// Admin: Nytt innlegg toggle
if (newPostBtn) {
    newPostBtn.addEventListener('click', () => {
        if (newPostContainer) newPostContainer.classList.toggle('hidden');
    });
}

// Admin: Modals
if (adminGalleryBtn) adminGalleryBtn.addEventListener('click', openAdminModal);
if (closeAdminModalBtn) closeAdminModalBtn.addEventListener('click', closeAdminModal);
if (cancelAdminModalBtn) cancelAdminModalBtn.addEventListener('click', closeAdminModal);
if (adminImageModalOverlay) adminImageModalOverlay.addEventListener('click', closeAdminModal);
if (saveAdminSelectionBtn) {
    saveAdminSelectionBtn.addEventListener('click', saveAdminSelection);
}


// --- INIT ---

authReady.then(async (initialUser) => {
    if (initialUser) {
        const userData = await fetchUserData(initialUser.uid);

        authState.user = initialUser;
        authState.profile = userData || { displayName: null, photoURL: null };
        authState.role = userData?.role || 'member';

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
    protectMemberPage();
    protectLoginPage();

    // Signaliser at vi er ferdige med init
    resolveUserReady(authState);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userData = await fetchUserData(user.uid);

            authState.user = user;
            authState.profile = userData || { displayName: null, photoURL: null };
            authState.role = userData?.role || 'member';

            if (profileUnsubscribe) profileUnsubscribe();
            profileUnsubscribe = setupUserListener(user.uid);

            if (galleryUnsubscribe) galleryUnsubscribe();
            galleryUnsubscribe = setupGalleryListener(user.uid);

        } else {
            authState.user = null;
            authState.role = null;
            authState.profile = null;
            if (profileUnsubscribe) profileUnsubscribe();
            if (galleryUnsubscribe) galleryUnsubscribe();
        }
        updateUI(authState.user, authState.profile);
        protectMemberPage();
        protectLoginPage();
    });
});
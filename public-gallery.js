import { db } from './firebase.js';
import {
    doc,
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const publicGalleryGrid = document.getElementById('public-gallery-grid');
const homepageGalleryTeaser = document.getElementById('homepage-gallery-teaser');

// --- CACHING HJELPEFUNKSJONER ---
function getCachedGallery() {
    try {
        const cached = localStorage.getItem('public_gallery');
        return cached ? JSON.parse(cached) : null;
    } catch (e) {
        console.error("Error reading cached gallery:", e);
        return null;
    }
}

function setCachedGallery(images) {
    try {
        localStorage.setItem('public_gallery', JSON.stringify(images));
    } catch (e) {
        console.error("Error writing cached gallery:", e);
    }
}

/**
 * Oppretter og returnerer et galleri-element (bilde i en div).
 */
function createGalleryItem(url) {
    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.style.cursor = 'pointer';

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Håndlaget keramikk';
    img.className = 'gallery-image';
    img.loading = 'lazy';

    div.appendChild(img);

    // Legg til click-event for å åpne lightbox
    div.addEventListener('click', () => {
        openLightbox(url);
    });

    return div;
}

// --- LIGHTBOX LOGIKK ---
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-image');
const lightboxClose = document.getElementById('lightbox-close');

function openLightbox(url) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = url;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden'; // Forhindre scrolling
}

function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    setTimeout(() => {
        if (lightboxImg) lightboxImg.src = '';
    }, 300);
}

if (lightbox) {
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
}

if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
}

// Lukk med escape-tast
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox && lightbox.classList.contains('active')) {
        closeLightbox();
    }
});

/**
 * Oppretter og returnerer et teaser-element (bilde i en lenke).
 */
function createTeaserItem(url) {
    const a = document.createElement('a');
    a.href = 'galleri.html';
    a.className = 'gallery-item';

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Håndlaget keramikk';
    img.className = 'gallery-image';
    img.loading = 'lazy';

    a.appendChild(img);
    return a;
}

/**
 * Renders images to the target container.
 */
function renderGallery(target, imageUrls, isTeaser) {
    target.innerHTML = '';
    if (imageUrls.length === 0) {
        target.innerHTML = `<p class="text-center py-10 text-muted" style="grid-column: 1/-1;">Galleriet er tomt for øyeblikket.</p>`;
        return;
    }

    const displayImages = isTeaser ? imageUrls.slice(0, 4) : imageUrls;
    displayImages.forEach(url => {
        const item = isTeaser ? createTeaserItem(url) : createGalleryItem(url);
        target.appendChild(item);
    });
}

/**
 * Lytter til endringer i det offentlige galleriet i Firestore.
 */
function setupPublicGalleryListener() {
    const target = publicGalleryGrid || homepageGalleryTeaser;
    if (!target) return;

    const isTeaser = !!homepageGalleryTeaser;
    const galleryDocRef = doc(db, 'site_content', 'gallery');

    // 1. Vis fra cache umiddelbart
    const cachedImages = getCachedGallery();
    if (cachedImages) {
        console.log("Viser galleri fra cache.");
        renderGallery(target, cachedImages, isTeaser);
    }

    // 2. Lytt på sanntidsoppdateringer i 'items' undersamlingen
    const galleryItemsRef = collection(db, 'site_content', 'gallery', 'items');

    onSnapshot(galleryItemsRef, (querySnapshot) => {
        if (!querySnapshot.empty) {
            // Vi henter alle bilder og sorterer dem hvis nødvendig (vi la til 'order' i script.js)
            const imageUrls = querySnapshot.docs
                .map(doc => doc.data())
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(data => data.imageUrl);

            // Lagre i cache for neste gang
            setCachedGallery(imageUrls);

            // Oppdater UI
            renderGallery(target, imageUrls, isTeaser);
        } else {
            target.innerHTML = `<p class="text-center py-10 text-muted" style="grid-column: 1/-1;">Ingen bilder er valgt ut for visning ennå.</p>`;
        }
    }, (error) => {
        console.error("Feil ved henting av offentlig galleri:", error);
        if (!cachedImages) {
            target.innerHTML = `<p class="text-center py-10 text-error" style="grid-column: 1/-1;">Kunne ikke laste galleriet.</p>`;
        }
    });
}

// Initialiser når DOM er klar
document.addEventListener('DOMContentLoaded', () => {
    setupPublicGalleryListener();
});

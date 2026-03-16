import { db, appId } from './firebase.js';
import {
    collection,
    onSnapshot,
    query,
    orderBy,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { parseMentionsForDisplay } from './tagging.js';
import { getAllCachedUsers } from './script.js';

const arrangementsPath = `/artifacts/${appId}/public/data/arrangements`;
const eventsContainer = document.getElementById('hva-skjer-events-container');

function formatDate(timestamp) {
    if (!timestamp) return 'Ingen dato';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('nb-NO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function sanitizeHTML(str) {
    if (!str) return '';
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setupPublicEventsListener() {
    if (!eventsContainer) return;

    const eventsRef = collection(db, arrangementsPath);
    // Vi gjør filtrering på 'visibility' manuelt på klientsiden for å unngå 
    // behov for compound index (som tar tid å generere).
    const q = query(eventsRef, orderBy("date", "asc"));

    onSnapshot(q, (snapshot) => {
        const upcoming = [];
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const eventDate = data.date.toDate();
            const event = { id: docSnap.id, ...data };

            if (eventDate >= todayStart && event.visibility === 'public') {
                upcoming.push(event);
            }
        });

        renderEvents(upcoming);
    }, (error) => {
        console.error("Feil ved henting av arrangementer:", error);
        eventsContainer.innerHTML = '<p class="text-center text-error" style="grid-column: 1/-1;">Kunne ikke laste arrangementer for øyeblikket.</p>';
    });
}

function renderEvents(events) {
    eventsContainer.innerHTML = '';
    
    if (events.length === 0) {
        eventsContainer.innerHTML = '<p class="text-center text-muted" style="grid-column: 1/-1;">Ingen kommende arrangementer for øyeblikket.</p>';
        return;
    }

    events.forEach(event => {
        const card = document.createElement('article');
        card.className = 'kurs-liste-item';
        
        const imageUrl = event.imageUrl || '';
        const hasImage = imageUrl.trim() !== '';
        
        // Use parseMentionsForDisplay on the description, replace newlines with <br>
        const descriptionHtml = parseMentionsForDisplay(sanitizeHTML(event.description || '').replace(/\n/g, '<br>'), getAllCachedUsers()).html;

        const imageHtml = hasImage 
            ? `<div class="kurs-liste-item-image-container"><img src="${imageUrl}" alt="${sanitizeHTML(event.title)}" class="kurs-liste-item-image" style="object-position: 50% ${event.imageOffset || 0}%;"></div>` 
            : `<div class="kurs-liste-item-image-container"><div class="kurs-liste-item-image" style="background:var(--color-bg-alt);display:flex;align-items:center;justify-content:center;"><span style="color:var(--color-text-muted);">Intet bilde</span></div></div>`;

        card.innerHTML = `
            ${imageHtml}
            <div class="kurs-liste-item-text">
                <h2>${sanitizeHTML(event.title)}</h2>
                <p class="text-lg" style="color: var(--color-primary); font-weight: 500;">
                    📅 ${formatDate(event.date)}<br>
                    📍 ${sanitizeHTML(event.location)}
                </p>
                <div class="text-lg" style="margin-bottom: 1.5rem; word-break: break-word;">
                    ${descriptionHtml}
                </div>
                <!-- Viser evt. antall påmeldte e.l. her om ønskelig i fremtiden -->
                <!-- <ul><li>...</li></ul> -->
                
                ${event.allowRegistration !== false ? `
                <a href="kontakt.html" class="button button-secondary" style="margin-top: 1.5rem;">Ta kontakt for påmelding</a>
                ` : ''}
            </div>
        `;
        eventsContainer.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupPublicEventsListener();
});

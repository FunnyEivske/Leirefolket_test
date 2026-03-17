import { db, appId } from './firebase.js';
import {
    collection,
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const arrangementsPath = `/artifacts/${appId}/public/data/arrangements`;
const eventsContainer = document.getElementById('public-events-container');

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
    // Kombinert spørring krever ofte index i Firestore, siden vi både filtrerer og sorterer
    // For å unngå compund index feil frem til indeksen er generert, gjør vi filtreringen etter "visibility" manuelt på klientsiden i stedet.
    const q = query(eventsRef, where("visibility", "==", "public"));

    onSnapshot(q, (snapshot) => {
        const upcoming = [];
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const eventDate = data.date.toDate();
            const event = { id: docSnap.id, ...data };

            if (eventDate >= todayStart) {
                upcoming.push(event);
            }
        });

        upcoming.sort((a, b) => a.date.toDate() - b.date.toDate());

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
        const card = document.createElement('a');
        card.href = 'hva-skjer.html';
        card.className = 'kurs-card'; // Gjenbruker eksisterende styling
        
        const imageUrl = event.imageUrl || '';
        const hasImage = imageUrl.trim() !== '';
        
        card.innerHTML = `
            ${hasImage ? `<img src="${imageUrl}" alt="${sanitizeHTML(event.title)}" class="kurs-card-image" style="object-position: 50% ${event.imageOffset || 0}%;">` : `<div class="kurs-card-image" style="background:var(--color-bg-alt);display:flex;align-items:center;justify-content:center;"><span style="color:var(--color-text-muted);">Intet bilde</span></div>`}
            <div class="kurs-card-content">
                <h3>${sanitizeHTML(event.title)}</h3>
                <p style="font-size: 0.9rem; color: var(--color-primary); font-weight: 500; margin-bottom: 0.5rem;">
                    📅 ${formatDate(event.date)}<br>
                    📍 ${sanitizeHTML(event.location)}
                </p>
                <p style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 0;">
                    ${sanitizeHTML(event.description).replace(/\n/g, '<br>')}
                </p>
            </div>
        `;
        eventsContainer.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupPublicEventsListener();
});

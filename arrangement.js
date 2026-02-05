import { db, appId } from './firebase.js';
import { authState, userReady, showCustomAlert, showCustomConfirm, toggleModal } from './script.js';
import {
    collection,
    addDoc,
    onSnapshot,
    Timestamp,
    query,
    orderBy,
    doc,
    setDoc,
    deleteDoc,
    getDoc,
    serverTimestamp,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- UI-ELEMENTER ---
const postsSection = document.getElementById('posts-section');
const eventsSection = document.getElementById('events-section');
const tabPosts = document.getElementById('tab-posts');
const tabEvents = document.getElementById('tab-events');

const newEventBtn = document.getElementById('new-event-btn');
const newEventForm = document.getElementById('new-event-form');
const eventError = document.getElementById('event-error');
const eventSubmitButton = document.getElementById('event-submit-button');

const upcomingEventsContainer = document.getElementById('upcoming-events-container');
const pastEventsContainer = document.getElementById('past-events-container');
const togglePastEventsBtn = document.getElementById('toggle-past-events');

// Sti til arrangement-databasen
const arrangementsPath = `/artifacts/${appId}/public/data/arrangements`;

// --- TAB LOGIKK ---
function switchTab(tab) {
    if (tab === 'posts') {
        postsSection.classList.remove('hidden');
        eventsSection.classList.add('hidden');

        tabPosts.classList.replace('btn-secondary', 'btn-primary');
        tabEvents.classList.replace('btn-primary', 'btn-secondary');
    } else {
        postsSection.classList.add('hidden');
        eventsSection.classList.remove('hidden');

        tabEvents.classList.replace('btn-secondary', 'btn-primary');
        tabPosts.classList.replace('btn-primary', 'btn-secondary');
    }
}

// --- HJELPEFUNKSJONER ---
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

async function compressImage(file, maxWidth = 1000, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
    });
}

// --- EVENT LOGIKK ---
async function handleEventSubmit(e) {
    e.preventDefault();
    if ((authState.role !== 'admin' && authState.role !== 'contributor') || !authState.user) {
        eventError.textContent = 'Du har ikke tilgang til å publisere.';
        return;
    }

    eventError.textContent = '';
    eventSubmitButton.disabled = true;
    eventSubmitButton.textContent = 'Publiserer...';

    const title = document.getElementById('event-title').value;
    const description = document.getElementById('event-description').value;
    const dateVal = document.getElementById('event-date').value;
    const location = document.getElementById('event-location').value;
    const imageFile = document.getElementById('event-image').files[0];

    try {
        let imageUrl = '';
        if (imageFile) {
            imageUrl = await compressImage(imageFile);
        }

        const eventsRef = collection(db, arrangementsPath);
        await addDoc(eventsRef, {
            title,
            description,
            date: Timestamp.fromDate(new Date(dateVal)),
            location: location || 'Ikke oppgitt',
            imageUrl,
            authorId: authState.user.uid,
            authorName: authState.profile?.displayName || 'Admin',
            createdAt: serverTimestamp()
        });

        newEventForm.reset();
        const eventModal = document.getElementById('event-modal');
        if (eventModal) toggleModal(eventModal, false);
        showCustomAlert("Arrangementet er publisert!");

    } catch (error) {
        console.error("Error creating event:", error);
        eventError.textContent = 'En feil oppstod. Kunne ikke publisere.';
    } finally {
        eventSubmitButton.disabled = false;
        eventSubmitButton.textContent = 'Publiser arrangement';
    }
}

function setupArrangementsListener() {
    const eventsRef = collection(db, arrangementsPath);
    const q = query(eventsRef, orderBy("date", "asc"));

    onSnapshot(q, (snapshot) => {
        const upcoming = [];
        const past = [];
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const eventDate = data.date.toDate();
            const event = { id: docSnap.id, ...data };

            if (eventDate < todayStart) {
                past.push(event);
            } else {
                upcoming.push(event);
            }
        });

        renderUpcomingEvents(upcoming);
        renderPastEvents(past.reverse()); // Newest past first
    });
}

function renderUpcomingEvents(events) {
    upcomingEventsContainer.innerHTML = '';
    if (events.length === 0) {
        upcomingEventsContainer.innerHTML = '<p class="text-center py-10 text-muted">Ingen kommende arrangementer.</p>';
        return;
    }

    events.forEach(event => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            ${event.imageUrl ? `<img src="${event.imageUrl}" class="event-image" alt="${event.title}">` : ''}
            <div class="event-body">
                <div class="event-meta">
                    <div class="event-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 4H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM16 2v4M8 2v4M3 10h18" /></svg>
                        <span>${formatDate(event.date)}</span>
                    </div>
                    <div class="event-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                        <span>${sanitizeHTML(event.location)}</span>
                    </div>
                </div>
                <h3 class="event-title">${sanitizeHTML(event.title)}</h3>
                <p class="event-description">${sanitizeHTML(event.description).replace(/\n/g, '<br>')}</p>
                
                <div class="event-actions">
                    <button class="btn btn-secondary btn-sm rsvp-btn" data-id="${event.id}" data-status="coming">Jeg kommer!</button>
                    <button class="btn btn-secondary btn-sm rsvp-btn" data-id="${event.id}" data-status="not_coming">Kan ikke komme</button>
                    <div id="rsvp-status-${event.id}" class="rsvp-status"></div>
                </div>
                
                ${authState.role === 'admin' ? `
                <div style="margin-top: 1rem; text-align: right;">
                    <button class="btn btn-ghost text-sm delete-event-btn" data-id="${event.id}" style="color: var(--color-error);">Slett arrangement</button>
                </div>
                ` : ''}
                
                <div class="mt-4 text-sm text-muted">
                    <details>
                        <summary style="cursor: pointer;">Se hvem som kommer (<span id="rsvp-count-${event.id}">0</span>)</summary>
                        <ul id="rsvp-list-${event.id}" class="mt-2" style="padding-left: 1rem;">
                            <!-- Liste over folk her -->
                        </ul>
                    </details>
                </div>
            </div>
        `;
        upcomingEventsContainer.appendChild(card);
        setupRSVPListener(event.id);
    });
}

function renderPastEvents(events) {
    pastEventsContainer.innerHTML = '';
    if (events.length === 0) {
        pastEventsContainer.innerHTML = '<p class="text-center py-4 text-muted">Ingen tidligere arrangementer.</p>';
        return;
    }

    events.forEach(event => {
        const card = document.createElement('div');
        card.className = 'past-event-card mb-2';
        card.innerHTML = `
            <img src="${event.imageUrl || 'https://via.placeholder.com/60'}" class="past-event-img" alt="${event.title}">
            <div class="past-event-info">
                <h4>${sanitizeHTML(event.title)}</h4>
                <p>${formatDate(event.date)}</p>
            </div>
            ${authState.role === 'admin' ? `
                <button class="btn btn-ghost text-sm delete-event-btn" data-id="${event.id}">🗑️</button>
            ` : ''}
        `;
        pastEventsContainer.appendChild(card);
    });
}

// --- RSVP LOGIKK ---
async function handleRSVP(eventId, status) {
    if (!authState.user) return;

    const rsvpRef = doc(db, `${arrangementsPath}/${eventId}/rsvp`, authState.user.uid);
    try {
        const snap = await getDoc(rsvpRef);
        if (snap.exists() && snap.data().status === status) {
            // Hvis man trykker på samme status igjen, slett RSVP (Avbryt)
            await deleteDoc(rsvpRef);
        } else {
            await setDoc(rsvpRef, {
                status,
                userId: authState.user.uid,
                userName: authState.profile?.displayName || 'Medlem',
                userPhoto: authState.profile?.photoURL || null,
                updatedAt: serverTimestamp()
            });
        }
    } catch (e) {
        console.error("RSVP failed:", e);
    }
}

function setupRSVPListener(eventId) {
    const rsvpRef = collection(db, `${arrangementsPath}/${eventId}/rsvp`);
    onSnapshot(rsvpRef, (snapshot) => {
        const listEl = document.getElementById(`rsvp-list-${eventId}`);
        const countEl = document.getElementById(`rsvp-count-${eventId}`);
        const statusEl = document.getElementById(`rsvp-status-${eventId}`);

        if (!listEl || !countEl) return;

        let comingCount = 0;
        listEl.innerHTML = '';

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.status === 'coming') {
                comingCount++;
                const li = document.createElement('li');
                li.style.fontSize = '0.85rem';
                li.textContent = data.userName;
                listEl.appendChild(li);
            }

            // check current user status
            if (data.userId === authState.user?.uid) {
                statusEl.textContent = data.status === 'coming' ? '✓ Du kommer' : '✕ Du kommer ikke';
                statusEl.className = `rsvp-status ${data.status.replace('_', '-')}`;

                // Highlight the active button
                const buttons = document.querySelectorAll(`.rsvp-btn[data-id="${eventId}"]`);
                buttons.forEach(btn => {
                    if (btn.dataset.status === data.status) {
                        btn.classList.replace('btn-secondary', 'btn-primary');
                    } else {
                        btn.classList.replace('btn-primary', 'btn-secondary');
                    }
                });
            }
        });

        // Reset highlight if no RSVP found for user
        const userRsvp = snapshot.docs.find(d => d.id === authState.user?.uid);
        if (!userRsvp) {
            statusEl.textContent = '';
            statusEl.className = 'rsvp-status';
            const buttons = document.querySelectorAll(`.rsvp-btn[data-id="${eventId}"]`);
            buttons.forEach(btn => btn.classList.replace('btn-primary', 'btn-secondary'));
        }

        countEl.textContent = comingCount;
        if (listEl.innerHTML === '') {
            listEl.innerHTML = '<li class="text-xs italic">Ingen påmeldte ennå.</li>';
        }
    });
}

async function handleDeleteEvent(eventId) {
    const confirmed = await showCustomConfirm("Er du sikker på at du vil slette dette arrangementet?");
    if (confirmed) {
        try {
            await deleteDoc(doc(db, arrangementsPath, eventId));
        } catch (e) {
            showCustomAlert("Kunne ikke slette arrangementet.");
        }
    }
}

// --- INITIALISERING ---
userReady.then(() => {
    // Tab event listeners
    tabPosts.addEventListener('click', () => switchTab('posts'));
    tabEvents.addEventListener('click', () => switchTab('events'));

    // Admin listeners
    // newEventBtn is handled in script.js for modal toggling

    if (newEventForm) {
        newEventForm.addEventListener('submit', handleEventSubmit);
    }

    // Toggle past events
    togglePastEventsBtn.addEventListener('click', () => {
        pastEventsContainer.classList.toggle('hidden');
        const svg = togglePastEventsBtn.querySelector('svg');
        if (pastEventsContainer.classList.contains('hidden')) {
            svg.style.transform = 'rotate(0deg)';
        } else {
            svg.style.transform = 'rotate(180deg)';
        }
    });

    // Event delegation for RSVP and Delete
    eventsSection.addEventListener('click', (e) => {
        const rsvpBtn = e.target.closest('.rsvp-btn');
        if (rsvpBtn) {
            handleRSVP(rsvpBtn.dataset.id, rsvpBtn.dataset.status);
            return;
        }

        const deleteBtn = e.target.closest('.delete-event-btn');
        if (deleteBtn) {
            handleDeleteEvent(deleteBtn.dataset.id);
            return;
        }
    });

    setupArrangementsListener();
});

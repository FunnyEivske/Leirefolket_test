/**
 * tagging.js - Handles @mention autocomplete dropdown for textareas and inputs.
 */

export class TaggingSystem {
    constructor(inputElement, getUsersCallback, onTagSelected) {
        this.input = inputElement;
        this.getUsersCallback = getUsersCallback; // async funksjon som returnerer liste over brukere {uid, displayName, photoURL}
        this.onTagSelected = onTagSelected; // callback for når et tag velges

        this.dropdown = null;
        this.activeItemIndex = 0;
        this.currentSearchTerm = '';
        this.isMenuOpen = false;
        
        // Hvor i teksten startet @-tegnet
        this.mentionStartIndex = -1;

        this.setupDropdown();
        this.setupListeners();
    }

    setupDropdown() {
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'mention-dropdown hidden';
        // Add styling for the dropdown
        this.dropdown.style.position = 'absolute';
        this.dropdown.style.backgroundColor = 'var(--color-bg-surface)';
        this.dropdown.style.border = '1px solid var(--color-border)';
        this.dropdown.style.borderRadius = 'var(--radius-sm)';
        this.dropdown.style.boxShadow = 'var(--shadow-md)';
        this.dropdown.style.zIndex = '1000';
        this.dropdown.style.maxHeight = '200px';
        this.dropdown.style.overflowY = 'auto';
        this.dropdown.style.width = '250px';
        document.body.appendChild(this.dropdown);
    }

    setupListeners() {
        this.input.addEventListener('input', (e) => this.handleInput(e));
        this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Lukk menyen hvis man klikker et annet sted
        document.addEventListener('click', (e) => {
            if (this.isMenuOpen && !this.dropdown.contains(e.target) && e.target !== this.input) {
                this.closeMenu();
            }
        });
        
        // Lukk menyen hvis vinduet scrolles (posisjonen kan bli feil)
        window.addEventListener('scroll', () => {
             // Optional: Update position instead of closing
        }, { passive: true });
    }

    async handleInput(e) {
        const cursorPosition = this.input.selectionStart;
        const textBeforeCursor = this.input.value.substring(0, cursorPosition);
        
        // Finn siste ord før markøren
        const words = textBeforeCursor.split(/\s/);
        const lastWord = words[words.length - 1];

        // Sjekk om siste ord starter med @
        if (lastWord.startsWith('@')) {
            this.currentSearchTerm = lastWord.substring(1).toLowerCase();
            this.mentionStartIndex = cursorPosition - lastWord.length;
            
            // Hent aktuelle brukere
            const users = await this.getUsersCallback(this.currentSearchTerm);
            
            if (users && users.length > 0) {
                this.renderDropdown(users);
                this.positionDropdown();
                this.openMenu();
            } else {
                this.closeMenu();
            }
        } else {
            this.closeMenu();
        }
    }

    handleKeyDown(e) {
        if (!this.isMenuOpen) return;

        const items = this.dropdown.querySelectorAll('.mention-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.activeItemIndex = (this.activeItemIndex + 1) % items.length;
            this.updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.activeItemIndex = (this.activeItemIndex - 1 + items.length) % items.length;
            this.updateActiveItem(items);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            items[this.activeItemIndex].click(); // Simulerer et klikk
        } else if (e.key === 'Escape') {
            this.closeMenu();
        }
    }

    updateActiveItem(items) {
        items.forEach(item => item.classList.remove('active'));
        if (items[this.activeItemIndex]) {
            items[this.activeItemIndex].classList.add('active');
            items[this.activeItemIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    renderDropdown(users) {
        this.dropdown.innerHTML = '';
        this.activeItemIndex = 0;

        users.forEach((user, index) => {
            const item = document.createElement('div');
            item.className = `mention-item ${index === 0 ? 'active' : ''}`;
            item.style.padding = '0.5rem';
            item.style.cursor = 'pointer';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '0.5rem';
            item.style.borderBottom = '1px solid var(--color-border)';

            // Hover state logic without standard CSS class (inline for simplicity)
            item.onmouseover = () => {
                const allItems = this.dropdown.querySelectorAll('.mention-item');
                allItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.activeItemIndex = index;
            };

            const img = document.createElement('img');
            img.src = user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`;
            img.style.width = '24px';
            img.style.height = '24px';
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';

            const name = document.createElement('span');
            name.textContent = user.displayName;
            name.style.fontSize = '0.9rem';
            name.style.fontWeight = '500';

            item.appendChild(img);
            item.appendChild(name);

            item.addEventListener('click', () => {
                this.insertTag(user);
            });

            this.dropdown.appendChild(item);
        });
        
        // Add a global style override for the active hover color if not present
        if(!document.getElementById('mention-styles')) {
            const style = document.createElement('style');
            style.id = 'mention-styles';
            style.textContent = `
                .mention-item.active { background-color: var(--color-bg-subtle, #f0f0f0); }
            `;
            document.head.appendChild(style);
        }
    }

    positionDropdown() {
        const rect = this.input.getBoundingClientRect();
        // Plasser rett under input-feltet
        this.dropdown.style.top = `${rect.bottom + window.scrollY}px`;
        this.dropdown.style.left = `${rect.left + window.scrollX}px`;
    }

    openMenu() {
        this.dropdown.classList.remove('hidden');
        this.isMenuOpen = true;
    }

    closeMenu() {
        this.dropdown.classList.add('hidden');
        this.isMenuOpen = false;
        this.activeItemIndex = 0;
    }

    insertTag(user) {
        const text = this.input.value;
        const before = text.substring(0, this.mentionStartIndex);
        // Finn slutten på ordet markøren er i, i tilfelle de har skrevet videre
        const afterSegment = text.substring(this.input.selectionStart);
        
        // Vårt format for lagring av mentions: @Navn (bruker id finnes ved oppslag)
        const tag = `@${user.displayName} `;
        
        this.input.value = before + tag + afterSegment;
        
        // Flytt markøren til etter taggen
        const newCursorPos = before.length + tag.length;
        this.input.setSelectionRange(newCursorPos, newCursorPos);
        
        this.closeMenu();
        if(this.onTagSelected) this.onTagSelected(user);
    }
}

/**
 * Parses text containing @Name and @[Name](uid) and returns it with HTML spans taking the primary color,
 * and extracts a list of unique UIDs tagged.
 * 
 * @param {string} text - text to parse
 * @param {Array} allUsers - the cache of all users
 * @returns {object} { html: string, uids: string[] }
 */
export function parseMentionsForDisplay(text, allUsers = []) {
    if (!text) return { html: '', uids: [] };
    
    const uids = new Set();
    let htmlText = text;

    // 1. Parse old format @[Name](uid)
    const oldRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    htmlText = htmlText.replace(oldRegex, (match, name, uid) => {
        uids.add(uid);
        return `<span class="user-tag" data-uid="${uid}" style="color: var(--color-primary); font-weight: 600; cursor: pointer;" title="Profil">@${name}</span>`;
    });

    // 2. Parse new format @Name based on allUsers lookup
    if (allUsers && allUsers.length > 0) {
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sortedNames = allUsers
            .map(u => u.displayName)
            .filter(n => typeof n === 'string' && n.trim().length > 0)
            .sort((a, b) => b.length - a.length)
            .map(n => escapeRegExp(n));

        if (sortedNames.length > 0) {
            // Must not be immediately following another letter/word character to prevent capturing mid-word
            const regexPattern = `(?:^|\\s)@(${sortedNames.join('|')})(?![a-zA-ZæøåÆØÅ0-9_])`;
            const regex = new RegExp(regexPattern, 'gi');

            htmlText = htmlText.replace(regex, (match, name) => {
                const user = allUsers.find(u => u.displayName.toLowerCase() === name.toLowerCase());
                if (user) {
                    uids.add(user.id);
                    // Match includes the preceding space or ^, we only style the @Name part.
                    const space = match.match(/^\s/);
                    const prefix = space ? space[0] : '';
                    return `${prefix}<span class="user-tag" data-uid="${user.id}" style="color: var(--color-primary); font-weight: 600; cursor: pointer;" title="Profil">@${user.displayName}</span>`;
                }
                return match;
            });
        }
    }
    
    return { 
        html: htmlText, 
        uids: Array.from(uids) 
    };
}

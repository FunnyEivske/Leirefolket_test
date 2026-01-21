(function () {
    // 1. Initialiser tema umiddelbart for å unngå FOUC
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);

    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // 2. Funksjon for å bytte tema
    window.toggleTheme = function () {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateDarkModeIcons(newTheme === 'dark');
    };

    // 3. Oppdater ikoner (sol/måne)
    window.updateDarkModeIcons = function (isDark) {
        const moonIcons = document.querySelectorAll('.moon-icon');
        const sunIcons = document.querySelectorAll('.sun-icon');

        if (isDark) {
            moonIcons.forEach(i => i.classList.add('hidden'));
            sunIcons.forEach(i => i.classList.remove('hidden'));
        } else {
            moonIcons.forEach(i => i.classList.remove('hidden'));
            sunIcons.forEach(i => i.classList.add('hidden'));
        }
    };

    // 4. Når DOM er klar, sett opp lyttere og korrekturles ikoner
    document.addEventListener('DOMContentLoaded', () => {
        const isDarkNow = document.documentElement.getAttribute('data-theme') === 'dark';
        updateDarkModeIcons(isDarkNow);

        // Koble til alle knapper med .theme-toggle klasse
        document.querySelectorAll('.theme-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // e.preventDefault();
                window.toggleTheme();
            });
        });
    });
})();

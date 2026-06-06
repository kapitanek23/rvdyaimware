// Menu Hamburger Script
document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const menuOverlay = document.getElementById('menu-overlay');

    if (!menuToggle || !sidebar) return;
    
    // Otwórz/zamknij menu
    menuToggle.addEventListener('click', function() {
        menuToggle.classList.toggle('active');
        sidebar.classList.toggle('active');
        if (menuOverlay) menuOverlay.classList.toggle('active');
    });
    
    // Zamknij menu po kliknięciu overlay
    if (menuOverlay) {
        menuOverlay.addEventListener('click', function() {
            menuToggle.classList.remove('active');
            sidebar.classList.remove('active');
            menuOverlay.classList.remove('active');
        });
    }
    
    // Zaznacz aktywną stronę
    const normalizePath = function(path) {
        return path
            .replace(/\/index\.html$/, '/')
            .replace(/\/+$/, '/') || '/';
    };
    const currentPath = normalizePath(window.location.pathname);
    const links = document.querySelectorAll('.sidebar-nav a');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        const linkPath = normalizePath(new URL(href, window.location.href).pathname);
        if (linkPath === currentPath) {
            link.classList.add('active');
        }
    });
});

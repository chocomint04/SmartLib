/* =========================================
   dashboard.js
   Path: assets/js/dashboard/dashboard.js
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {

    // ── NOTIFICATIONS BUTTON ──
    const btnNotifications = document.getElementById('btn-notifications');
    btnNotifications.addEventListener('click', () => {
        window.location.href = '../notifications/notifications.html';
    });

    // ── MY LIBRARY BUTTON (hero) ──
    const btnMyLibrary = document.getElementById('btn-my-library');
    btnMyLibrary.addEventListener('click', () => {
        window.location.href = '../user-library/user-library.html';
    });

    // ── SEARCH BUTTON ──
    const btnSearch = document.getElementById('btn-search');
    const searchInput = document.getElementById('search-input');

    btnSearch.addEventListener('click', () => {
        handleSearch();
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    function handleSearch() {
        const query = searchInput.value.trim();
        if (!query) return;
        window.location.href = `../catalog/catalog.html?search=${encodeURIComponent(query)}`;
    }

    // ── CATEGORY PILLS ──
    const categoryPills = document.querySelectorAll('.category-pill');

    categoryPills.forEach(pill => {
        pill.addEventListener('click', () => {
            // Toggle active state
            categoryPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const category = pill.dataset.category;
            window.location.href = `../catalog/catalog.html?category=${encodeURIComponent(category)}`;
        });
    });

    // ── BROWSE BY CATEGORY — SEE ALL ──
    const btnCategoriesSeeAll = document.getElementById('btn-categories-see-all');
    btnCategoriesSeeAll.addEventListener('click', () => {
        window.location.href = '../catalog/catalog.html';
    });

    // ── RECOMMENDED — SEE ALL ──
    const btnRecommendedSeeAll = document.getElementById('btn-recommended-see-all');
    btnRecommendedSeeAll.addEventListener('click', () => {
        window.location.href = '../discover/discover.html';
    });

    // ── BOOK CARDS ──
    const bookCards = document.querySelectorAll('.book-card');

    bookCards.forEach((card, index) => {
        card.addEventListener('click', () => {
            // Replace with real book IDs when data is wired in
            console.log(`Book card ${index + 1} clicked`);
            // window.location.href = `../book-detail/book-detail.html?id=${bookId}`;
        });
    });

});
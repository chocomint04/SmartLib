/* =========================================
   dashboard.js
   Path: assets/js/dashboard/dashboard.js
   ========================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── FIREBASE CONFIG ──
// Replace these values with your actual Firebase project config
// Found at: Firebase Console → Project Settings → General → Your apps → SDK setup
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "smartlib-14f29.firebaseapp.com",
    projectId: "smartlib-14f29",
    storageBucket: "smartlib-14f29.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ── FIRESTORE COLLECTION NAMES ──
// Adjust these to match your actual Firestore collection names
const COLLECTIONS = {
    books: "books",           // All library books
    borrows: "borrows",       // Active borrow records  { userId, bookId, dueDate, status }
    wishlist: "wishlist",     // Wishlist items          { userId, bookId }
    readingStreak: "streaks"  // Reading streak          { userId, streakDays }
};

// ── DOM READY ──
document.addEventListener('DOMContentLoaded', () => {

    // Wait for auth state before loading user-specific data
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadGreeting(user);
            loadStats(user.uid);
            loadRecommendedBooks(user.uid);
        } else {
            // Not logged in — authGuard.js should handle redirect
            console.warn("No user logged in.");
        }
    });

    // Load non-user-specific data immediately
    loadCategories();
    setupSearch();
    setupNavButtons();
});

// ── GREETING ──
function loadGreeting(user) {
    const nameEl = document.querySelector('.hero-greeting h1');
    if (nameEl) {
        nameEl.textContent = user.displayName || user.email?.split('@')[0] || 'Student';
    }
}

// ── STATS ──
async function loadStats(userId) {
    try {
        // Currently Borrowed
        const borrowedQuery = query(
            collection(db, COLLECTIONS.borrows),
            where("userId", "==", userId),
            where("status", "==", "active")
        );
        const borrowedSnap = await getCountFromServer(borrowedQuery);
        setStatCard(0, borrowedSnap.data().count);

        // Due Soon (within next 3 days)
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        const dueSoonQuery = query(
            collection(db, COLLECTIONS.borrows),
            where("userId", "==", userId),
            where("status", "==", "active"),
            where("dueDate", "<=", threeDaysFromNow)
        );
        const dueSoonSnap = await getCountFromServer(dueSoonQuery);
        setStatCard(1, dueSoonSnap.data().count);

        // Wishlist
        const wishlistQuery = query(
            collection(db, COLLECTIONS.wishlist),
            where("userId", "==", userId)
        );
        const wishlistSnap = await getCountFromServer(wishlistQuery);
        setStatCard(2, wishlistSnap.data().count);

        // Reading Streak
        const streakQuery = query(
            collection(db, COLLECTIONS.readingStreak),
            where("userId", "==", userId),
            limit(1)
        );
        const streakSnap = await getDocs(streakQuery);
        const streakDays = streakSnap.empty ? 0 : (streakSnap.docs[0].data().streakDays || 0);
        setStatCard(3, streakDays);

    } catch (err) {
        console.error("Error loading stats:", err);
    }
}

function setStatCard(index, value) {
    const cards = document.querySelectorAll('.stat-card .stat-number');
    if (cards[index]) cards[index].textContent = value;
}

// ── CATEGORIES ──
// Categories are hardcoded in HTML, but this function can also load them
// dynamically from Firestore if you have a "categories" collection.
async function loadCategories() {
    try {
        // Optional: load categories dynamically from Firestore
        // const snapshot = await getDocs(collection(db, "categories"));
        // const grid = document.querySelector('.categories-grid');
        // grid.innerHTML = '';
        // snapshot.forEach(doc => {
        //     const btn = document.createElement('button');
        //     btn.className = 'category-pill';
        //     btn.dataset.category = doc.id;
        //     btn.textContent = doc.data().name;
        //     grid.appendChild(btn);
        // });

        // Wire up existing category pills
        const categoryPills = document.querySelectorAll('.category-pill');
        categoryPills.forEach(pill => {
            pill.addEventListener('click', () => {
                categoryPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                const category = pill.dataset.category;
                window.location.href = `../catalog/catalog.html?category=${encodeURIComponent(category)}`;
            });
        });

        const btnCategoriesSeeAll = document.getElementById('btn-categories-see-all');
        btnCategoriesSeeAll?.addEventListener('click', () => {
            window.location.href = '../catalog/catalog.html';
        });

    } catch (err) {
        console.error("Error loading categories:", err);
    }
}

// ── RECOMMENDED BOOKS ──
// Fetches the 5 most recently added books from Firestore as "recommended"
// You can replace this logic with a more sophisticated recommendation query
async function loadRecommendedBooks(userId) {
    const grid = document.querySelector('.recommended-grid');
    if (!grid) return;

    // Show skeleton loading state
    grid.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        grid.innerHTML += `<div class="book-card loading-skeleton"></div>`;
    }

    try {
        // Get user's already-borrowed book IDs to exclude them
        const borrowedQuery = query(
            collection(db, COLLECTIONS.borrows),
            where("userId", "==", userId),
            where("status", "==", "active")
        );
        const borrowedSnap = await getDocs(borrowedQuery);
        const borrowedBookIds = borrowedSnap.docs.map(d => d.data().bookId);

        // Fetch recent books — adjust orderBy field to match your Firestore schema
        const booksQuery = query(
            collection(db, COLLECTIONS.books),
            orderBy("dateAdded", "desc"),
            limit(10) // Fetch extra to filter out already-borrowed
        );
        const booksSnap = await getDocs(booksQuery);

        const books = [];
        booksSnap.forEach(doc => {
            if (!borrowedBookIds.includes(doc.id)) {
                books.push({ id: doc.id, ...doc.data() });
            }
        });

        // Render up to 5 book cards
        grid.innerHTML = '';
        const toShow = books.slice(0, 5);

        if (toShow.length === 0) {
            grid.innerHTML = `<p class="empty-state">No recommendations yet.</p>`;
            return;
        }

        toShow.forEach(book => {
            const card = createBookCard(book);
            grid.appendChild(card);
        });

    } catch (err) {
        console.error("Error loading recommended books:", err);
        grid.innerHTML = `<p class="empty-state">Could not load recommendations.</p>`;
    }

    // Wire up See All
    const btnRecommendedSeeAll = document.getElementById('btn-recommended-see-all');
    btnRecommendedSeeAll?.addEventListener('click', () => {
        window.location.href = '../discover/discover.html';
    });
}

// ── BUILD BOOK CARD ──
// Adjust field names (title, author, coverUrl, etc.) to match your Firestore schema
function createBookCard(book) {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
        <div class="book-cover">
            ${book.coverUrl
                ? `<img src="${book.coverUrl}" alt="${book.title}" loading="lazy" />`
                : `<div class="book-cover-placeholder">📖</div>`}
        </div>
        <div class="book-info">
            <p class="book-title">${book.title || 'Untitled'}</p>
            <p class="book-author">${book.author || 'Unknown Author'}</p>
            <p class="book-category">${book.category || ''}</p>
        </div>
    `;
    card.addEventListener('click', () => {
        window.location.href = `../book-detail/book-detail.html?id=${book.id}`;
    });
    return card;
}

// ── SEARCH ──
function setupSearch() {
    const btnSearch = document.getElementById('btn-search');
    const searchInput = document.getElementById('search-input');

    btnSearch?.addEventListener('click', handleSearch);
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    function handleSearch() {
        const query = searchInput.value.trim();
        if (!query) return;
        window.location.href = `../catalog/catalog.html?search=${encodeURIComponent(query)}`;
    }
}

// ── NAV BUTTONS ──
function setupNavButtons() {
    document.getElementById('btn-notifications')?.addEventListener('click', () => {
        window.location.href = '../notifications/notifications.html';
    });
    document.getElementById('btn-my-library')?.addEventListener('click', () => {
        window.location.href = '../user-library/user-library.html';
    });
}
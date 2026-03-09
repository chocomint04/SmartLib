/* =========================================
   dashboard.js
   Path: assets/js/dashboard/dashboard.js
   ========================================= */

import { db, auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

function humanize(name) {
  return String(name).replace(/_/g, " ");
}

async function loadUserName(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      const name = data.name || data.displayName || data.email || "Student";
      document.querySelector(".hero-greeting h1").textContent = name.split(" ")[0];
    }
  } catch (err) {
    console.warn("Could not load user name", err);
  }
}

async function loadStats(uid) {
  try {
    const txSnap = await getDocs(
      query(collection(db, "borrowing_transactions"), where("user_id", "==", uid))
    );

    let borrowed = 0;
    let dueSoon = 0;
    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    txSnap.forEach((d) => {
      const data = d.data();
      const status = String(data.status || "").toLowerCase();
      if (status === "borrowed") {
        borrowed++;
        if (data.due_date) {
          const dueMs = typeof data.due_date.toMillis === "function"
            ? data.due_date.toMillis()
            : new Date(data.due_date).getTime();
          if (dueMs - now <= threeDays && dueMs > now) dueSoon++;
        }
      }
    });

    let wishlist = 0;
    try {
      const savedSnap = await getDocs(
        query(collection(db, "saved_resources"), where("user_id", "==", uid))
      );
      wishlist = savedSnap.size;
    } catch (_) {}

    let streak = 0;
    try {
      const returnedDays = new Set();
      txSnap.forEach((d) => {
        const data = d.data();
        if (String(data.status || "").toLowerCase() === "returned" && data.return_date) {
          const ms = typeof data.return_date.toMillis === "function"
            ? data.return_date.toMillis()
            : new Date(data.return_date).getTime();
          returnedDays.add(new Date(ms).toDateString());
        }
      });
      streak = returnedDays.size;
    } catch (_) {}

    document.getElementById("stat-borrowed").textContent = borrowed;
    document.getElementById("stat-due-soon").textContent = dueSoon;
    document.getElementById("stat-wishlist").textContent = wishlist;
    document.getElementById("stat-streak").textContent = streak;
  } catch (err) {
    console.error("Error loading stats", err);
  }
}

async function loadCategories() {
  try {
    const snap = await getDocs(collection(db, "resources"));
    const counts = {};
    snap.forEach((d) => {
      const prog = d.data().program || "Uncategorized";
      counts[prog] = (counts[prog] || 0) + 1;
    });

    const top5 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const grid = document.getElementById("categories-grid");
    if (!grid) return;

    grid.innerHTML = top5.map(([prog]) => `
      <button class="category-pill" data-category="${encodeURIComponent(prog)}">
        ${humanize(prog)}
      </button>
    `).join("");

    grid.querySelectorAll(".category-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        grid.querySelectorAll(".category-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        window.location.href = `../catalog/category.html?program=${pill.dataset.category}`;
      });
    });
  } catch (err) {
    console.error("Error loading categories", err);
  }
}

async function loadRecommended() {
  try {
    const snap = await getDocs(collection(db, "resources"));
    const books = [];
    snap.forEach((d) => books.push({ id: d.id, ...d.data() }));

    const shuffled = books.sort(() => 0.5 - Math.random()).slice(0, 5);
    const grid = document.getElementById("recommended-grid");
    if (!grid) return;

    grid.innerHTML = shuffled.map((book) => {
      const title = book.title_of_material || book.title || "Unknown Title";
      const author = book.author || "";
      const isbn = book.isbn ? String(book.isbn).replace(/\s*\(.*\)/, "").trim() : "";
      const coverUrl = isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : "";
      return `
        <div class="book-card" data-id="${book.id}" style="cursor:pointer;">
          ${coverUrl ? `<img src="${coverUrl}" alt="${title}" style="width:100%;height:140px;object-fit:cover;border-radius:8px 8px 0 0;" onerror="this.style.display='none'">` : ""}
          <div style="padding:10px;">
            <div style="font-size:0.82rem;font-weight:700;color:#111;line-height:1.3;">${title}</div>
            ${author ? `<div style="font-size:0.75rem;color:#666;margin-top:3px;">${author}</div>` : ""}
          </div>
        </div>`;
    }).join("");

    grid.querySelectorAll(".book-card").forEach((card) => {
      card.addEventListener("click", () => {
        window.location.href = `../resource-details/resource-details.html?id=${card.dataset.id}`;
      });
    });
  } catch (err) {
    console.error("Error loading recommended books", err);
  }
}

function setupSearch() {
  const btnSearch = document.getElementById("btn-search");
  const searchInput = document.getElementById("search-input");

  function handleSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    window.location.href = `../search-results/search-results.html?query=${encodeURIComponent(q)}`;
  }

  btnSearch.addEventListener("click", handleSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
}

function setupButtons() {
  document.getElementById("btn-my-library")?.addEventListener("click", () => {
    window.location.href = "../user-library/user-library.html";
  });
  document.getElementById("btn-categories-see-all")?.addEventListener("click", () => {
    window.location.href = "../catalog/catalog.html";
  });
  document.getElementById("btn-recommended-see-all")?.addEventListener("click", () => {
    window.location.href = "../discover/discover.html";
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  setupSearch();
  setupButtons();
  await loadUserName(user.uid);
  await loadStats(user.uid);
  await loadCategories();
  await loadRecommended();
});
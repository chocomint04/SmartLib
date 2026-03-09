// archives.js
// Path: assets/js/admin/archives.js
// Admin-side Archives — full collection, NO grad_only filtering

import { db, auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ── STATE ─────────────────────────────────────────────────────────────────────
let allResources = [];
let filtered = [];
let page = 0;
const PAGE_SIZE = 24;

// ── DOM REFS ──────────────────────────────────────────────────────────────────
const grid = document.getElementById("archives-grid");
const countEl = document.getElementById("archives-count");
const loadMoreRow = document.getElementById("load-more-row");
const loadMoreBtn = document.getElementById("load-more-btn");
const searchInput = document.getElementById("archives-search-input");
const searchBtn = document.getElementById("archives-search-btn");
const filterProgram = document.getElementById("filter-program");
const filterCollection = document.getElementById("filter-collection");
const filterGrad = document.getElementById("filter-grad");
const filterYear = document.getElementById("filter-year");

// Drawer
const overlay = document.getElementById("drawer-overlay");
const drawer = document.getElementById("archives-drawer");
const drawerClose = document.getElementById("drawer-close");

// ── HELPERS ───────────────────────────────────────────────────────────────────
function humanize(str) {
  return String(str || "").replace(/_/g, " ").trim();
}

function availabilityColor(status) {
  if (!status) return "#666";
  const s = status.toLowerCase();
  if (s === "available") return "#4caf50";
  if (s === "borrowed" || s === "checked out") return "#ef5350";
  return "#f0c020";
}

// ── POPULATE FILTERS ──────────────────────────────────────────────────────────
function populateFilters(resources) {
  const programs = [...new Set(resources.map((r) => r.program).filter(Boolean))].sort();
  const collections = [...new Set(resources.map((r) => r.collection).filter(Boolean))].sort();
  const years = [...new Set(resources.map((r) => String(r.year || "")).filter(Boolean))].sort((a, b) => b - a);

  programs.forEach((p) => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = humanize(p);
    filterProgram.appendChild(o);
  });

  collections.forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = humanize(c);
    filterCollection.appendChild(o);
  });

  years.forEach((y) => {
    const o = document.createElement("option");
    o.value = y;
    o.textContent = y;
    filterYear.appendChild(o);
  });
}

// ── BUILD COVER FALLBACK ───────────────────────────────────────────────────────
function buildCoverFallback(title) {
  return `
    <div class="card-cover-fallback">
      <span class="book-icon">📖</span>
      <span class="cover-title-preview">${title}</span>
    </div>`;
}

// ── RENDER CARD ───────────────────────────────────────────────────────────────
function renderCard(r) {
  const title = r.title_of_material || r.title || "Untitled";
  const author = r.author || "Unknown Author";
  const year = r.year || "";
  const program = r.program || "";
  const isGrad = !!r.grad_only;

  const badge = isGrad
    ? `<span class="card-grad-badge">Grad+</span>`
    : `<span class="card-open-badge">Open</span>`;

  const avail = r.availability_status || "";
  const availDot = avail
    ? `<span class="avail-dot" style="background:${availabilityColor(avail)}"></span>${humanize(avail)}`
    : "";

  return `
    <div class="archive-card" data-id="${r.id}">
      <div class="card-cover">
        ${buildCoverFallback(title)}
        ${badge}
      </div>
      <div class="card-body">
        ${program ? `<div class="card-program-tag">${humanize(program)}</div>` : ""}
        <div class="card-title">${title}</div>
        <div class="card-meta">
          <div class="card-author-line">${author}</div>
          <div class="card-bottom-row">
            ${year ? `<span class="card-year">${year}</span>` : ""}
            ${avail ? `<span class="card-avail">${availDot}</span>` : ""}
          </div>
        </div>
      </div>
    </div>`;
}

// ── RENDER PAGE ───────────────────────────────────────────────────────────────
function renderPage(reset = false) {
  if (reset) {
    page = 0;
    grid.innerHTML = "";
  }

  const start = page * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="archives-empty">
        <span class="empty-icon">🗂️</span>
        <p>No resources match your search or filters.</p>
      </div>`;
    loadMoreRow.style.display = "none";
    countEl.textContent = "0 resources";
    return;
  }

  grid.insertAdjacentHTML("beforeend", slice.map(renderCard).join(""));
  page++;

  const shown = Math.min(page * PAGE_SIZE, filtered.length);
  countEl.textContent = `${shown} / ${filtered.length} resources`;
  loadMoreRow.style.display = shown < filtered.length ? "flex" : "none";

  // Attach click handlers to newly added cards
  slice.forEach((r) => {
    const card = grid.querySelector(`.archive-card[data-id="${r.id}"]`);
    if (card) card.addEventListener("click", () => openDrawer(r));
  });
}

// ── APPLY FILTERS ─────────────────────────────────────────────────────────────
function applyFilters() {
  const q = searchInput.value.toLowerCase().trim();
  const prog = filterProgram.value;
  const coll = filterCollection.value;
  const grad = filterGrad.value;
  const year = filterYear.value;

  filtered = allResources.filter((r) => {
    const title = (r.title_of_material || r.title || "").toLowerCase();
    const author = (r.author || "").toLowerCase();
    const accession = (r.accession_no || "").toLowerCase();
    const isbn = (r.isbn || "").toLowerCase();

    if (q && !title.includes(q) && !author.includes(q) && !accession.includes(q) && !isbn.includes(q)) return false;
    if (prog && r.program !== prog) return false;
    if (coll && r.collection !== coll) return false;
    if (year && String(r.year || "") !== year) return false;
    if (grad === "grad" && !r.grad_only) return false;
    if (grad === "open" && r.grad_only) return false;
    return true;
  });

  renderPage(true);
}

// ── DRAWER ────────────────────────────────────────────────────────────────────
function openDrawer(r) {
  const title = r.title_of_material || r.title || "Untitled";
  const isGrad = !!r.grad_only;

  document.getElementById("drawer-title").textContent = title;
  document.getElementById("drawer-author").textContent = r.author || "Unknown Author";
  document.getElementById("dm-accession").textContent = r.accession_no || "—";
  document.getElementById("dm-year").textContent = r.year || "—";
  document.getElementById("dm-program").textContent = humanize(r.program) || "—";
  document.getElementById("dm-collection").textContent = humanize(r.collection) || "—";
  document.getElementById("dm-callno").textContent = r.call_number || "—";
  document.getElementById("dm-isbn").textContent = r.isbn || "—";
  document.getElementById("dm-alma").textContent = r.date_in_alma || "—";
  document.getElementById("dm-drno").textContent = r.dr_no || "—";

  const availEl = document.getElementById("dm-availability");
  const avail = r.availability_status || "—";
  availEl.textContent = humanize(avail);
  availEl.style.color = availabilityColor(avail);

  document.getElementById("drawer-description").textContent = r.description || "";

  const badge = document.getElementById("drawer-access-badge");
  if (isGrad) {
    badge.textContent = "Grad-Only";
    badge.className = "drawer-access-badge badge-grad";
  } else {
    badge.textContent = "Open Access";
    badge.className = "drawer-access-badge badge-open";
  }

  // Cover placeholder
  const coverEl = document.getElementById("drawer-cover");
  coverEl.style.display = "none";
  document.getElementById("drawer-cover-fallback").innerHTML = `
    <span class="drawer-fallback-icon">📖</span>
    <span class="drawer-fallback-title">${title}</span>`;

  // View link
  const viewLink = document.getElementById("drawer-view-link");
  viewLink.href = `../resource-details/resource-details.html?id=${r.id}`;

  // Toggle grad button
  const toggleBtn = document.getElementById("drawer-toggle-grad");
  toggleBtn.textContent = isGrad ? "Remove Restriction" : "Set as Grad-Only";
  toggleBtn.dataset.id = r.id;
  toggleBtn.dataset.current = isGrad ? "grad" : "open";

  overlay.classList.add("open");
  drawer.classList.add("open");
}

function closeDrawer() {
  overlay.classList.remove("open");
  drawer.classList.remove("open");
}

drawerClose.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);

// ── TOGGLE GRAD-ONLY FROM DRAWER ──────────────────────────────────────────────
document.getElementById("drawer-toggle-grad").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const isCurrGrad = btn.dataset.current === "grad";
  const newVal = !isCurrGrad;

  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    await updateDoc(doc(db, "resources", id), { grad_only: newVal });
    const r = allResources.find((x) => x.id === id);
    if (r) r.grad_only = newVal;

    // refresh card in grid
    const card = grid.querySelector(`.archive-card[data-id="${id}"]`);
    if (card) {
      const newCard = document.createElement("div");
      newCard.innerHTML = renderCard(r);
      const newEl = newCard.firstElementChild;
      newEl.addEventListener("click", () => openDrawer(r));
      card.replaceWith(newEl);
    }

    closeDrawer();
  } catch (err) {
    console.error("Failed to update", err);
    btn.disabled = false;
    btn.textContent = isCurrGrad ? "Remove Restriction" : "Set as Grad-Only";
    alert("Failed to update restriction. Please try again.");
  }
});

// ── EVENT LISTENERS ───────────────────────────────────────────────────────────
searchBtn.addEventListener("click", applyFilters);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });
filterProgram.addEventListener("change", applyFilters);
filterCollection.addEventListener("change", applyFilters);
filterGrad.addEventListener("change", applyFilters);
filterYear.addEventListener("change", applyFilters);
loadMoreBtn.addEventListener("click", () => renderPage(false));

// ── LOAD ALL RESOURCES ────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const snap = await getDocs(collection(db, "resources"));
    // ★ No grad_only filter — admin sees EVERYTHING
    allResources = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    allResources.sort((a, b) =>
      (a.title_of_material || a.title || "").localeCompare(b.title_of_material || b.title || "")
    );
    filtered = [...allResources];
    populateFilters(allResources);
    renderPage(true);
  } catch (err) {
    console.error("Error loading resources", err);
    grid.innerHTML = `
      <div class="archives-empty">
        <span class="empty-icon">⚠️</span>
        <p>Failed to load resources. Please refresh.</p>
      </div>`;
  }
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../auth/login.html";
    return;
  }
  // Verify admin/staff role
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.exists() ? snap.data().role : null;
    if (role !== "admin" && role !== "staff") {
      window.location.href = "../auth/login.html";
      return;
    }
    await loadAll();
  } catch (err) {
    console.error("Auth check error", err);
    await loadAll(); // allow gracefully if Firestore check fails
  }
});

import { auth, db } from "../firebase/firebase.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

export const COVER_FALLBACK_URL = "../../assets/images/sample.png";

export function safeText(value) {
  return value == null ? "" : String(value);
}

export function escapeHtml(value) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getCoverUrl(data) {
  if (data && data.isbn) {
    const isbn = String(data.isbn).replace(/\s*\(.*\)/, "").trim();
    if (isbn) {
      return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`;
    }
  }

  const cover = safeText(data && data.cover_url).trim();
  if (!cover) return COVER_FALLBACK_URL;
  if (cover.startsWith("//")) return `https:${cover}`;
  return cover;
}

export function getCurrentUserId() {
  if (auth && auth.currentUser && auth.currentUser.uid) {
    return auth.currentUser.uid;
  }

  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed && parsed.uid ? String(parsed.uid) : "";
  } catch (_error) {
    return "";
  }
}

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

function sortByFieldDesc(items, fieldName) {
  return [...items].sort((left, right) => getTimestampMillis(right[fieldName]) - getTimestampMillis(left[fieldName]));
}

function mergeResourceData(accessionNo, resourcesByAccession) {
  const resource = resourcesByAccession.get(accessionNo) || {};

  return {
    accession_no: accessionNo,
    title_of_material: safeText(resource.title_of_material || "Untitled"),
    author: safeText(resource.author || "Unknown author"),
    program: safeText(resource.program || resource.collection || "Resource"),
    collection: safeText(resource.collection || ""),
    cover_url: getCoverUrl(resource),
  };
}

export async function getResourcesByAccession() {
  const resourcesSnap = await getDocs(collection(db, "resources"));
  const resourcesByAccession = new Map();

  resourcesSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const accession = safeText(data.accession_no).trim();
    if (!accession || resourcesByAccession.has(accession)) return;
    resourcesByAccession.set(accession, { id: docSnap.id, ...data });
  });

  return resourcesByAccession;
}

export async function getSavedItemsForUser(userId, resourcesByAccession) {
  if (!userId) return [];

  const savedQuery = query(collection(db, "saved_resources"), where("user_id", "==", userId));
  const savedSnap = await getDocs(savedQuery);

  const savedRows = savedSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const accession = safeText(data.accession_no).trim();
    if (!accession) return null;

    return {
      id: docSnap.id,
      ...mergeResourceData(accession, resourcesByAccession),
      saved_date: data.saved_date || null,
    };
  }).filter(Boolean);

  return sortByFieldDesc(savedRows, "saved_date");
}

export async function getBorrowItemsForUser(userId, resourcesByAccession) {
  if (!userId) return [];

  const borrowQuery = query(collection(db, "borrowing_transactions"), where("user_id", "==", userId));
  const borrowSnap = await getDocs(borrowQuery);

  const borrowRows = borrowSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const accession = safeText(data.accession_no).trim();
    if (!accession) return null;

    return {
      id: docSnap.id,
      ...mergeResourceData(accession, resourcesByAccession),
      status: safeText(data.status || "").toLowerCase(),
      request_date: data.request_date || null,
      borrow_date: data.borrow_date || null,
      due_date: data.due_date || null,
      return_date: data.return_date || null,
    };
  }).filter(Boolean);

  return sortByFieldDesc(borrowRows, "request_date");
}

export function getResourceDetailsHref(accessionNo) {
  const accession = safeText(accessionNo).trim();
  if (!accession) return "../catalog/catalog.html";
  return `../resource-details/resource-details.html?accession=${encodeURIComponent(accession)}`;
}

export function formatStatus(status) {
  const text = safeText(status).trim();
  if (!text) return "Unknown";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function formatDate(value) {
  const timestamp = getTimestampMillis(value);
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function renderBookCards(container, items, options = {}) {
  if (!container) return;

  const {
    emptyMessage = "No items yet.",
    dateField = "",
    statusField = "",
  } = options;

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `<p class="library-empty">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const title = escapeHtml(item.title_of_material || "Untitled");
    const subtitle = escapeHtml(item.author || item.program || "Resource");
    const collection = escapeHtml(item.collection || "");
    const coverUrl = escapeHtml(item.cover_url || COVER_FALLBACK_URL);
    const fallbackUrl = escapeHtml(COVER_FALLBACK_URL);
    const detailsHref = getResourceDetailsHref(item.accession_no);

    const statusLabel = statusField && item[statusField]
      ? `<p class="card-meta status">${escapeHtml(formatStatus(item[statusField]))}</p>`
      : "";

    const dateLabel = dateField && item[dateField]
      ? `<p class="card-meta">${escapeHtml(formatDate(item[dateField]))}</p>`
      : "";

    return `
      <a class="book-item" href="${detailsHref}">
        <div class="book-cover">
          <img src="${coverUrl}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackUrl}'">
        </div>
        <div class="book-info">
          <h4>${title}</h4>
          <p>${subtitle}</p>
          <p>${collection}</p>
          ${statusLabel}
          ${dateLabel}
        </div>
      </a>
    `;
  }).join("");
}

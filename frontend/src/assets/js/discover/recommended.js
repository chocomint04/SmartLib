import { auth, db } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const COVER_FALLBACK_URL = "../../assets/images/sample.png";
const grid = document.querySelector(".recommended-grid");
let loadInProgress = false;

function safeText(value) {
  return value == null ? "" : String(value);
}

function escapeHtml(value) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCoverUrl(data) {
  if (data && data.isbn) {
    const isbn = String(data.isbn).replace(/\s*\(.*\)/, "").trim();
    if (isbn) {
      return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`;
    }
  }

  const cover = safeText(data && data.cover_url).trim();
  if (!cover) return "";
  if (cover.startsWith("//")) return `https:${cover}`;
  return cover;
}

function getCurrentUserId() {
  if (auth && auth.currentUser && auth.currentUser.uid) {
    return auth.currentUser.uid;
  }

  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed && parsed.uid ? String(parsed.uid) : "";
  } catch (_err) {
    return "";
  }
}

function renderMessage(message) {
  if (!grid) return;
  grid.innerHTML = `<p class="recommended-message">${escapeHtml(message)}</p>`;
}

function renderRecommendations(items) {
  if (!grid) return;

  if (!Array.isArray(items) || items.length === 0) {
    renderMessage("No recommendations yet. Save resources and search more to improve results.");
    return;
  }

  const html = items
    .map((item) => {
      const title = escapeHtml(item.title_of_material || "Untitled");
      const program = escapeHtml(item.program || item.collection || "Resource");
      const collection = escapeHtml(item.collection || "");
      const coverUrl = escapeHtml(item.cover_url || COVER_FALLBACK_URL);
      const fallbackUrl = escapeHtml(COVER_FALLBACK_URL);
      const accession = safeText(item.accession_no || "").trim();
      const detailsHref = accession
        ? `../resource-details/resource-details.html?accession=${encodeURIComponent(accession)}`
        : "../catalog/catalog.html";

      return `
        <a class="book-item" href="${detailsHref}">
          <div class="book-cover">
            <img src="${coverUrl}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackUrl}'">
          </div>
          <div class="book-info">
            <h4>${title}</h4>
            <p>${program}</p>
            <p>${collection}</p>
          </div>
        </a>
      `;
    })
    .join("");

  grid.innerHTML = html;
}

async function loadStoredRecommendations(userId) {
  let recDocs = [];

  try {
    const recQuery = query(
      collection(db, "recommendations"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc"),
      limit(21)
    );
    const recSnap = await getDocs(recQuery);
    recDocs = recSnap.docs;
  } catch (_err) {
    const fallbackQuery = query(
      collection(db, "recommendations"),
      where("user_id", "==", userId),
      limit(50)
    );
    const fallbackSnap = await getDocs(fallbackQuery);
    recDocs = fallbackSnap.docs;
  }

  if (!recDocs.length) {
    return [];
  }

  const recItems = recDocs.map((docSnap) => docSnap.data() || {});
  const resourcesSnap = await getDocs(collection(db, "resources"));

  const resourcesByAccession = new Map();
  resourcesSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const accession = safeText(data.accession_no).trim();
    if (!accession || resourcesByAccession.has(accession)) return;
    resourcesByAccession.set(accession, { id: docSnap.id, ...data });
  });

  return recItems.map((rec) => {
    const accession = safeText(rec.accession_no).trim();
    const resource = resourcesByAccession.get(accession) || {};
    const coverUrl = getCoverUrl(resource);
    return {
      accession_no: accession,
      title_of_material: resource.title_of_material || rec.title_of_material || "",
      program: resource.program || rec.program || "",
      collection: resource.collection || rec.collection || "",
      cover_url: coverUrl,
      score: rec.score || 0,
    };
  });
}

async function loadRecommended() {
  if (!grid) return;
  if (loadInProgress) return;

  const userId = getCurrentUserId();
  if (!userId) {
    renderMessage("Please log in to view your recommendations.");
    return;
  }

  loadInProgress = true;
  renderMessage("Loading recommendations...");

  try {
    const recommendations = await loadStoredRecommendations(userId);
    renderRecommendations(recommendations);
  } catch (error) {
    console.error("Failed to fetch recommendations", error);
    renderMessage("Could not load recommendations right now.");
  } finally {
    loadInProgress = false;
  }
}

onAuthStateChanged(auth, () => {
  loadRecommended();
});

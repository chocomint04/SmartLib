import { db } from "../firebase/firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const COVER_FALLBACK_URL = "../../assets/images/sample.png";
const grid = document.querySelector(".trending-grid");

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
    if (isbn) return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`;
  }

  const cover = safeText(data && data.cover_url).trim();
  if (!cover) return COVER_FALLBACK_URL;
  if (cover.startsWith("//")) return `https:${cover}`;
  return cover;
}

function renderMessage(message) {
  if (!grid) return;
  grid.innerHTML = `<p class="trending-message">${escapeHtml(message)}</p>`;
}

async function getResourcesByAccession() {
  const snap = await getDocs(collection(db, "resources"));
  const map = new Map();

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const accession = safeText(data.accession_no).trim();
    if (!accession || map.has(accession)) return;
    map.set(accession, { id: docSnap.id, ...data });
  });

  return map;
}

async function getTrendingItems(limitCount = 21) {
  const [resourcesByAccession, savedSnap] = await Promise.all([
    getResourcesByAccession(),
    getDocs(collection(db, "saved_resources")),
  ]);

  const countByAccession = new Map();
  savedSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const accession = safeText(data.accession_no).trim();
    if (!accession) return;
    countByAccession.set(accession, (countByAccession.get(accession) || 0) + 1);
  });

  return Array.from(countByAccession.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([accession, saveCount]) => {
      const resource = resourcesByAccession.get(accession) || {};
      return {
        accession_no: accession,
        title_of_material: safeText(resource.title_of_material || "Untitled"),
        author: safeText(resource.author || "Unknown author"),
        program: safeText(resource.program || ""),
        cover_url: getCoverUrl(resource),
        save_count: saveCount,
      };
    })
    .filter((item) => item.accession_no)
    .slice(0, limitCount);
}

function renderTrending(items) {
  if (!grid) return;
  if (!Array.isArray(items) || items.length === 0) {
    renderMessage("No trending books yet.");
    return;
  }

  grid.innerHTML = items
    .map((item) => {
      const title = escapeHtml(item.title_of_material);
      const subtitle = escapeHtml(item.author || item.program || "");
      const coverUrl = escapeHtml(item.cover_url || COVER_FALLBACK_URL);
      const fallbackUrl = escapeHtml(COVER_FALLBACK_URL);
      const href = `../resource-details/resource-details.html?accession=${encodeURIComponent(item.accession_no)}`;

      return `
        <a class="book-item" href="${href}">
          <div class="book-cover">
            <img src="${coverUrl}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackUrl}'">
          </div>
          <div class="book-info">
            <h4>${title}</h4>
            <p>${subtitle}</p>
          </div>
        </a>
      `;
    })
    .join("");
}

async function loadTrending() {
  if (!grid) return;

  renderMessage("Loading trending books...");

  try {
    const items = await getTrendingItems(21);
    renderTrending(items);
  } catch (error) {
    console.error("Failed to load trending books", error);
    renderMessage("Could not load trending books right now.");
  }
}

loadTrending();
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

const API_BASE_URL = "https://smartlibmapua.onrender.com";
const COVER_FALLBACK_URL = "../../assets/images/sample.png";
const loadingOverlay = document.getElementById("discoverLoading");

function setLoadingOverlay(visible) {
  if (!loadingOverlay) return;
  loadingOverlay.classList.toggle("hidden", !visible);
  loadingOverlay.setAttribute("aria-busy", visible ? "true" : "false");
}

function safeText(value) {
  return value == null ? "" : String(value);
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

function getCurrentUserId() {
  if (auth && auth.currentUser && auth.currentUser.uid) return auth.currentUser.uid;

  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed && parsed.uid ? String(parsed.uid) : "";
  } catch (_err) {
    return "";
  }
}

async function triggerRecommendationGeneration(userId) {
  const response = await fetch(
    `${API_BASE_URL}/recommendations/${encodeURIComponent(userId)}/generate?force=true&top_k=21&search_limit=10&saved_limit=100`,
    { method: "POST", headers: { "Content-Type": "application/json" } }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Generation failed (${response.status})`);
  }
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

async function getUserRecommendations(userId, resourcesByAccession) {
  let docs = [];

  try {
    const recQuery = query(
      collection(db, "recommendations"),
      where("user_id", "==", userId),
      orderBy("created_at", "desc"),
      limit(21)
    );
    const snap = await getDocs(recQuery);
    docs = snap.docs;
  } catch (_err) {
    const fallback = query(
      collection(db, "recommendations"),
      where("user_id", "==", userId),
      limit(50)
    );
    const snap = await getDocs(fallback);
    docs = snap.docs;
  }

  return docs.map((docSnap) => {
    const rec = docSnap.data() || {};
    const accession = safeText(rec.accession_no).trim();
    const resource = resourcesByAccession.get(accession) || {};
    return {
      accession_no: accession,
      title_of_material: safeText(resource.title_of_material || rec.title_of_material || "Untitled"),
      author: safeText(resource.author || "Unknown author"),
      program: safeText(resource.program || rec.program || ""),
      collection: safeText(resource.collection || rec.collection || ""),
      description: safeText(resource.description || "Description not available."),
      cover_url: getCoverUrl(resource),
    };
  });
}

async function getTrendingResources(resourcesByAccession) {
  const savedSnap = await getDocs(collection(db, "saved_resources"));
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
    .slice(0, 21);
}

async function hasUserSignals(userId) {
  const [savedSnap, searchSnap] = await Promise.all([
    getDocs(query(collection(db, "saved_resources"), where("user_id", "==", userId), limit(1))),
    getDocs(query(collection(db, "search_history"), where("user_id", "==", userId), limit(1))),
  ]);

  return !savedSnap.empty || !searchSnap.empty;
}

function getRandomRecommendations(resourcesByAccession, count = 6) {
  const items = Array.from(resourcesByAccession.values())
    .map((resource) => ({
      accession_no: safeText(resource.accession_no).trim(),
      title_of_material: safeText(resource.title_of_material || "Untitled"),
      author: safeText(resource.author || "Unknown author"),
      program: safeText(resource.program || ""),
      collection: safeText(resource.collection || ""),
      description: safeText(resource.description || "Description not available."),
      cover_url: getCoverUrl(resource),
    }))
    .filter((item) => item.accession_no);

  for (let idx = items.length - 1; idx > 0; idx -= 1) {
    const swapIndex = Math.floor(Math.random() * (idx + 1));
    [items[idx], items[swapIndex]] = [items[swapIndex], items[idx]];
  }

  return items.slice(0, count);
}

function renderFeaturedRecommendations(recommendedItems) {
  const featuredCards = Array.from(document.querySelectorAll(".featured-cards .featured-card"));

  featuredCards.forEach((card, index) => {
    const item = recommendedItems[index];
    if (!item) {
      card.style.display = "none";
      return;
    }

    card.style.display = "flex";

    const imageEl = card.querySelector(".featured-img");
    const titleEl = card.querySelector(".featured-content h3");
    const descEl = card.querySelector(".featured-content p");
    const buttonEl = card.querySelector(".details-btn");
    const href = `../resource-details/resource-details.html?accession=${encodeURIComponent(item.accession_no)}`;

    if (imageEl) imageEl.style.backgroundImage = `url('${item.cover_url}')`;
    if (titleEl) titleEl.textContent = item.title_of_material;
    if (descEl) descEl.textContent = item.description || item.author;
    if (buttonEl) {
      buttonEl.onclick = () => {
        window.location.href = href;
      };
    }
  });
}

function renderBottomRecommended(recommendedItems) {
  const row = document.querySelector(".recommended .card-row");
  if (!row) return;

  const items = recommendedItems.slice(2, 6);
  row.innerHTML = items
    .map(
      (item) => `
      <a class="book-card-link" href="../resource-details/resource-details.html?accession=${encodeURIComponent(item.accession_no)}" title="${item.title_of_material}">
        <div class="book-card" style="background-image:url('${item.cover_url}')"></div>
        <p class="book-card-title">${item.title_of_material}</p>
      </a>
    `
    )
    .join("");
}

function renderTrendingSidebar(trendingItems) {
  const slots = Array.from(document.querySelectorAll(".trending-side .trend-item"));

  slots.forEach((slot, index) => {
    const item = trendingItems[index];
    if (!item) {
      slot.style.display = "none";
      return;
    }

    slot.style.display = "flex";
    const imageEl = slot.querySelector(".trend-img");
    const titleEl = slot.querySelector("strong");
    const authorEl = slot.querySelector("p");

    if (imageEl) imageEl.style.backgroundImage = `url('${item.cover_url}')`;
    if (titleEl) titleEl.textContent = item.title_of_material;
    if (authorEl) authorEl.textContent = item.author;

    slot.onclick = () => {
      window.location.href = `../resource-details/resource-details.html?accession=${encodeURIComponent(item.accession_no)}`;
    };
    slot.style.cursor = "pointer";
  });
}

function renderBottomTrending(trendingItems) {
  const row = document.querySelector(".trending .card-row");
  if (!row) return;

  const items = trendingItems.slice(0, 4);
  row.innerHTML = items
    .map(
      (item) => `
      <a class="book-card-link" href="../resource-details/resource-details.html?accession=${encodeURIComponent(item.accession_no)}" title="${item.title_of_material}">
        <div class="book-card" style="background-image:url('${item.cover_url}')"></div>
        <p class="book-card-title">${item.title_of_material}</p>
      </a>
    `
    )
    .join("");
}

let loading = false;

async function loadDiscoverData() {
  if (loading) return;
  loading = true;
  setLoadingOverlay(true);

  try {
    const resourcesByAccession = await getResourcesByAccession();
    const trendingItems = await getTrendingResources(resourcesByAccession);
    renderTrendingSidebar(trendingItems);
    renderBottomTrending(trendingItems);

    const userId = getCurrentUserId();
    let recommendations = [];

    if (userId) {
      const userHasSignals = await hasUserSignals(userId);
      if (userHasSignals) {
        await triggerRecommendationGeneration(userId);
        recommendations = await getUserRecommendations(userId, resourcesByAccession);
      }
    }

    if (!recommendations.length) {
      recommendations = getRandomRecommendations(resourcesByAccession, 6);
    }

    renderFeaturedRecommendations(recommendations);
    renderBottomRecommended(recommendations);
  } catch (error) {
    console.error("Failed to load discover data", error);
  } finally {
    loading = false;
    setLoadingOverlay(false);
  }
}

onAuthStateChanged(auth, () => {
  loadDiscoverData();
});
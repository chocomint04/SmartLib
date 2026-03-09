// admin-dashboard.js
// Path: assets/js/admin/admin-dashboard.js

import { db, auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

function formatDate(value) {
  const ms = getTimestampMillis(value);
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isToday(value) {
  const ms = getTimestampMillis(value);
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function badgeClass(status) {
  const s = String(status || "").toLowerCase();
  const map = {
    returned: "badge-returned",
    borrowed: "badge-borrowed",
    overdue: "badge-overdue",
    cancelled: "badge-cancelled",
    requested: "badge-requested",
    pending: "badge-pending",
  };
  return map[s] || "badge-pending";
}

function capitalize(str) {
  const s = String(str || "").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── State ─────────────────────────────────────────────────────────────────────

let allTransactions = []; // raw rows with merged user+resource data
let resourcesByAccession = new Map();
let usersById = new Map();

// currently selected row for status modal
let pendingUpdate = null; // { docId, bookTitle, userName }

// ── Firestore Loaders ─────────────────────────────────────────────────────────

async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  snap.forEach((d) => {
    usersById.set(d.id, { id: d.id, ...d.data() });
  });
}

async function loadResources() {
  const snap = await getDocs(collection(db, "resources"));
  snap.forEach((d) => {
    const data = d.data() || {};
    const accession = String(data.accession_no || "").trim();
    if (accession && !resourcesByAccession.has(accession)) {
      resourcesByAccession.set(accession, { id: d.id, ...data });
    }
  });
}

async function loadTransactions() {
  const snap = await getDocs(collection(db, "borrowing_transactions"));
  allTransactions = snap.docs.map((d) => {
    const data = d.data() || {};
    const accession = String(data.accession_no || "").trim();
    const resource = resourcesByAccession.get(accession) || {};
    const user = usersById.get(String(data.user_id || "")) || {};

    return {
      docId: d.id,
      accession_no: accession,
      user_id: data.user_id || "",
      userName: user.name || user.email || data.user_id || "Unknown User",
      userEmail: user.email || "",
      bookTitle: resource.title_of_material || accession || "Unknown Book",
      category: resource.program || resource.collection || "—",
      status: String(data.status || "").toLowerCase(),
      request_date: data.request_date || null,
      borrow_date: data.borrow_date || null,
      due_date: data.due_date || null,
      return_date: data.return_date || null,
    };
  });

  // sort newest first
  allTransactions.sort(
    (a, b) =>
      getTimestampMillis(b.request_date) - getTimestampMillis(a.request_date)
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeStats() {
  const totalActiveUsers = usersById.size;

  const borrowedToday = allTransactions.filter(
    (t) => t.status === "borrowed" && isToday(t.borrow_date)
  ).length;

  const overdueCount = allTransactions.filter(
    (t) => t.status === "overdue"
  ).length;

  // recommendations count from recommendations collection (best effort)
  let recommendationsToday = 0;

  document.getElementById("stat-active-users").textContent = totalActiveUsers;
  document.getElementById("stat-borrowed-today").textContent = borrowedToday;
  document.getElementById("stat-overdue").textContent = overdueCount;
  document.getElementById("stat-alerts").textContent = overdueCount; // system alerts = overdue as proxy

  return { totalActiveUsers, borrowedToday, overdueCount };
}

async function loadRecommendationStats() {
  try {
    const snap = await getDocs(collection(db, "recommendations"));
    let todayCount = 0;
    const weekCounts = {}; // day label → count

    snap.forEach((d) => {
      const data = d.data() || {};
      const ts = data.created_at || data.timestamp || null;
      if (!ts) return;

      if (isToday(ts)) todayCount++;

      // track per-day counts for last 7 days
      const ms = getTimestampMillis(ts);
      const date = new Date(ms);
      const daysAgo = Math.floor(
        (Date.now() - ms) / (1000 * 60 * 60 * 24)
      );
      if (daysAgo >= 0 && daysAgo < 7) {
        const label = date.toLocaleDateString("en-US", { weekday: "short" });
        weekCounts[label] = (weekCounts[label] || 0) + 1;
      }
    });

    document.getElementById("stat-recommendations").textContent = todayCount;
    document.getElementById("cold-start-count").textContent = snap.size;

    drawChart(weekCounts);
  } catch (err) {
    console.warn("Could not load recommendations:", err);
    document.getElementById("stat-recommendations").textContent = "—";
    document.getElementById("cold-start-count").textContent = "—";
  }
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function drawChart(weekCounts) {
  const canvas = document.getElementById("recommendations-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Build labels for last 7 days
  const labels = [];
  const values = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-US", { weekday: "short" });
    labels.push(label);
    values.push(weekCounts[label] || 0);
  }

  const w = canvas.offsetWidth || 400;
  const h = canvas.height;
  canvas.width = w;

  const padLeft = 10;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 10;
  const graphWidth = w - padLeft - padRight;
  const graphHeight = h - padTop - padBottom;

  const maxVal = Math.max(...values, 1);
  const stepX = graphWidth / (values.length - 1);

  ctx.clearRect(0, 0, w, h);

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = "#f0c020";
  ctx.lineWidth = 2;

  values.forEach((val, i) => {
    const x = padLeft + i * stepX;
    const y = padTop + graphHeight - (val / maxVal) * graphHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw dots
  values.forEach((val, i) => {
    const x = padLeft + i * stepX;
    const y = padTop + graphHeight - (val / maxVal) * graphHeight;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#f0c020";
    ctx.fill();
  });
}

// ── Table Rendering ───────────────────────────────────────────────────────────

function renderTable(rows) {
  const tbody = document.getElementById("activity-tbody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No activity records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const badge = badgeClass(row.status);
      const borrowDate = formatDate(row.borrow_date || row.request_date);
      const dueDate = formatDate(row.due_date);

      return `
      <tr>
        <td>${escapeHtml(row.userName)}</td>
        <td>${escapeHtml(row.bookTitle)}</td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(borrowDate)}</td>
        <td>${escapeHtml(dueDate)}</td>
        <td><span class="status-badge ${badge}">${escapeHtml(capitalize(row.status))}</span></td>
        <td>
          <button
            class="action-btn"
            data-doc-id="${escapeHtml(row.docId)}"
            data-book-title="${escapeHtml(row.bookTitle)}"
            data-user-name="${escapeHtml(row.userName)}"
          >Change Status</button>
        </td>
      </tr>
    `;
    })
    .join("");

  // Attach click handlers
  tbody.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openModal({
        docId: btn.dataset.docId,
        bookTitle: btn.dataset.bookTitle,
        userName: btn.dataset.userName,
      });
    });
  });
}

// ── Filter ────────────────────────────────────────────────────────────────────

function applyFilter() {
  const filterVal = document.getElementById("filter-status").value;
  const rows = filterVal
    ? allTransactions.filter((t) => t.status === filterVal)
    : allTransactions;
  renderTable(rows);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal({ docId, bookTitle, userName }) {
  pendingUpdate = { docId, bookTitle, userName };
  document.getElementById("modal-book-title").textContent = bookTitle;
  document.getElementById("modal-user-name").textContent = `User: ${userName}`;
  document.getElementById("status-modal").classList.remove("hidden");
}

function closeModal() {
  pendingUpdate = null;
  document.getElementById("status-modal").classList.add("hidden");
}

async function handleStatusChange(newStatus) {
  if (!pendingUpdate) return;

  const { docId } = pendingUpdate;
  closeModal();

  try {
    const ref = doc(db, "borrowing_transactions", docId);
    const updateData = { status: newStatus };
    if (newStatus === "borrowed") {
      updateData.borrow_date = Timestamp.now();
    }
    if (newStatus === "returned") {
      updateData.return_date = Timestamp.now();
    }
    await updateDoc(ref, updateData);

    // Update local state so the UI reflects the change without re-fetching
    const row = allTransactions.find((t) => t.docId === docId);
    if (row) row.status = newStatus;

    applyFilter();
    computeStats();
  } catch (err) {
    console.error("Failed to update status:", err);
    alert("Could not update status. Please try again.");
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    await Promise.all([loadUsers(), loadResources()]);
    await loadTransactions();

    computeStats();
    renderTable(allTransactions);
    loadRecommendationStats(); // async, non-blocking

    // Filter handler
    document.getElementById("filter-status").addEventListener("change", applyFilter);

    // Modal close
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("status-modal").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Modal status buttons
    document.querySelectorAll(".status-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleStatusChange(btn.dataset.status);
      });
    });

    // Search (client-side filter)
    document.getElementById("btn-search").addEventListener("click", () => {
      const q = document.getElementById("search-input").value.toLowerCase().trim();
      if (!q) {
        renderTable(allTransactions);
        return;
      }
      const filtered = allTransactions.filter(
        (t) =>
          t.userName.toLowerCase().includes(q) ||
          t.bookTitle.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q)
      );
      renderTable(filtered);
    });

    document.getElementById("search-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("btn-search").click();
    });
  } catch (err) {
    console.error("Admin dashboard init error:", err);
    document.getElementById("activity-tbody").innerHTML =
      `<tr><td colspan="7" class="table-empty">Failed to load data. Please refresh.</td></tr>`;
  }
}

// ── Auth Guard ────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../auth/login.html";
    return;
  }

  // Optionally: verify admin role
  try {
    const { doc: firestoreDoc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js"
    );
    const userDoc = await getDoc(firestoreDoc(db, "users", user.uid));
    const role = userDoc.exists() ? userDoc.data().role : "user";
    if (role !== "admin" && role !== "staff") {
      alert("Access denied: Admin only.");
      window.location.href = "../dashboard/dashboard.html";
      return;
    }
  } catch (err) {
    console.warn("Role check failed, proceeding anyway:", err);
  }

  init();
});

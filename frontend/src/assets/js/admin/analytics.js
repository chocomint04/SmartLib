// analytics.js
// Path: assets/js/admin/analytics.js

import { db, auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ── HELPERS ──────────────────────────────────────────────────────────────────

function getMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

function humanize(name) {
  return String(name || "").replace(/_/g, " ");
}

// ── LOAD DATA ─────────────────────────────────────────────────────────────────

async function loadAll() {
  const [txSnap, userSnap, resourceSnap] = await Promise.all([
    getDocs(collection(db, "borrowing_transactions")),
    getDocs(collection(db, "users")),
    getDocs(collection(db, "resources")),
  ]);

  const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const totalUsers = userSnap.size;
  const totalResources = resourceSnap.size;

  // Build resource map: accession_no → resource data
  const resourceMap = {};
  resourceSnap.forEach((d) => {
    const data = d.data();
    const acc = String(data.accession_no || "").trim();
    if (acc) resourceMap[acc] = data;
  });

  return { transactions, totalUsers, totalResources, resourceMap };
}

// ── STAT CARDS ────────────────────────────────────────────────────────────────

function renderStats(transactions, totalUsers, totalResources) {
  const total = transactions.length;
  const overdue = transactions.filter(
    (t) => String(t.status || "").toLowerCase() === "overdue"
  ).length;
  const returned = transactions.filter(
    (t) => String(t.status || "").toLowerCase() === "returned"
  ).length;
  const returnRate = total > 0 ? Math.round((returned / total) * 100) + "%" : "—";

  document.getElementById("stat-total-borrows").textContent = total;
  document.getElementById("stat-overdue").textContent = overdue;
  document.getElementById("stat-total-users").textContent = totalUsers;
  document.getElementById("stat-total-resources").textContent = totalResources;
  document.getElementById("stat-return-rate").textContent = returnRate;
}

// ── BORROWS PER DAY CHART ─────────────────────────────────────────────────────

function renderBorrowsChart(transactions) {
  const canvas = document.getElementById("borrows-chart");
  if (!canvas) return;

  // Build last 14 days
  const days = [];
  const counts = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const key = d.toDateString();
    days.push({ label, key });
    counts[key] = 0;
  }

  transactions.forEach((t) => {
    const ms = getMs(t.borrow_date || t.request_date);
    if (!ms) return;
    const key = new Date(ms).toDateString();
    if (counts[key] !== undefined) counts[key]++;
  });

  const values = days.map((d) => counts[d.key]);
  const labels = days.map((d) => d.label);

  drawLineChart(canvas, labels, values, "#f0c020");
}

function drawLineChart(canvas, labels, values, color) {
  const ctx = canvas.getContext("2d");
  const w = (canvas.width = canvas.offsetWidth || 600);
  const h = canvas.height;

  const padL = 36, padR = 16, padT = 16, padB = 32;
  const gw = w - padL - padR;
  const gh = h - padT - padB;
  const max = Math.max(...values, 1);
  const step = gw / (values.length - 1);

  ctx.clearRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (gh / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillStyle = "#555";
    ctx.font = "10px sans-serif";
    ctx.fillText(Math.round(max - (max / 4) * i), 2, y + 4);
  }

  // X labels (every other)
  ctx.fillStyle = "#555";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  labels.forEach((label, i) => {
    if (i % 2 !== 0) return;
    const x = padL + i * step;
    ctx.fillText(label, x, h - 6);
  });

  // Gradient fill under line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + gh);
  grad.addColorStop(0, color + "33");
  grad.addColorStop(1, color + "00");
  ctx.beginPath();
  values.forEach((val, i) => {
    const x = padL + i * step;
    const y = padT + gh - (val / max) * gh;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(padL + (values.length - 1) * step, padT + gh);
  ctx.lineTo(padL, padT + gh);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  values.forEach((val, i) => {
    const x = padL + i * step;
    const y = padT + gh - (val / max) * gh;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  values.forEach((val, i) => {
    const x = padL + i * step;
    const y = padT + gh - (val / max) * gh;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
  });
}

// ── STATUS BREAKDOWN (donut-style bar chart) ───────────────────────────────────

function renderStatusChart(transactions) {
  const canvas = document.getElementById("status-chart");
  if (!canvas) return;

  const statusColors = {
    borrowed: "#1565c0",
    returned: "#2e7d32",
    overdue: "#c62828",
    cancelled: "#555",
    requested: "#e65100",
    pending: "#e65100",
  };

  const counts = {};
  transactions.forEach((t) => {
    const s = String(t.status || "unknown").toLowerCase();
    counts[s] = (counts[s] || 0) + 1;
  });

  const total = transactions.length || 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // Draw horizontal bar chart
  const ctx = canvas.getContext("2d");
  const w = (canvas.width = canvas.offsetWidth || 300);
  const h = canvas.height;
  const barH = 18;
  const gap = 12;
  const padL = 80, padR = 40, padT = 10;

  ctx.clearRect(0, 0, w, h);

  entries.forEach(([status, count], i) => {
    const y = padT + i * (barH + gap);
    const fillW = ((count / total) * (w - padL - padR));
    const color = statusColors[status] || "#888";

    // Label
    ctx.fillStyle = "#aaa";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(humanize(status), padL - 8, y + barH - 4);

    // Track
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.roundRect(padL, y, w - padL - padR, barH, 3);
    ctx.fill();

    // Fill
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(padL, y, Math.max(fillW, 4), barH, 3);
    ctx.fill();

    // Count
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(count, padL + fillW + 6, y + barH - 4);
  });

  // Legend
  const legend = document.getElementById("status-legend");
  if (legend) {
    legend.innerHTML = entries.map(([status]) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${statusColors[status] || '#888'}"></span>
        ${humanize(status)}
      </div>
    `).join("");
  }
}

// ── TOP PROGRAMS ──────────────────────────────────────────────────────────────

function renderTopPrograms(transactions, resourceMap) {
  const counts = {};
  transactions.forEach((t) => {
    const acc = String(t.accession_no || "").trim();
    const resource = resourceMap[acc] || {};
    const prog = resource.program || "Unknown";
    counts[prog] = (counts[prog] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted[0]?.[1] || 1;

  const el = document.getElementById("top-programs-list");
  if (!el) return;

  el.innerHTML = sorted.map(([prog, count]) => `
    <div class="bar-item">
      <div class="bar-item-header">
        <span>${humanize(prog)}</span>
        <span class="bar-count">${count}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(count / max) * 100}%"></div>
      </div>
    </div>
  `).join("");
}

// ── TOP BOOKS ─────────────────────────────────────────────────────────────────

function renderTopBooks(transactions, resourceMap) {
  const counts = {};
  transactions.forEach((t) => {
    const acc = String(t.accession_no || "").trim();
    const resource = resourceMap[acc] || {};
    const title = resource.title_of_material || resource.title || acc || "Unknown";
    counts[title] = (counts[title] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted[0]?.[1] || 1;

  const el = document.getElementById("top-books-list");
  if (!el) return;

  el.innerHTML = sorted.map(([title, count]) => `
    <div class="bar-item">
      <div class="bar-item-header">
        <span style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>
        <span class="bar-count">${count}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(count / max) * 100}%"></div>
      </div>
    </div>
  `).join("");
}

// ── MONTHLY SUMMARY ───────────────────────────────────────────────────────────

function renderMonthlySummary(transactions) {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const statusColors = {
    borrowed: "#1565c0",
    returned: "#2e7d32",
    overdue: "#c62828",
    cancelled: "#555",
    requested: "#e65100",
  };

  const counts = {};
  transactions.forEach((t) => {
    const ms = getMs(t.request_date || t.borrow_date);
    if (!ms) return;
    const d = new Date(ms);
    if (d.getMonth() !== thisMonth || d.getFullYear() !== thisYear) return;
    const s = String(t.status || "unknown").toLowerCase();
    counts[s] = (counts[s] || 0) + 1;
  });

  const el = document.getElementById("monthly-summary");
  if (!el) return;

  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (!Object.keys(counts).length) {
    el.innerHTML = `<p style="color:#555;font-size:0.82rem;">No transactions this month.</p>`;
    return;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  el.innerHTML = `
    <p style="color:#555;font-size:0.75rem;margin-bottom:8px;">${monthName}</p>
    ${sorted.map(([status, count]) => `
      <div class="summary-item">
        <span class="s-label">
          <span class="s-dot" style="background:${statusColors[status] || '#888'}"></span>
          ${humanize(status)}
        </span>
        <span class="s-value">${count}</span>
      </div>
    `).join("")}
  `;
}

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const { transactions, totalUsers, totalResources, resourceMap } = await loadAll();

    renderStats(transactions, totalUsers, totalResources);
    renderBorrowsChart(transactions);
    renderStatusChart(transactions);
    renderTopPrograms(transactions, resourceMap);
    renderTopBooks(transactions, resourceMap);
    renderMonthlySummary(transactions);
  } catch (err) {
    console.error("Analytics init error:", err);
  }
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../auth/login.html";
    return;
  }
  init();
});

// restrict-resources.js
// Path: assets/js/admin/restrict-resources.js

import { db, auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let allResources = [];

// ── RENDER TABLE ──────────────────────────────────────────────────────────────

function renderTable(resources) {
  const tbody = document.getElementById("resources-tbody");

  if (!resources.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-loading">No resources found.</td></tr>`;
    return;
  }

  tbody.innerHTML = resources.map((r) => `
    <tr>
      <td>${r.accession_no || "—"}</td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${r.title_of_material || r.title || "Untitled"}
      </td>
      <td>${r.program || "—"}</td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" class="grad-toggle" data-id="${r.id}" ${r.grad_only ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <span style="font-size:0.78rem;color:${r.grad_only ? "#a5d6a7" : "#666"};">
          ${r.grad_only ? "Restricted" : "Open access"}
        </span>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".grad-toggle").forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      const id = toggle.dataset.id;
      const newVal = toggle.checked;

      try {
        await updateDoc(doc(db, "resources", id), { grad_only: newVal });
        const resource = allResources.find((r) => r.id === id);
        if (resource) resource.grad_only = newVal;

        // Update status text in same row
        const row = toggle.closest("tr");
        const statusSpan = row.querySelector("td:last-child span");
        if (statusSpan) {
          statusSpan.textContent = newVal ? "Restricted" : "Open access";
          statusSpan.style.color = newVal ? "#a5d6a7" : "#666";
        }
      } catch (err) {
        console.error("Failed to update restriction", err);
        toggle.checked = !newVal; // revert on error
        alert("Could not update restriction. Please try again.");
      }
    });
  });
}

// ── SEARCH ────────────────────────────────────────────────────────────────────

document.getElementById("resource-search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = q
    ? allResources.filter((r) =>
        (r.title_of_material || r.title || "").toLowerCase().includes(q) ||
        (r.accession_no || "").toLowerCase().includes(q) ||
        (r.program || "").toLowerCase().includes(q)
      )
    : allResources;
  renderTable(filtered);
});

// ── LOAD RESOURCES ────────────────────────────────────────────────────────────

async function loadResources() {
  const snap = await getDocs(collection(db, "resources"));
  allResources = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  allResources.sort((a, b) =>
    (a.title_of_material || a.title || "").localeCompare(b.title_of_material || b.title || "")
  );
  renderTable(allResources);
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../auth/login.html"; return; }
  try {
    await loadResources();
  } catch (err) {
    console.error("Error loading resources", err);
    document.getElementById("resources-tbody").innerHTML =
      `<tr><td colspan="5" class="table-loading">Failed to load resources.</td></tr>`;
  }
});

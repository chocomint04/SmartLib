// assign-role.js
// Path: assets/js/admin/assign-role.js

import { db, auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let allUsers = [];
let pendingUser = null;

// ── HELPERS ───────────────────────────────────────────────────────────────────

function roleBadge(role) {
  const r = String(role || "user").toLowerCase();
  return `<span class="role-badge role-${r}">${r}</span>`;
}

// ── RENDER TABLE ──────────────────────────────────────────────────────────────

function renderTable(users) {
  const tbody = document.getElementById("users-tbody");
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-loading">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>${u.name || "—"}</td>
      <td>${u.email || "—"}</td>
      <td>${roleBadge(u.role)}</td>
      <td>
        <button class="edit-btn" data-uid="${u.uid}" data-name="${u.name || ""}" data-email="${u.email || ""}" data-role="${u.role || "user"}">
          Change Role
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingUser = {
        uid: btn.dataset.uid,
        name: btn.dataset.name,
        email: btn.dataset.email,
        role: btn.dataset.role,
      };
      openModal();
    });
  });
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

function openModal() {
  document.getElementById("modal-user-name").textContent = pendingUser.name;
  document.getElementById("modal-user-email").textContent = pendingUser.email;
  document.getElementById("modal-role-select").value = pendingUser.role;
  document.getElementById("role-modal").classList.remove("hidden");
}

function closeModal() {
  pendingUser = null;
  document.getElementById("role-modal").classList.add("hidden");
}

document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("role-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById("modal-save").addEventListener("click", async () => {
  if (!pendingUser) return;
  const newRole = document.getElementById("modal-role-select").value;

  try {
    await updateDoc(doc(db, "users", pendingUser.uid), { role: newRole });
    const user = allUsers.find((u) => u.uid === pendingUser.uid);
    if (user) user.role = newRole;
    closeModal();
    renderTable(allUsers);
  } catch (err) {
    console.error("Failed to update role", err);
    alert("Could not update role. Please try again.");
  }
});

// ── SEARCH ────────────────────────────────────────────────────────────────────

document.getElementById("user-search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = q
    ? allUsers.filter((u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      )
    : allUsers;
  renderTable(filtered);
});

// ── LOAD USERS ────────────────────────────────────────────────────────────────

async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  allUsers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  renderTable(allUsers);
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../auth/login.html"; return; }
  try {
    await loadUsers();
  } catch (err) {
    console.error("Error loading users", err);
    document.getElementById("users-tbody").innerHTML =
      `<tr><td colspan="4" class="table-loading">Failed to load users.</td></tr>`;
  }
});

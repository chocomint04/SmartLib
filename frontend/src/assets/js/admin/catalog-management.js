// catalog-management.js
// Path: assets/js/admin/catalog-management.js

import { db, auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
    collection, getDocs, doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ── STATE ─────────────────────────────────────────────────────────────────────
let allResources = [];
let filtered = [];
let page = 0;
const PAGE_SIZE = 40;
let currentResource = null;
let drawerMode = "view"; // "view" | "edit"
let borrowedAccessions = new Set(); // accession_no values with active "borrowed" status

// ── DOM ───────────────────────────────────────────────────────────────────────
const tbody       = document.getElementById("cm-tbody");
const countEl     = document.getElementById("cm-count");
const loadMoreRow = document.getElementById("load-more-row");
const loadMoreBtn = document.getElementById("load-more-btn");
const searchInput = document.getElementById("cm-search-input");
const searchBtn   = document.getElementById("cm-search-btn");
const filterProg  = document.getElementById("filter-program");
const filterColl  = document.getElementById("filter-collection");
const filterAvail = document.getElementById("filter-availability");
const filterAccess= document.getElementById("filter-access");
const overlay     = document.getElementById("drawer-overlay");
const drawer      = document.getElementById("cm-drawer");
const drawerClose = document.getElementById("drawer-close");
const drawerLabel = document.getElementById("drawer-mode-label");
const drawerBody  = document.getElementById("cm-drawer-body");

// ── HELPERS ───────────────────────────────────────────────────────────────────
const humanize = s => String(s||"").replace(/_/g," ").trim();
const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function availClass(status) {
    const s = (status||"").toLowerCase();
    if (s === "available") return "avail-available";
    if (s === "borrowed" || s === "checked out") return "avail-borrowed";
    return "avail-other";
}

// ── POPULATE FILTERS ──────────────────────────────────────────────────────────
function populateFilters(resources) {
    const programs = [...new Set(resources.map(r => r.program).filter(Boolean))].sort();
    const collections = [...new Set(resources.map(r => r.collection).filter(Boolean))].sort();

    programs.forEach(p => {
        const o = document.createElement("option");
        o.value = p; o.textContent = humanize(p);
        filterProg.appendChild(o);
    });
    collections.forEach(c => {
        const o = document.createElement("option");
        o.value = c; o.textContent = humanize(c);
        filterColl.appendChild(o);
    });
}

// ── RENDER ROWS ───────────────────────────────────────────────────────────────
function renderRows(reset = false) {
    if (reset) { page = 0; tbody.innerHTML = ""; }

    const start = page * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="cm-empty">No resources match your filters.</td></tr>`;
        loadMoreRow.style.display = "none";
        countEl.textContent = "0 resources";
        return;
    }

    slice.forEach(r => {
        const title = r.title_of_material || r.title || "Untitled";
        const isBorrowed = borrowedAccessions.has(r.accession_no);
        const availLabel = isBorrowed ? "Borrowed" : (r.availability_status || "Available");
        const isGrad = !!r.grad_only;

        const tr = document.createElement("tr");
        tr.dataset.id = r.id;
        tr.innerHTML = `
            <td class="td-accession">${esc(r.accession_no) || "—"}</td>
            <td class="td-title"><div class="td-title-inner">${esc(title)}</div></td>
            <td class="td-author">${esc(r.author) || "—"}</td>
            <td class="td-program">
                ${r.program ? `<span class="td-program-tag">${esc(r.program)}</span>` : ""}
                ${r.collection ? `<div class="td-collection-sub">${esc(r.collection)}</div>` : ""}
            </td>
            <td class="td-year">${esc(r.year) || "—"}</td>
            <td>
                <span class="avail-badge ${availClass(availLabel)}">${availLabel}</span>
            </td>
            <td>
                <span class="access-badge ${isGrad ? "access-grad" : "access-open"}">
                    ${isGrad ? "Grad-Only" : "Open"}
                </span>
            </td>
            <td>
                <div class="td-actions">
                    <button class="btn-view" data-action="view" data-id="${r.id}">View</button>
                    <button class="btn-edit" data-action="edit" data-id="${r.id}">Edit</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    page++;
    const shown = Math.min(page * PAGE_SIZE, filtered.length);
    countEl.textContent = `${shown} / ${filtered.length} resources`;
    loadMoreRow.style.display = shown < filtered.length ? "flex" : "none";

    // Attach action listeners to new rows
    slice.forEach(r => {
        const tr = tbody.querySelector(`tr[data-id="${r.id}"]`);
        if (!tr) return;
        tr.querySelector("[data-action='view']").addEventListener("click", () => openDrawer(r, "view"));
        tr.querySelector("[data-action='edit']").addEventListener("click", () => openDrawer(r, "edit"));
    });
}

// ── APPLY FILTERS ─────────────────────────────────────────────────────────────
function applyFilters() {
    const q    = searchInput.value.toLowerCase().trim();
    const prog = filterProg.value;
    const coll = filterColl.value;
    const avail= filterAvail.value;
    const access = filterAccess.value;

    filtered = allResources.filter(r => {
        const title  = (r.title_of_material || r.title || "").toLowerCase();
        const author = (r.author || "").toLowerCase();
        const acc    = (r.accession_no || "").toLowerCase();
        const isbn   = (r.isbn || "").toLowerCase();

        if (q && !title.includes(q) && !author.includes(q) && !acc.includes(q) && !isbn.includes(q)) return false;
        if (prog && r.program !== prog) return false;
        if (coll && r.collection !== coll) return false;
        if (avail === "available" && borrowedAccessions.has(r.accession_no)) return false;
        if (avail === "borrowed" && !borrowedAccessions.has(r.accession_no)) return false;
        if (access === "grad" && !r.grad_only) return false;
        if (access === "open" && r.grad_only) return false;
        return true;
    });

    renderRows(true);
}

// ── DRAWER ────────────────────────────────────────────────────────────────────
function openDrawer(r, mode) {
    currentResource = r;
    drawerMode = mode;
    drawerLabel.textContent = mode === "edit" ? "Edit Resource" : "Resource Details";
    renderDrawerContent(r, mode);
    overlay.classList.add("open");
    drawer.classList.add("open");
}

function closeDrawer() {
    overlay.classList.remove("open");
    drawer.classList.remove("open");
    currentResource = null;
}

drawerClose.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);

function renderDrawerContent(r, mode) {
    const title = r.title_of_material || r.title || "Untitled";
    const isGrad = !!r.grad_only;

    if (mode === "view") {
        drawerBody.innerHTML = `
            <div class="drawer-title-block">
                <h2>${esc(title)}</h2>
                <div class="drawer-author-line">${esc(r.author) || "Unknown Author"}</div>
            </div>
            <div class="drawer-fields-grid">
                <div class="drawer-field">
                    <span class="drawer-field-label">Accession No.</span>
                    <span class="drawer-field-value">${esc(r.accession_no) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">Year</span>
                    <span class="drawer-field-value">${esc(r.year) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">Program</span>
                    <span class="drawer-field-value">${humanize(r.program) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">Collection</span>
                    <span class="drawer-field-value">${humanize(r.collection) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">Call Number</span>
                    <span class="drawer-field-value">${esc(r.call_number) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">ISBN</span>
                    <span class="drawer-field-value">${esc(r.isbn) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">Availability</span>
                    <span class="drawer-field-value">${humanize(r.availability_status) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">Date in ALMA</span>
                    <span class="drawer-field-value">${esc(r.date_in_alma) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">DR No.</span>
                    <span class="drawer-field-value">${esc(r.dr_no) || "—"}</span>
                </div>
                <div class="drawer-field">
                    <span class="drawer-field-label">Access</span>
                    <span class="drawer-field-value">${isGrad ? "Grad-Only" : "Open Access"}</span>
                </div>
            </div>
            ${r.description ? `<div class="drawer-description-block">${esc(r.description)}</div>` : ""}
            <div class="drawer-view-actions">
                <button class="drawer-btn-edit" id="switch-to-edit">Edit Resource</button>
                <button class="drawer-btn-toggle-grad" id="toggle-grad-view">
                    ${isGrad ? "Remove Restriction" : "Set as Grad-Only"}
                </button>
            </div>`;

        document.getElementById("switch-to-edit").addEventListener("click", () => {
            drawerMode = "edit";
            drawerLabel.textContent = "Edit Resource";
            renderDrawerContent(currentResource, "edit");
        });

        document.getElementById("toggle-grad-view").addEventListener("click", async () => {
            const btn = document.getElementById("toggle-grad-view");
            btn.disabled = true;
            btn.textContent = "Saving…";
            const newVal = !isGrad;
            try {
                await updateDoc(doc(db, "resources", r.id), { grad_only: newVal });
                r.grad_only = newVal;
                updateRowInTable(r);
                renderDrawerContent(r, "view");
            } catch(e) {
                btn.disabled = false;
                btn.textContent = isGrad ? "Remove Restriction" : "Set as Grad-Only";
                alert("Failed to update. Please try again.");
            }
        });

    } else {
        // Edit mode
        drawerBody.innerHTML = `
            <div class="edit-form" id="edit-form">
                <div class="edit-field">
                    <label>Title</label>
                    <input id="ef-title" type="text" value="${esc(r.title_of_material || r.title || "")}" />
                </div>
                <div class="edit-field">
                    <label>Author</label>
                    <input id="ef-author" type="text" value="${esc(r.author || "")}" />
                </div>
                <div class="edit-fields-grid">
                    <div class="edit-field">
                        <label>Accession No.</label>
                        <input id="ef-accession" type="text" value="${esc(r.accession_no || "")}" />
                    </div>
                    <div class="edit-field">
                        <label>Year</label>
                        <input id="ef-year" type="text" value="${esc(r.year || "")}" />
                    </div>
                    <div class="edit-field">
                        <label>Program</label>
                        <input id="ef-program" type="text" value="${esc(r.program || "")}" />
                    </div>
                    <div class="edit-field">
                        <label>Collection</label>
                        <input id="ef-collection" type="text" value="${esc(r.collection || "")}" />
                    </div>
                    <div class="edit-field">
                        <label>Call Number</label>
                        <input id="ef-callno" type="text" value="${esc(r.call_number || "")}" />
                    </div>
                    <div class="edit-field">
                        <label>ISBN</label>
                        <input id="ef-isbn" type="text" value="${esc(r.isbn || "")}" />
                    </div>
                    <div class="edit-field">
                        <label>Availability</label>
                        <select id="ef-avail">
                            <option value="available" ${r.availability_status === "available" ? "selected" : ""}>Available</option>
                            <option value="borrowed"  ${r.availability_status === "borrowed"  ? "selected" : ""}>Borrowed</option>
                            <option value="reserved"  ${r.availability_status === "reserved"  ? "selected" : ""}>Reserved</option>
                        </select>
                    </div>
                    <div class="edit-field">
                        <label>Date in ALMA</label>
                        <input id="ef-alma" type="text" value="${esc(r.date_in_alma || "")}" />
                    </div>
                    <div class="edit-field">
                        <label>DR No.</label>
                        <input id="ef-drno" type="text" value="${esc(r.dr_no || "")}" />
                    </div>
                </div>
                <div class="edit-field">
                    <label>Description</label>
                    <textarea id="ef-desc">${esc(r.description || "")}</textarea>
                </div>
                <div class="edit-toggle-row">
                    <div class="edit-toggle-label">
                        Grad-Only Restriction
                        <span>Restricts this resource to graduate users only</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="ef-grad" ${isGrad ? "checked" : ""}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="edit-save-msg" id="edit-save-msg"></div>
                <div class="edit-form-actions">
                    <button class="btn-save" id="btn-save">Save Changes</button>
                    <button class="btn-cancel" id="btn-cancel">Cancel</button>
                </div>
            </div>`;

        document.getElementById("btn-cancel").addEventListener("click", () => {
            drawerMode = "view";
            drawerLabel.textContent = "Resource Details";
            renderDrawerContent(currentResource, "view");
        });

        document.getElementById("btn-save").addEventListener("click", async () => {
            const saveBtn = document.getElementById("btn-save");
            const msg     = document.getElementById("edit-save-msg");
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving…";

            const updates = {
                title_of_material: document.getElementById("ef-title").value.trim(),
                author:            document.getElementById("ef-author").value.trim(),
                accession_no:      document.getElementById("ef-accession").value.trim(),
                year:              document.getElementById("ef-year").value.trim(),
                program:           document.getElementById("ef-program").value.trim(),
                collection:        document.getElementById("ef-collection").value.trim(),
                call_number:       document.getElementById("ef-callno").value.trim(),
                isbn:              document.getElementById("ef-isbn").value.trim(),
                availability_status: document.getElementById("ef-avail").value,
                date_in_alma:      document.getElementById("ef-alma").value.trim(),
                dr_no:             document.getElementById("ef-drno").value.trim(),
                description:       document.getElementById("ef-desc").value.trim(),
                grad_only:         document.getElementById("ef-grad").checked,
            };

            try {
                await updateDoc(doc(db, "resources", r.id), updates);
                Object.assign(r, updates);
                updateRowInTable(r);
                msg.className = "edit-save-msg success";
                msg.textContent = "Changes saved successfully.";
                setTimeout(() => {
                    drawerMode = "view";
                    drawerLabel.textContent = "Resource Details";
                    renderDrawerContent(currentResource, "view");
                }, 900);
            } catch(e) {
                msg.className = "edit-save-msg error";
                msg.textContent = "Failed to save. Please try again.";
                saveBtn.disabled = false;
                saveBtn.textContent = "Save Changes";
            }
        });
    }
}

// ── UPDATE ROW IN TABLE AFTER EDIT ────────────────────────────────────────────
function updateRowInTable(r) {
    const tr = tbody.querySelector(`tr[data-id="${r.id}"]`);
    if (!tr) return;
    const title = r.title_of_material || r.title || "Untitled";
    const isGrad = !!r.grad_only;
    tr.querySelector(".td-title-inner").textContent = title;
    tr.querySelector(".td-author").textContent = r.author || "—";
    tr.querySelector(".avail-badge").className = `avail-badge ${availClass(r.availability_status)}`;
    tr.querySelector(".avail-badge").textContent = humanize(r.availability_status) || "—";
    tr.querySelector(".access-badge").className = `access-badge ${isGrad ? "access-grad" : "access-open"}`;
    tr.querySelector(".access-badge").textContent = isGrad ? "Grad-Only" : "Open";
    const progTag = tr.querySelector(".td-program-tag");
    if (progTag) progTag.textContent = r.program || "";
    const collSub = tr.querySelector(".td-collection-sub");
    if (collSub) collSub.textContent = r.collection || "";
}

// ── EVENTS ────────────────────────────────────────────────────────────────────
searchBtn.addEventListener("click", applyFilters);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") applyFilters(); });
filterProg.addEventListener("change", applyFilters);
filterColl.addEventListener("change", applyFilters);
filterAvail.addEventListener("change", applyFilters);
filterAccess.addEventListener("change", applyFilters);
loadMoreBtn.addEventListener("click", () => renderRows(false));

// ── LOAD ──────────────────────────────────────────────────────────────────────
async function loadAll() {
    try {
        // Fetch resources and borrowing_transactions in parallel
        const [resourcesSnap, transSnap] = await Promise.all([
            getDocs(collection(db, "resources")),
            getDocs(collection(db, "borrowing_transactions"))
        ]);

        // Build set of accession_nos that are currently borrowed
        borrowedAccessions = new Set();
        transSnap.forEach(d => {
            const t = d.data();
            if ((t.status || "").toLowerCase() === "borrowed" && t.accession_no) {
                borrowedAccessions.add(t.accession_no);
            }
        });

        allResources = resourcesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        allResources.sort((a, b) =>
            (a.title_of_material || a.title || "").localeCompare(b.title_of_material || b.title || "")
        );
        filtered = [...allResources];
        populateFilters(allResources);
        renderRows(true);
    } catch(err) {
        console.error("Error loading resources", err);
        tbody.innerHTML = `<tr><td colspan="8" class="cm-empty">Failed to load resources. Please refresh.</td></tr>`;
    }
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = "../auth/login.html"; return; }
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const role = snap.exists() ? snap.data().role : null;
        if (role !== "admin" && role !== "staff") {
            window.location.href = "../auth/login.html";
            return;
        }
    } catch(e) { /* allow through */ }
    await loadAll();
});
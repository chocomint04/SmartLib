// create-account.js
// Path: assets/js/admin/create-account.js

import { auth, db } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Note: Firebase client SDK cannot create users without signing them in.
// We create the Auth user via a secondary app instance trick, then restore admin session.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: auth.app.options.apiKey,
  authDomain: auth.app.options.authDomain,
  projectId: auth.app.options.projectId,
  storageBucket: auth.app.options.storageBucket,
  messagingSenderId: auth.app.options.messagingSenderId,
  appId: auth.app.options.appId,
};

// Secondary app so we don't sign out the current admin
const secondaryApp = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

// ── UI ELEMENTS ───────────────────────────────────────────────────────────────

const btnCreate = document.getElementById("btn-create");
const inputName = document.getElementById("input-name");
const inputEmail = document.getElementById("input-email");
const inputPassword = document.getElementById("input-password");
const inputRole = document.getElementById("input-role");
const feedback = document.getElementById("form-feedback");
const togglePwd = document.getElementById("togglePwd");

togglePwd.addEventListener("click", () => {
  const isText = inputPassword.type === "text";
  inputPassword.type = isText ? "password" : "text";
  togglePwd.textContent = isText ? "👁" : "🙈";
});

function showFeedback(msg, type) {
  feedback.textContent = msg;
  feedback.className = `form-feedback ${type}`;
}

// ── CREATE ACCOUNT ────────────────────────────────────────────────────────────

btnCreate.addEventListener("click", async () => {
  const name = inputName.value.trim();
  const email = inputEmail.value.trim();
  const password = inputPassword.value;
  const role = inputRole.value;

  if (!name) { showFeedback("Please enter a full name.", "error"); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFeedback("Please enter a valid email address.", "error"); return;
  }
  if (password.length < 6) {
    showFeedback("Password must be at least 6 characters.", "error"); return;
  }

  btnCreate.disabled = true;
  btnCreate.textContent = "Creating…";
  showFeedback("", "hidden");

  try {
    // Create user using secondary app (doesn't affect admin session)
    const result = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUser = result.user;

    await updateProfile(newUser, { displayName: name });

    // Save to Firestore
    await setDoc(doc(db, "users", newUser.uid), {
      name,
      email,
      role,
      createdAt: serverTimestamp(),
    });

    // Sign out of secondary app
    await secondaryAuth.signOut();

    showFeedback(`✓ Account created successfully for ${name}.`, "success");
    inputName.value = "";
    inputEmail.value = "";
    inputPassword.value = "";
    inputRole.value = "user";
  } catch (err) {
    console.error("Create account error", err);
    let msg = "Failed to create account. Please try again.";
    if (err.code === "auth/email-already-in-use") msg = "This email is already registered.";
    else if (err.code === "auth/weak-password") msg = "Password is too weak.";
    else if (err.code === "auth/invalid-email") msg = "Invalid email address.";
    showFeedback(msg, "error");
  } finally {
    btnCreate.disabled = false;
    btnCreate.textContent = "Create Account";
  }
});

// ── AUTH GUARD ────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "../auth/login.html";
});

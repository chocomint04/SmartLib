import { auth, db } from "../firebase/firebase.js";
import { createUserWithEmailAndPassword, updateProfile, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, setDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const form = document.getElementById('signupForm');
const fullnameInput = document.getElementById('fullname');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const togglePwd = document.getElementById('togglePwd');
const toggleConfirm = document.getElementById('toggleConfirm');
const agreeCheckbox = document.getElementById('agree');
const signupBtn = document.getElementById('signupBtn');
const toast = document.getElementById('toast');

// Toggle password visibility
togglePwd.addEventListener('click', () => {
  const isText = passwordInput.type === 'text';
  passwordInput.type = isText ? 'password' : 'text';
  togglePwd.textContent = isText ? '👁' : '🙈';
});

toggleConfirm.addEventListener('click', () => {
  const isText = confirmPasswordInput.type === 'text';
  confirmPasswordInput.type = isText ? 'password' : 'text';
  toggleConfirm.textContent = isText ? '👁' : '🙈';
});

function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function validatePassword(password) {
  // At least 6 characters, mix of letters and numbers recommended
  if (password.length < 6) return 'Password must be at least 6 characters.';
  return null;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullname = fullnameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const agreed = agreeCheckbox.checked;

  // Validation
  if (!fullname) {
    fullnameInput.focus();
    showToast('Please enter your full name.');
    return;
  }

  if (!email) {
    emailInput.focus();
    showToast('Please enter your institutional email.');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    emailInput.focus();
    showToast('Please enter a valid email address.');
    return;
  }

  if (!password) {
    passwordInput.focus();
    showToast('Please enter a password.');
    return;
  }

  const pwdErr = validatePassword(password);
  if (pwdErr) {
    passwordInput.focus();
    showToast(pwdErr);
    return;
  }

  if (password !== confirmPassword) {
    confirmPasswordInput.focus();
    showToast('Passwords do not match.');
    return;
  }

  if (!agreed) {
    agreeCheckbox.focus();
    showToast('You must agree to the Terms of Service and Privacy Policy.');
    return;
  }

  signupBtn.textContent = 'Creating Account…';
  signupBtn.classList.add('loading');

  try {
    // Set persistence to local before creating user
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (err) {
      console.warn('Persistence set failed', err);
    }

    // Create user with email and password
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;

    // Update profile with full name
    try {
      await updateProfile(user, { displayName: fullname });
    } catch (err) {
      console.warn('Could not update profile:', err);
    }

    // Create user document in Firestore with uid as document ID
    try {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        name: fullname,
        role: 'user',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Could not create user document in Firestore:', err);
    }

    // Store user info locally
    try {
      localStorage.setItem('user', JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: fullname
      }));
    } catch (_) {}

    showToast('✓ Account created successfully! Redirecting…', 1500);
    setTimeout(() => {
      window.location.href = '../dashboard/dashboard.html';
    }, 900);
  } catch (err) {
    console.error('Sign-up error', err);
    let msg = 'Account creation failed. Please try again.';
    if (err && err.code) {
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Use at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Email address is invalid.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = 'Account creation is currently disabled. Please contact support.';
      }
    }
    showToast(msg, 4000);
  } finally {
    signupBtn.textContent = 'Create Account';
    signupBtn.classList.remove('loading');
  }
});

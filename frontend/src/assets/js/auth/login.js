import { auth } from "../firebase/firebase.js";
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePwd = document.getElementById('togglePwd');
const signInBtn = document.getElementById('signInBtn');
const rememberBox = document.getElementById('remember');
const toast = document.getElementById('toast');

// Toggle password visibility
togglePwd.addEventListener('click', () => {
  const isText = passwordInput.type === 'text';
  passwordInput.type = isText ? 'password' : 'text';
  togglePwd.textContent = isText ? '👁' : '🙈';
});

function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

async function doSignIn(email, password, remember) {
  // choose persistence according to remember checkbox
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch (err) {
    // ignore persistence errors but continue
    console.warn('Persistence set failed', err);
  }

  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const remember = !!rememberBox && rememberBox.checked;

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
    showToast('Please enter your password.');
    return;
  }

  signInBtn.textContent = 'Signing in…';
  signInBtn.classList.add('loading');

  try {
    const user = await doSignIn(email, password, remember);
    // store minimal user info for client logic
    try { localStorage.setItem('user', JSON.stringify({ uid: user.uid, email: user.email })); } catch (_) {}
    showToast('✓ Signed in successfully! Redirecting…', 1500);
    setTimeout(() => {
      window.location.href = '../dashboard/dashboard.html';
    }, 900);
  } catch (err) {
    console.error('Sign-in error', err);
    let msg = 'Sign in failed. Please check your credentials.';
    if (err && err.code) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') msg = 'Invalid email or password.';
      else if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later.';
      else if (err.code === 'auth/invalid-email') msg = 'Email address is invalid.';
    }
    showToast(msg, 4000);
  } finally {
    signInBtn.textContent = 'Sign In';
    signInBtn.classList.remove('loading');
  }
});
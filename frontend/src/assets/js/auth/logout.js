import { auth } from "../firebase/firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const cancelBtn = document.querySelector('.btn-cancel');
const logoutBtn = document.querySelector('.btn-logout');
const signedInEl = document.querySelector('.signed-in strong');

// Display currently signed-in user email
async function displayCurrentUser() {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (signedInEl && user.email) {
        signedInEl.textContent = user.email;
      }
    }
  } catch (err) {
    console.warn('Could not load user info:', err);
  }
}

// Cancel button: go back
cancelBtn.addEventListener('click', () => {
  window.history.back();
});

// Logout button: perform Firebase sign-out
logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  logoutBtn.textContent = 'Logging out…';

  try {
    await signOut(auth);
    // clear client-side user data
    try { localStorage.removeItem('user'); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}
    // redirect to login
    window.location.href = 'login.html';
  } catch (err) {
    console.error('Sign-out error:', err);
    logoutBtn.disabled = false;
    logoutBtn.textContent = 'Log out';
    alert('Failed to sign out. Please try again.');
  }
});

// Show current user on page load
displayCurrentUser();

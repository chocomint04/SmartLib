import { auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// redirect to login if not signed in or redirect authenticated away from login/signup
onAuthStateChanged(auth, user => {
  const path = window.location.pathname;
  const isLogin = path.endsWith('/auth/login.html');
  const isSignup = path.endsWith('/auth/signup.html');
  const isAuthPage = isLogin || isSignup;

  if (!user) {
    // ensure no protected data leaked, clear storage
    try { localStorage.removeItem('user'); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}

    if (!isAuthPage) {
      window.location.href = '../auth/login.html';
    }
  } else {
    // store minimal info for other scripts
    try {
      localStorage.setItem('user', JSON.stringify({ uid: user.uid, email: user.email, displayName: user.displayName }));
    } catch (_) {}

    if (isAuthPage) {
      window.location.href = '../dashboard/dashboard.html';
    }
  }
});

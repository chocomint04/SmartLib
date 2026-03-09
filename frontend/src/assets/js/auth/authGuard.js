import { auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { db } from "../firebase/firebase.js";

onAuthStateChanged(auth, async user => {
  const path = window.location.pathname;
  const isLogin = path.endsWith('/auth/login.html');
  const isSignup = path.endsWith('/auth/signup.html');
  const isAuthPage = isLogin || isSignup;

  if (!user) {
    try { localStorage.removeItem('user'); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}

    if (!isAuthPage) {
      window.location.href = '../auth/login.html';
    }
  } else {
    try {
      localStorage.setItem('user', JSON.stringify({ uid: user.uid, email: user.email, displayName: user.displayName }));
    } catch (_) {}

    if (isAuthPage) {
      // Check role and redirect accordingly
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const role = userDoc.exists() ? userDoc.data().role : 'user';
        if (role === 'admin' || role === 'staff') {
          window.location.href = '../admin/admin-dashboard.html';
        } else {
          window.location.href = '../dashboard/dashboard.html';
        }
      } catch (err) {
        console.warn('Role check failed in authGuard', err);
        window.location.href = '../dashboard/dashboard.html';
      }
    }
  }
});
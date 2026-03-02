// hardcoded credentials for demonstration
const VALID_EMAIL = 'fsbatumbakal@gmail.com';
const VALID_PASSWORD = 'MAMAmoBLUE123*';

// run after DOM is ready so all elements exist
document.addEventListener('DOMContentLoaded', () => {
  console.log('login.js: DOMContentLoaded');

  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const togglePwd = document.getElementById('togglePwd');
  const signInBtn = document.getElementById('signInBtn');
  const toast = document.getElementById('toast');

  function showToast(msg, duration = 3000) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  }

  // Toggle password visibility
  if (togglePwd && passwordInput) {
    togglePwd.addEventListener('click', () => {
      const isText = passwordInput.type === 'text';
      passwordInput.type = isText ? 'password' : 'text';
      togglePwd.textContent = isText ? '👁' : '🙈';
      togglePwd.title = isText ? 'Show password' : 'Hide password';
    });
  } else {
    console.warn('togglePwd or passwordInput not found');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

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

    // check against hardcoded credentials
    if (email !== VALID_EMAIL || password !== VALID_PASSWORD) {
      showToast('Email or password is incorrect.', 2500);
      return;
    }

    // Simulate sign-in
    signInBtn.textContent = 'Signing in…';
    signInBtn.classList.add('loading');

    await new Promise(r => setTimeout(r, 1600));

    signInBtn.textContent = 'Sign In';
    signInBtn.classList.remove('loading');
    showToast('✓ Signed in successfully! Redirecting…', 2500);

    setTimeout(() => {
      window.location.href = '../../pages/dashboard/dashboard.html';
    }, 1000);
  });
});
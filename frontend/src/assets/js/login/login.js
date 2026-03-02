const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePwd = document.getElementById('togglePwd');
const signInBtn = document.getElementById('signInBtn');
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

  // Simulate sign-in
  signInBtn.textContent = 'Signing in…';
  signInBtn.classList.add('loading');

  await new Promise(r => setTimeout(r, 1600));

  signInBtn.textContent = 'Sign In';
  signInBtn.classList.remove('loading');
  showToast('✓ Signed in successfully! Redirecting…', 2500);
});
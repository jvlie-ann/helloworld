// AttendEase log in / sign up.
// DEMO ONLY: accounts are saved in this browser (localStorage), so this is not real security.
// When a backend is added later, replace the functions in the "accounts" section with server calls.
window.AttendEaseAuth = (function () {
  const ACCOUNTS_KEY = "attendease-accounts";
  const SESSION_KEY = "attendease-session";
  const DATA_KEY = "attendease-frontend-demo-v2";   // same name as STORAGE_KEY in script.js
  const el = (id) => document.getElementById(id);
  let user = null;
  let onReady = null;

  // ---------- accounts ----------
  function readAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}"); } catch (err) { return {}; }
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  // passwords are never saved as plain text: only a salted hash is kept
  async function hashPassword(password, salt) {
    const text = salt + password;
    if (window.crypto && crypto.subtle) {
      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let hash = 5381;                                  // very simple fallback for browsers without crypto.subtle
    for (const letter of text) hash = ((hash * 33) ^ letter.charCodeAt(0)) >>> 0;
    return "x" + hash.toString(16);
  }

  function makeSalt() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ---------- session ----------
  function currentUser() { return user; }

  function startSession(account, remember) {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, account.email);
    user = { name: account.name, email: account.email };
    const auth = el("authScreen");
    const app = document.querySelector(".app-layout");
    const animateTransition = !auth.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    app.hidden = false;
    if (animateTransition) {
      const transitionMark = document.createElement("div");
      transitionMark.className = "transition-mark";
      transitionMark.setAttribute("aria-hidden", "true");
      transitionMark.innerHTML = '<svg viewBox="0 0 64 64" focusable="false"><circle cx="32" cy="32" r="26"></circle><path d="m19 32 9 9 18-19"></path></svg>';
      document.body.append(transitionMark);
      auth.classList.add("auth-leaving");
      app.classList.add("app-entering");

      let transitionTimer;
      const onAuthExit = (event) => {
        if (event.target !== auth) return;
        auth.hidden = true;
        auth.classList.remove("auth-leaving");
      };
      const finishTransition = (event) => {
        if (event && event.target !== transitionMark) return;
        window.clearTimeout(transitionTimer);
        transitionMark.removeEventListener("animationend", finishTransition);
        transitionMark.remove();
        app.classList.remove("app-entering");
      };

      auth.addEventListener("animationend", onAuthExit);
      transitionMark.addEventListener("animationend", finishTransition);
      transitionTimer = window.setTimeout(finishTransition, 800);
    } else {
      auth.hidden = true;
    }
    onReady();
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  // ---------- screen ----------
  function showError(message) {
    el("authError").textContent = message;
  }

  function showTab(name) {
    const login = name === "login";
    el("loginForm").hidden = !login;
    el("signupForm").hidden = login;
    el("tabLogin").setAttribute("aria-selected", String(login));
    el("tabSignup").setAttribute("aria-selected", String(!login));
    showError("");
  }

  const validEmail = (text) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);

  async function handleLogin(e) {
    e.preventDefault();
    const email = el("loginEmail").value.trim().toLowerCase();
    const account = readAccounts()[email];
    if (!validEmail(email)) return showError("Enter a valid email address.");
    if (!el("loginPassword").value) return showError("Enter your password.");
    if (!account || account.hash !== await hashPassword(el("loginPassword").value, account.salt)) return showError("Email or password is incorrect.");
    startSession(account, el("rememberMe").checked);
  }

  async function handleSignup(e) {
    e.preventDefault();
    const name = el("signupName").value.trim().replace(/\s+/g, " ");
    const email = el("signupEmail").value.trim().toLowerCase();
    const password = el("signupPassword").value;
    const accounts = readAccounts();
    if (!name) return showError("Enter your name.");
    if (!validEmail(email)) return showError("Enter a valid email address.");
    if (password.length < 8) return showError("Use a password with at least 8 characters.");
    if (password !== el("signupConfirm").value) return showError("The two passwords do not match.");
    if (accounts[email]) return showError("An account with that email already exists. Try logging in.");

    const salt = makeSalt();
    accounts[email] = { name, email, salt, hash: await hashPassword(password, salt) };
    saveAccounts(accounts);
    if (!el("signupSample").checked) {                // start with an empty workspace
      localStorage.setItem(DATA_KEY + "-" + email, JSON.stringify({ courses: [], students: [], sheets: [], counters: {} }));
    }
    startSession(accounts[email], true);
  }

  function startDemo() {
    startSession({ name: "Professor Demo", email: "demo@attendease.local" }, false);
  }

  function togglePassword(button) {
    const input = el(button.dataset.target);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(show));
  }

  // script.js calls show(init); init runs once the person is logged in
  function show(callback) {
    onReady = callback;
    const email = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    const account = readAccounts()[email];
    if (account || email === "demo@attendease.local") {
      return startSession(account || { name: "Professor Demo", email }, Boolean(localStorage.getItem(SESSION_KEY)));
    }
    document.querySelector(".app-layout").hidden = true;
    el("authScreen").hidden = false;
    el("tabLogin").addEventListener("click", () => showTab("login"));
    el("tabSignup").addEventListener("click", () => showTab("signup"));
    el("loginForm").addEventListener("submit", handleLogin);
    el("signupForm").addEventListener("submit", handleSignup);
    el("demoBtn").addEventListener("click", startDemo);
    document.querySelectorAll("[data-target]").forEach((b) => b.addEventListener("click", () => togglePassword(b)));
  }

  return { show, currentUser, logout };
})();

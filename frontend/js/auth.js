import { API, TOKEN_KEY } from "./config.js";
import { authFetch } from "./api-client.js";
import { state } from "./state.js";
import { applyRoleUI, afterLoginInit, setSidebarOpen } from "./ui.js";

export async function initAuth() {
  if (state.parentMode) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    showHome();
    return;
  }
  const res = await authFetch(`${API}/auth/me`, { suppressAutoHome: true });
  if (!res.ok) {
    showHome();
    return;
  }
  state.authInfo = await res.json();
  showApp();
  applyRoleUI();
  afterLoginInit();
}

export async function handleLogin() {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();
  const error = document.getElementById("loginError");
  if (!error) return;
  error.classList.add("hidden");

  if (!user || !pass) {
    error.textContent = "Enter username and password.";
    error.classList.remove("hidden");
    return;
  }

  if (state.portalMode === "student" && !/^AAI/i.test(user)) {
    error.textContent = "Use your AAI student ID in student portal.";
    error.classList.remove("hidden");
    return;
  }

  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass })
  });

  if (!res.ok) {
    error.textContent = "Invalid credentials.";
    error.classList.remove("hidden");
    return;
  }

  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  showApp();
  await initAuth();
}

export async function openPortal(mode) {
  setSidebarOpen("home", false);
  state.portalMode = mode === "staff" ? "staff" : "student";
  const title = document.getElementById("portalTitle");
  const subtitle = document.getElementById("portalSubtitle");
  const user = document.getElementById("loginUser");
  const error = document.getElementById("loginError");
  if (error) error.classList.add("hidden");

  if (state.portalMode === "staff") {
    if (title) title.textContent = "Staff Portal";
    if (subtitle) subtitle.textContent = "Staff access enabled for superuser and staff users.";
    if (user) {
      user.placeholder = "staff username";
      user.value = "";
      user.removeAttribute("list");
    }
  } else {
    if (title) title.textContent = "Student Portal";
    if (subtitle) subtitle.textContent = "Use your AAI student login.";
    if (user) {
      user.placeholder = "AAI student ID";
      user.value = "";
      user.setAttribute("list", "studentLoginList");
    }
    if (window.loadStudentPortalLogins) await window.loadStudentPortalLogins();
  }
  document.getElementById("homeRoot")?.classList.add("hidden");
  document.getElementById("loginRoot")?.classList.remove("hidden");
  document.getElementById("appRoot")?.classList.add("hidden");
  user?.focus();
}

export function showHome() {
  if (window.endAttemptProtection) window.endAttemptProtection();
  state.currentAttempt = null;
  state.currentAttemptQuestions = [];
  state.malpracticeAutoSubmitted = false;
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById("homeRoot")?.classList.remove("hidden");
  document.getElementById("loginRoot")?.classList.add("hidden");
  document.getElementById("appRoot")?.classList.add("hidden");
  setSidebarOpen("home", false);
  setSidebarOpen("app", false);
  if (window.loadProudAlumni) window.loadProudAlumni();
  if (window.stopAnnouncementNotifier) window.stopAnnouncementNotifier();
}

export function showApp() {
  document.getElementById("homeRoot")?.classList.add("hidden");
  document.getElementById("loginRoot")?.classList.add("hidden");
  document.getElementById("appRoot")?.classList.remove("hidden");
}

export function logout() {
  if (window.endAttemptProtection) window.endAttemptProtection();
  state.currentAttempt = null;
  state.currentAttemptQuestions = [];
  state.malpracticeAutoSubmitted = false;
  localStorage.removeItem(TOKEN_KEY);
  showHome();
}

export async function changeOwnPassword() {
  const currentEl = document.getElementById("currentPasswordInput");
  const nextEl = document.getElementById("newPasswordInput");
  const currentPassword = String(currentEl?.value || "").trim();
  const newPassword = String(nextEl?.value || "").trim();
  if (!currentPassword || !newPassword) {
    alert("Enter current and new password.");
    return;
  }
  const res = await authFetch(`${API}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to change password.");
    return;
  }
  if (currentEl) currentEl.value = "";
  if (nextEl) nextEl.value = "";
  alert("Password updated.");
}

export async function adminSetUserPassword() {
  if (!state.authInfo || state.authInfo.role !== "superuser") return;
  const userEl = document.getElementById("adminPasswordUsername");
  const passEl = document.getElementById("adminPasswordNew");
  const username = String(userEl?.value || "").trim();
  const newPassword = String(passEl?.value || "").trim();
  if (!username || !newPassword) {
    alert("Enter username and new password.");
    return;
  }
  const res = await authFetch(`${API}/admin/users/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to set user password.");
    return;
  }
  if (userEl) userEl.value = "";
  if (passEl) passEl.value = "";
  alert("User password updated.");
}

import { handleApiError } from "./errors.js";

import { handleApiError } from "./errors.js";

const LOCAL_FASTAPI_HOSTS = ["127.0.0.1:8000", "localhost:8000"];
export const API = LOCAL_FASTAPI_HOSTS.includes(window.location.host)
  ? window.location.origin
  : `${window.location.origin}/api`;
export const TOKEN_KEY = "authToken";
const ATTENDANCE_QUEUE_KEY = "offlineAttendanceQueue";
const INSTALL_DISMISS_KEY = "installBannerDismissedUntil";
const NATO_BATCHES = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliett",
  "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango",
  "Uniform", "Victor", "Whiskey", "X-ray", "Yankee", "Zulu",
];

export let allStudents = [];
let selectedId = null;
export let authInfo = null;
let studentFeeSummary = null;
let razorpayKeyId = null;
let feePoliciesByStudent = {};
let portalMode = "student";
export let alumniSelectedIds = new Set();
let selectedStudentIds = new Set();
let announcementPollTimer = null;
let latestAnnouncementIdSeen = Number(localStorage.getItem("latestAnnouncementIdSeen") || 0);
let announcementsNotifierBootstrapped = false;
let admissionsCache = [];
let attendanceQueueFlushing = false;
let deferredInstallPrompt = null;
let toastTimer = null;
let leadsState = {
  cache: [],
  statusFilter: "all",
  upcomingOnly: false,
};
let parentMode = false;
export let chatbotState = {
  initialized: false,
  step: "greeting",
  intent: "",
  profile: { name: "", age: "", qualification: "", location: "", phone: "", preferred_time: "" },
};
let currentAttempt = null;
let currentAttemptQuestions = [];
let currentAttemptTimer = null;
let malpracticeAutoSubmitted = false;

function buildBatchOptions() {
  const options = [];
  NATO_BATCHES.forEach((name) => options.push(name));
  for (let cycle = 2; cycle <= 5; cycle += 1) {
    NATO_BATCHES.forEach((name) => options.push(`${name}-${cycle}`));
  }
  return options;
}

function populateBatchInputs() {
  const batchOptions = buildBatchOptions();
  const datalist = document.getElementById("natoBatchList");
  if (datalist) {
    datalist.innerHTML = "";
    batchOptions.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      datalist.appendChild(option);
    });
  }
  const bulkSelect = document.getElementById("bulkBatchSelect");
  if (bulkSelect) {
    bulkSelect.innerHTML = `<option value="">Move selected to batch...</option>`;
    batchOptions.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      bulkSelect.appendChild(option);
    });
  }
}

async function loadStudents() {
  const res = await authFetch(`${API}/students`);
  allStudents = await res.json();
  const validIds = new Set(allStudents.map((s) => String(s.student_id)));
  selectedStudentIds = new Set(Array.from(selectedStudentIds).filter((id) => validIds.has(id)));
  renderStudentList();
  updateSideCounts();
}

function renderStudentList() {
  if (authInfo && authInfo.role === "student") {
    return;
  }
  const list = document.getElementById("studentList");
  const search = document.getElementById("search").value.trim().toLowerCase();
  list.innerHTML = "";

  const filtered = allStudents.filter((s) => {
    const key = `${s.student_name} ${s.student_id}`.toLowerCase();
    return key.includes(search);
  }).sort((a, b) => {
    const aNum = Number(a.student_id);
    const bNum = Number(b.student_id);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      return bNum - aNum;
    }
    return String(b.student_id).localeCompare(String(a.student_id));
  });

  if (filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "student-item";
    li.innerHTML = `<div><strong>No students found</strong></div>`;
    list.appendChild(li);
    updateSelectedCount();
    return;
  }

  filtered.forEach((s) => {
    const li = document.createElement("li");
    li.className = "student-item";
    if (String(s.student_id) === String(selectedId)) {
      li.classList.add("active");
    }
    const isChecked = selectedStudentIds.has(String(s.student_id));
    const dueAmount = Number(s.fee_due);
    const feeLabel = Number.isFinite(dueAmount) ? `INR ${formatMoney(dueAmount)}` : "INR -";
    li.innerHTML = `
      <div class="student-row-top">
        <div class="student-row-main">
          <input type="checkbox" class="student-select" data-id="${s.student_id}" ${isChecked ? "checked" : ""} />
          <div><strong>${s.student_name}</strong></div>
        </div>
        <div class="student-fee-total">Due: ${feeLabel}</div>
      </div>
      <div class="student-meta">ID: ${s.student_id} | ${s.course} | ${s.batch} | ${s.status || "Active"}</div>
      <div class="student-actions">
        <button class="btn" data-action="alumni" data-id="${s.student_id}">Mark Alumni</button>
        <button class="btn" data-action="delete" data-id="${s.student_id}">Delete</button>
      </div>
    `;
    li.addEventListener("click", () => selectStudent(s));
    li.querySelector(".student-select")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const sid = String(e.target.dataset.id || "");
      if (!sid) return;
      if (e.target.checked) selectedStudentIds.add(sid);
      else selectedStudentIds.delete(sid);
      updateSelectedCount();
    });
    li.querySelector('[data-action="alumni"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await markSingleAlumni(String(e.target.dataset.id || ""));
    });
    li.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteSingleStudent(String(e.target.dataset.id || ""));
    });
    list.appendChild(li);
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const el = document.getElementById("selectedStudentCount");
  if (el) el.textContent = String(selectedStudentIds.size);
}

async function addStudent() {
  const name = document.getElementById("name").value.trim();
  const course = document.getElementById("course").value.trim();
  const batch = document.getElementById("batch").value.trim();

  if (!name || !course || !batch) {
    alert("Fill all fields.");
    return;
  }

  const url = `${API}/students?student_name=${encodeURIComponent(name)}&course=${encodeURIComponent(course)}&batch=${encodeURIComponent(batch)}`;
  await authFetch(url, { method: "POST" });

  document.getElementById("name").value = "";
  document.getElementById("course").value = "";
  document.getElementById("batch").value = "";

  loadStudents();
}

function getSelectedStudentIds() {
  return Array.from(selectedStudentIds);
}

async function bulkMoveBatch() {
  const ids = getSelectedStudentIds();
  const batch = (document.getElementById("bulkBatchSelect")?.value || "").trim();
  if (!ids.length) {
    alert("Select at least one student.");
    return;
  }
  if (!batch) {
    alert("Select a target batch.");
    return;
  }
  const res = await authFetch(`${API}/students/bulk-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_ids: ids, batch }),
    autoHandleError: true,
    errorMessage: "Failed to move batch.",
  });
  if (!res.ok) return;
  selectedStudentIds.clear();
  updateSelectedCount();
  await loadStudents();
  alert("Batch updated.");
}

async function bulkMarkAlumni() {
  const ids = getSelectedStudentIds();
  if (!ids.length) {
    alert("Select at least one student.");
    return;
  }
  const res = await authFetch(`${API}/students/mark-alumni`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_ids: ids }),
    autoHandleError: true,
    errorMessage: "Failed to mark alumni.",
  });
  if (!res.ok) return;
  selectedStudentIds.clear();
  updateSelectedCount();
  await Promise.all([loadStudents(), loadProudAlumni()]);
  alert("Marked as alumni.");
}

async function bulkDeleteStudents() {
  const ids = getSelectedStudentIds();
  if (!ids.length) {
    alert("Select at least one student.");
    return;
  }
  if (!confirm(`Delete ${ids.length} selected student(s)?`)) return;
  const res = await authFetch(`${API}/students/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_ids: ids }),
    autoHandleError: true,
    errorMessage: "Failed to delete students.",
  });
  if (!res.ok) return;
  selectedStudentIds.clear();
  updateSelectedCount();
  await Promise.all([loadStudents(), loadProudAlumni()]);
  alert("Deleted.");
}

async function markSingleAlumni(studentId) {
  if (!studentId) return;
  const res = await authFetch(`${API}/students/mark-alumni`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_ids: [studentId] }),
    autoHandleError: true,
    errorMessage: "Failed to mark alumni.",
  });
  if (!res.ok) return;
  selectedStudentIds.delete(studentId);
  await Promise.all([loadStudents(), loadProudAlumni()]);
}

async function deleteSingleStudent(studentId) {
  if (!studentId) return;
  if (!confirm("Delete this student?")) return;
  const res = await authFetch(`${API}/students/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_ids: [studentId] }),
    autoHandleError: true,
    errorMessage: "Failed to delete student.",
  });
  if (!res.ok) return;
  selectedStudentIds.delete(studentId);
  await Promise.all([loadStudents(), loadProudAlumni()]);
}

async function selectStudent(student) {
  selectedId = student.student_id;
  renderStudentList();

  document.getElementById("detailName").textContent = student.student_name;
  document.getElementById("detailMeta").textContent = `ID: ${student.student_id} | ${student.course} | ${student.batch}`;

  await Promise.all([
    loadBalance(student.student_id),
    loadAttendance(student.student_id),
    loadFees(student.student_id)
  ]);
}

async function loadBalance(studentId) {
  const res = await authFetch(`${API}/students/${encodeURIComponent(studentId)}/balance`);
  const data = await res.json();

  document.getElementById("metricTotal").textContent = formatMoney(data.total);
  document.getElementById("metricPaid").textContent = formatMoney(data.paid);
  document.getElementById("metricBalance").textContent = formatMoney(data.balance);
}

async function loadAttendance(studentId) {
  const res = await authFetch(`${API}/students/${encodeURIComponent(studentId)}/attendance`);
  const rows = await res.json();
  const body = document.getElementById("attendanceBody");
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3" class="empty">No attendance records</td></tr>`;
    updateAttendancePercent(0, 0);
    return;
  }

  updateAttendancePercentFromRows(rows);

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateDDMMYYYY(r.date || "-")}</td>
      <td>${r.attendance_status || "-"}</td>
      <td>${r.remarks || ""}</td>
    `;
    body.appendChild(tr);
  });
}

async function loadFees(studentId) {
  const res = await authFetch(`${API}/students/${encodeURIComponent(studentId)}/fees`);
  const rows = await res.json();
  const body = document.getElementById("feesBody");
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No fee entries</td></tr>`;
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${r.fee_id}</td>
      <td>${formatMoney(r.amount_total)}</td>
      <td>${formatMoney(r.amount_paid)}</td>
      <td>${r.due_date || "-"}</td>
      <td>${r.remarks || ""}</td>
      <td><button class="btn" onclick="openFeeInvoicePdf(${Number(r.fee_id)})">Invoice PDF</button></td>
    `;
    body.appendChild(tr);
  });
}

async function openFeeInvoicePdf(feeId) {
  const id = Number(feeId || 0);
  if (!id) {
    alert("Invalid fee entry.");
    return;
  }
  const res = await authFetch(`${API}/fees/${id}/invoice`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Unable to load invoice.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!data.invoice) {
    alert("Invoice data not found.");
    return;
  }
  await downloadInvoicePdf(data.invoice);
}

function updateSideCounts() {
  if (authInfo && authInfo.role === "student") {
    return;
  }
  document.getElementById("studentCount").textContent = allStudents.length;
  const batches = new Set(allStudents.map(s => s.batch).filter(Boolean));
  document.getElementById("batchCount").textContent = batches.size;
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
      .catch(() => {});
  });
}

function updateOfflineStatus() {
  const el = document.getElementById("offlineStatus");
  if (!el) return;
  const queued = getAttendanceQueue().length;
  const online = navigator.onLine;

  el.classList.remove("offline", "syncing");
  if (!online) {
    el.textContent = queued ? `Offline • ${queued} queued` : "Offline";
    el.classList.add("offline");
    el.classList.remove("hidden");
    return;
  }
  if (queued) {
    el.textContent = `Syncing • ${queued} queued`;
    el.classList.add("syncing");
    el.classList.remove("hidden");
    return;
  }
  el.classList.add("hidden");
}

function showToast(message, variant = "") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden", "success");
  if (variant) toast.classList.add(variant);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("success");
  }, 2600);
}

function getAttendanceQueue() {
  try {
    const raw = localStorage.getItem(ATTENDANCE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveAttendanceQueue(queue) {
  localStorage.setItem(ATTENDANCE_QUEUE_KEY, JSON.stringify(queue));
}

function enqueueAttendance(payload) {
  const queue = getAttendanceQueue();
  queue.push({
    date: payload.date,
    records: payload.records,
    queued_at: new Date().toISOString(),
  });
  saveAttendanceQueue(queue);
  updateOfflineStatus();
}

async function flushAttendanceQueue() {
  if (attendanceQueueFlushing) return;
  if (!navigator.onLine) return;
  if (!localStorage.getItem(TOKEN_KEY)) return;
  const queue = getAttendanceQueue();
  if (!queue.length) return;
  attendanceQueueFlushing = true;
  const initialCount = queue.length;
  let remaining = [];
  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    try {
      const res = await authFetch(`${API}/attendance/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: item.date, records: item.records }),
      });
      if (!res.ok) {
        remaining = queue.slice(i);
        break;
      }
    } catch (_) {
      remaining = queue.slice(i);
      break;
    }
  }
  saveAttendanceQueue(remaining);
  updateOfflineStatus();
  attendanceQueueFlushing = false;
  const synced = initialCount - remaining.length;
  if (synced > 0 && remaining.length === 0) {
    showToast(`Attendance synced (${synced} batch${synced > 1 ? "es" : ""}).`, "success");
  }
}

function initOfflineAttendanceSync() {
  window.addEventListener("online", () => {
    flushAttendanceQueue();
  });
  window.addEventListener("offline", () => {
    updateOfflineStatus();
  });
  flushAttendanceQueue();
  updateOfflineStatus();
}

function shouldShowInstallBanner() {
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
    return false;
  }
  const until = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0);
  return Date.now() > until;
}

function showInstallBanner(show) {
  const banner = document.getElementById("installBanner");
  if (!banner) return;
  banner.classList.toggle("hidden", !show);
}

function initInstallPrompt() {
  const installBtn = document.getElementById("installBtn");
  const laterBtn = document.getElementById("installLaterBtn");
  const closeBtn = document.getElementById("installCloseBtn");
  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    showInstallBanner(false);
  });
  laterBtn?.addEventListener("click", () => {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + oneWeek));
    showInstallBanner(false);
  });
  closeBtn?.addEventListener("click", () => {
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + twoWeeks));
    showInstallBanner(false);
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (shouldShowInstallBanner()) {
      showInstallBanner(true);
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    showInstallBanner(false);
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
      document.getElementById(`tab-${target}`).classList.remove("hidden");
    });
  });
}

function initParentPortal() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("parent_token");
  if (!token) return;
  parentMode = true;
  document.getElementById("homeRoot")?.classList.add("hidden");
  document.getElementById("loginRoot")?.classList.add("hidden");
  document.getElementById("appRoot")?.classList.add("hidden");
  document.getElementById("parentRoot")?.classList.remove("hidden");
  loadParentSummary(token);
}

async function loadParentSummary(token) {
  const res = await fetch(`${API}/parent/summary?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    document.getElementById("parentStudentMeta").textContent = "Link expired or invalid.";
    return;
  }
  const data = await res.json();
  const student = data.student || {};
  document.getElementById("parentStudentMeta").textContent =
    `${student.student_name || ""} • ${student.student_id || ""} • ${student.course || ""}`;
  const fees = data.fees || {};
  setText("parentFeeTotal", formatMoney(fees.total || 0));
  setText("parentFeePaid", formatMoney(fees.paid || 0));
  setText("parentFeeDue", formatMoney(fees.due || 0));
  setText("parentFeeDueDate", fees.due_date ? formatDateDDMMYYYY(fees.due_date) : "-");
  const body = document.getElementById("parentAttendanceBody");
  if (body) {
    body.innerHTML = "";
    const rows = Array.isArray(data.attendance) ? data.attendance : [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="3" class="empty">No attendance loaded</td></tr>`;
    } else {
      rows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${formatDateDDMMYYYY(r.date || "-")}</td>
          <td>${r.attendance_status || "-"}</td>
          <td>${r.remarks || ""}</td>
        `;
        body.appendChild(tr);
      });
    }
  }
}

async function loadStudentPortalLogins() {
  const dataList = document.getElementById("studentLoginList");
  if (!dataList) return;
  dataList.innerHTML = "";
  try {
    const res = await fetch(`${API}/public/student-ids`);
    if (!res.ok) return;
    const ids = await res.json();
    (ids || []).forEach((id) => {
      const option = document.createElement("option");
      option.value = id;
      dataList.appendChild(option);
    });
  } catch (_) {
    // Optional enhancement only.
  }
}

async function openPortal(mode) {
  setSidebarOpen("home", false);
  portalMode = mode === "staff" ? "staff" : "student";
  const title = document.getElementById("portalTitle");
  const subtitle = document.getElementById("portalSubtitle");
  const user = document.getElementById("loginUser");
  const error = document.getElementById("loginError");
  error?.classList.add("hidden");
  if (portalMode === "staff") {
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
    await loadStudentPortalLogins();
  }
  document.getElementById("homeRoot")?.classList.add("hidden");
  document.getElementById("loginRoot")?.classList.remove("hidden");
  document.getElementById("appRoot")?.classList.add("hidden");
  user?.focus();
}

function showHome() {
  endAttemptProtection();
  currentAttempt = null;
  currentAttemptQuestions = [];
  malpracticeAutoSubmitted = false;
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById("homeRoot")?.classList.remove("hidden");
  document.getElementById("loginRoot")?.classList.add("hidden");
  document.getElementById("appRoot")?.classList.add("hidden");
  setSidebarOpen("home", false);
  setSidebarOpen("app", false);
  loadProudAlumni();
  stopAnnouncementNotifier();
}

function toggleSidebar(scope) {
  const key = scope === "home" ? "homeSidebarOpen" : "appSidebarOpen";
  const hamburger = document.querySelector(scope === "home" ? ".home-hamburger" : ".app-hamburger");
  if (scope === "home") {
    const sidebar = document.querySelector(".home-sidebar");
    const isOpen = sidebar?.classList.toggle("open");
    hamburger?.classList.toggle("open", Boolean(isOpen));
    hamburger?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    localStorage.setItem(key, isOpen ? "1" : "0");
    return;
  }
  const sidebar = document.querySelector(".sidebar");
  const isOpen = sidebar?.classList.toggle("open");
  hamburger?.classList.toggle("open", Boolean(isOpen));
  hamburger?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  localStorage.setItem(key, isOpen ? "1" : "0");
}

function setSidebarOpen(scope, open) {
  const sidebar = document.querySelector(scope === "home" ? ".home-sidebar" : ".sidebar");
  const hamburger = document.querySelector(scope === "home" ? ".home-hamburger" : ".app-hamburger");
  if (!sidebar || !hamburger) return;
  sidebar.classList.toggle("open", open);
  hamburger.classList.toggle("open", open);
  hamburger.setAttribute("aria-expanded", open ? "true" : "false");
  const key = scope === "home" ? "homeSidebarOpen" : "appSidebarOpen";
  localStorage.setItem(key, open ? "1" : "0");
}

function initSidebarUX() {
  setSidebarOpen("home", localStorage.getItem("homeSidebarOpen") === "1");
  setSidebarOpen("app", localStorage.getItem("appSidebarOpen") === "1");

  document.addEventListener("click", (e) => {
    const target = e.target;
    const homeSidebar = document.querySelector(".home-sidebar");
    const homeHamburger = document.querySelector(".home-hamburger");
    if (homeSidebar && homeHamburger && homeSidebar.classList.contains("open")) {
      if (!homeSidebar.contains(target) && !homeHamburger.contains(target)) {
        setSidebarOpen("home", false);
      }
    }
    const appSidebar = document.querySelector(".sidebar");
    const appHamburger = document.querySelector(".app-hamburger");
    if (appSidebar && appHamburger && appSidebar.classList.contains("open")) {
      if (!appSidebar.contains(target) && !appHamburger.contains(target)) {
        setSidebarOpen("app", false);
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setSidebarOpen("home", false);
      setSidebarOpen("app", false);
      return;
    }
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const typing = activeTag === "input" || activeTag === "textarea" || document.activeElement?.isContentEditable;
    if (e.key === "/" && !typing) {
      const searchEl = document.getElementById("search");
      if (searchEl) {
        e.preventDefault();
        searchEl.focus();
      }
    }
  });
}

function showAdmissionForm() {
  setSidebarOpen("home", false);
  const admission = document.getElementById("homeAdmission");
  const welcome = document.getElementById("homeWelcome");
  admission?.classList.remove("hidden");
  if (admission && welcome && welcome.parentElement === admission.parentElement && welcome.nextElementSibling !== admission) {
    welcome.insertAdjacentElement("afterend", admission);
  }
  admission?.scrollIntoView({ behavior: "smooth", block: "start" });
  const rows = document.querySelectorAll(".academic-row");
  if (!rows.length) {
    addAcademicRow();
  }
}

async function submitHomeInquiry() {
  const name = (document.getElementById("inquiryName")?.value || "").trim();
  const phone = (document.getElementById("inquiryPhone")?.value || "").trim();
  const interest = (document.getElementById("inquiryInterest")?.value || "").trim();

  if (!name || !phone || !interest) {
    alert("Please fill your name, phone number, and interest.");
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    alert("Enter a valid 10 digit phone number.");
    return;
  }

  const res = await fetch(`${API}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      phone,
      qualification: "",
      location: "",
      age: "",
      preferred_time: "",
      intent: `inquiry - ${interest}`,
    }),
  });
  if (!(await handleApiError(res, "Unable to submit inquiry."))) return;

  document.getElementById("inquiryName").value = "";
  document.getElementById("inquiryPhone").value = "";
  document.getElementById("inquiryInterest").value = "";
  alert("Thanks! Our team will contact you soon.");
}

async function loadProudAlumni() {
  const homeList = document.getElementById("alumniList");
  const portalList = document.getElementById("portalAlumniList");
  try {
    const res = await fetch(`${API}/public/alumni`);
    if (!res.ok) throw new Error("failed");
    const rows = await res.json();
    alumniSelectedIds = new Set((rows || []).map((r) => String(r.student_id || "")));
    renderAlumniList(homeList, rows);
    renderAlumniList(portalList, rows);
  } catch (_) {
    renderAlumniError(homeList);
    renderAlumniError(portalList);
  }
}

function renderAlumniList(list, rows) {
  if (!list) return;
  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = `<li class="student-item"><strong>No alumni updates yet</strong></li>`;
    return;
  }
  rows.forEach((r) => {
    const li = document.createElement("li");
    li.className = "student-item";
    li.innerHTML = `<div><strong>${r.student_name || r.student_id}</strong></div><div class="student-meta">Selected on: ${formatDateDDMMYYYY(r.last_selected_date || "")}</div>`;
    list.appendChild(li);
  });
}

function renderAlumniError(list) {
  if (!list) return;
  list.innerHTML = `<li class="student-item"><strong>Unable to load alumni right now</strong></li>`;
}

async function readFileAsBytes(file) {
  if (!file) return null;
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function validateAdmissionForm(values) {
  const requiredFields = [
    ["First name", values.firstName],
    ["Last name", values.lastName],
    ["Mobile number", values.phone],
    ["Email", values.email],
    ["Blood group", values.bloodGroup],
    ["Age", values.age],
    ["Date of birth", values.dob],
    ["Aadhaar number", values.aadhaarNumber],
    ["Nationality", values.nationality],
    ["Course", values.course],
    ["Father name", values.fatherName],
    ["Father mobile", values.fatherPhone],
    ["Father occupation", values.fatherOccupation],
    ["Mother name", values.motherName],
    ["Mother mobile", values.motherPhone],
    ["Mother occupation", values.motherOccupation],
    ["Correspondence address", values.correspondenceAddress],
    ["Permanent address", values.permanentAddress],
  ];
  const missing = requiredFields.filter(([, value]) => !value);
  if (missing.length) {
    alert(`Please fill: ${missing.map(([label]) => label).join(", ")}.`);
    return false;
  }
  if (!/^\d{10}$/.test(values.phone)) {
    alert("Enter a valid 10 digit mobile number.");
    return false;
  }
  if (!/^\d{10}$/.test(values.fatherPhone) || !/^\d{10}$/.test(values.motherPhone)) {
    alert("Enter valid 10 digit parent mobile numbers.");
    return false;
  }
  if (!/^\d{12}$/.test(values.aadhaarNumber)) {
    alert("Enter a valid 12 digit Aadhaar number.");
    return false;
  }
  return true;
}

async function submitAdmissionForm() {
  const firstName = (document.getElementById("admissionFirstName")?.value || "").trim();
  const middleName = (document.getElementById("admissionMiddleName")?.value || "").trim();
  const lastName = (document.getElementById("admissionLastName")?.value || "").trim();
  const phone = (document.getElementById("admissionPhone")?.value || "").trim();
  const email = (document.getElementById("admissionEmail")?.value || "").trim();
  const bloodGroup = (document.getElementById("admissionBloodGroup")?.value || "").trim();
  const age = Number(document.getElementById("admissionAge")?.value || 0);
  const dob = (document.getElementById("admissionDob")?.value || "").trim();
  const aadhaarNumber = (document.getElementById("admissionAadhaar")?.value || "").trim();
  const nationality = (document.getElementById("admissionNationality")?.value || "").trim();
  const course = (document.getElementById("admissionCourse")?.value || "").trim();
  const fatherName = (document.getElementById("fatherName")?.value || "").trim();
  const fatherPhone = (document.getElementById("fatherPhone")?.value || "").trim();
  const fatherOccupation = (document.getElementById("fatherOccupation")?.value || "").trim();
  const fatherEmail = (document.getElementById("fatherEmail")?.value || "").trim();
  const motherName = (document.getElementById("motherName")?.value || "").trim();
  const motherPhone = (document.getElementById("motherPhone")?.value || "").trim();
  const motherOccupation = (document.getElementById("motherOccupation")?.value || "").trim();
  const motherEmail = (document.getElementById("motherEmail")?.value || "").trim();
  const correspondenceAddress = (document.getElementById("correspondenceAddress")?.value || "").trim();
  const permanentAddress = (document.getElementById("permanentAddress")?.value || "").trim();
  const academicDetails = Array.from(document.querySelectorAll(".academic-row"))
    .map((row) => ({
      qualification: (row.querySelector(".academic-qualification")?.value || "").trim(),
      year_of_passing: (row.querySelector(".academic-year")?.value || "").trim(),
      institution: (row.querySelector(".academic-institution")?.value || "").trim(),
      percentage: (row.querySelector(".academic-percentage")?.value || "").trim(),
    }))
    .filter((r) => r.qualification || r.year_of_passing || r.institution || r.percentage);

  if (!validateAdmissionForm({
    firstName,
    lastName,
    phone,
    email,
    bloodGroup,
    age,
    dob,
    aadhaarNumber,
    nationality,
    course,
    fatherName,
    fatherPhone,
    fatherOccupation,
    motherName,
    motherPhone,
    motherOccupation,
    correspondenceAddress,
    permanentAddress,
  })) {
    return;
  }
  const payload = {
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    phone,
    email,
    blood_group: bloodGroup,
    age,
    dob,
    aadhaar_number: aadhaarNumber,
    nationality,
    father_name: fatherName,
    father_phone: fatherPhone,
    father_occupation: fatherOccupation,
    father_email: fatherEmail,
    mother_name: motherName,
    mother_phone: motherPhone,
    mother_occupation: motherOccupation,
    mother_email: motherEmail,
    correspondence_address: correspondenceAddress,
    permanent_address: permanentAddress,
    course,
    academic_details: academicDetails,
  };

  try {
    const photoFile = document.getElementById("admissionPhoto")?.files?.[0] || null;
    let photoBytes = null;
    if (photoFile) {
      photoBytes = await readFileAsBytes(photoFile);
      if (photoBytes && photoBytes.length > 1024 * 1024) {
        throw new Error("Admission photo must be less than 1 MB.");
      }
      payload.admission_photo_base64 = photoBytes ? bytesToBase64(photoBytes) : "";
      payload.admission_photo_filename = photoFile.name || "photo.jpg";
      payload.admission_photo_type = photoFile.type || "image/jpeg";
    }

    const pdfAttachment = await generateAdmissionPdfAttachment({
      ...payload,
      admission_photo_bytes: photoBytes,
    });
    if (pdfAttachment) {
      payload.admission_pdf_base64 = pdfAttachment.base64;
      payload.admission_pdf_filename = pdfAttachment.filename;
      triggerPdfDownload(pdfAttachment.bytes, pdfAttachment.filename);
    }

    const res = await fetch(`${API}/admissions/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to submit admission form.");
    }

    document.getElementById("admissionFirstName").value = "";
    document.getElementById("admissionMiddleName").value = "";
    document.getElementById("admissionLastName").value = "";
    document.getElementById("admissionPhone").value = "";
    document.getElementById("admissionEmail").value = "";
    document.getElementById("admissionBloodGroup").value = "";
    document.getElementById("admissionAge").value = "";
    document.getElementById("admissionDob").value = "";
    document.getElementById("admissionAadhaar").value = "";
    document.getElementById("admissionNationality").value = "";
    document.getElementById("admissionCourse").value = "";
    document.getElementById("admissionPhoto").value = "";
    document.getElementById("fatherName").value = "";
    document.getElementById("fatherPhone").value = "";
    document.getElementById("fatherOccupation").value = "";
    document.getElementById("fatherEmail").value = "";
    document.getElementById("motherName").value = "";
    document.getElementById("motherPhone").value = "";
    document.getElementById("motherOccupation").value = "";
    document.getElementById("motherEmail").value = "";
    document.getElementById("correspondenceAddress").value = "";
    document.getElementById("permanentAddress").value = "";
    document.getElementById("academicRows").innerHTML = "";
    addAcademicRow();
    alert("Admission form submitted successfully.");
  } catch (e) {
    alert(e.message || "Failed to submit admission form.");
  }
}

function triggerPdfDownload(bytes, filename) {
  if (!bytes || !bytes.length) return;
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename || "document.pdf";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function generateAdmissionPdfAttachment(payload) {
  if (!window.PDFLib) return null;
  const MAX_PDF_BYTES = 1024 * 1024;
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.06, 0.27, 0.5);
  const text = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.4, 0.5);
  let logoImage = null;
  let logoWidth = 0;
  let logoHeight = 0;
  let photoImage = null;
  let photoWidth = 0;
  let photoHeight = 0;

  const wrapText = (value, maxWidth, useFont, size) => {
    const words = String(value || "-").split(/\s+/).filter(Boolean);
    if (!words.length) return ["-"];
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      const width = useFont.widthOfTextAtSize(test, size);
      if (width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  };

  const drawSectionTitle = (page, title, y) => {
    page.drawText(title, { x: 42, y, size: 12, font: bold, color: accent });
    page.drawLine({ start: { x: 42, y: y - 4 }, end: { x: 553, y: y - 4 }, thickness: 0.8, color: accent });
    return y - 18;
  };

  const drawRow = (page, label, value, y) => {
    const labelX = 42;
    const valueX = 170;
    const valueWidth = 553 - valueX;
    const lines = wrapText(value, valueWidth, font, 10);
    page.drawText(`${label}:`, { x: labelX, y, size: 10, font: bold, color: muted });
    lines.forEach((line, index) => {
      page.drawText(line, { x: valueX, y: y - (index * 14), size: 10, font, color: text });
    });
    return y - (Math.max(lines.length, 1) * 14) - 6;
  };

  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    logoImage = await doc.embedPng(logoBytes);
    const maxW = 90;
    const scale = maxW / logoImage.width;
    logoWidth = logoImage.width * scale;
    logoHeight = logoImage.height * scale;
  } catch (_) {
    logoImage = null;
    logoWidth = 0;
    logoHeight = 0;
  }

  if (payload?.admission_photo_bytes && payload.admission_photo_bytes.length) {
    try {
      const type = String(payload.admission_photo_type || "").toLowerCase();
      if (type.includes("png")) {
        photoImage = await doc.embedPng(payload.admission_photo_bytes);
      } else {
        photoImage = await doc.embedJpg(payload.admission_photo_bytes);
      }
      photoWidth = photoImage.width;
      photoHeight = photoImage.height;
    } catch (_) {
      photoImage = null;
      photoWidth = 0;
      photoHeight = 0;
    }
  }

  const drawAdmissionFormPage = (copyLabel) => {
    const page = doc.addPage([595, 842]);
    page.drawRectangle({
      x: 30,
      y: 30,
      width: 535,
      height: 782,
      borderColor: accent,
      borderWidth: 1.2,
    });
    const headerTop = 792;
    const logoY = headerTop - logoHeight - 20;
    if (logoImage) {
      page.drawImage(logoImage, {
        x: 42,
        y: logoY,
        width: logoWidth,
        height: logoHeight,
      });
    }
    const headerX = 42 + (logoWidth ? logoWidth + 16 : 0);
    page.drawText("Arunand's Aviation Institute", {
      x: headerX,
      y: headerTop,
      size: 16,
      font: bold,
      color: accent,
    });
    page.drawText("Admission Form", {
      x: headerX,
      y: headerTop - 18,
      size: 14,
      font,
      color: muted,
    });
    page.drawText(copyLabel, {
      x: headerX,
      y: headerTop - 34,
      size: 11,
      font,
      color: muted,
    });
    const issuedOn = formatDateDDMMYYYY(getTodayIso());
    page.drawText(`Application Date: ${issuedOn}`, {
      x: 42,
      y: 702,
      size: 10,
      font,
      color: muted,
    });
    const photoX = 438;
    const photoY = 698;
    const photoW = 102;
    const photoH = 110;
    page.drawRectangle({
      x: photoX,
      y: photoY,
      width: photoW,
      height: photoH,
      borderColor: muted,
      borderWidth: 0.8,
    });
    page.drawText("Photo", {
      x: photoX + 30,
      y: photoY + photoH - 16,
      size: 9,
      font,
      color: muted,
    });
    if (photoImage && photoWidth && photoHeight) {
      const pad = 6;
      const maxW = photoW - pad * 2;
      const maxH = photoH - pad * 2;
      const scale = Math.min(maxW / photoWidth, maxH / photoHeight);
      const drawW = photoWidth * scale;
      const drawH = photoHeight * scale;
      const drawX = photoX + (photoW - drawW) / 2;
      const drawY = photoY + (photoH - drawH) / 2;
      page.drawImage(photoImage, { x: drawX, y: drawY, width: drawW, height: drawH });
    }

    let y = 660;
    y = drawSectionTitle(page, "Applicant Details", y);
    y = drawRow(page, "Full Name", `${payload.first_name || ""} ${payload.middle_name || ""} ${payload.last_name || ""}`.trim(), y);
    y = drawRow(page, "Course Applied", payload.course || "-", y);
    y = drawRow(page, "Phone", payload.phone || "-", y);
    y = drawRow(page, "Email", payload.email || "-", y);
    y = drawRow(page, "Date of Birth", payload.dob ? formatDateDDMMYYYY(payload.dob) : "-", y);
    y = drawRow(page, "Age", payload.age || "-", y);
    y = drawRow(page, "Blood Group", payload.blood_group || "-", y);
    y = drawRow(page, "Aadhaar", payload.aadhaar_number || "-", y);
    y = drawRow(page, "Nationality", payload.nationality || "-", y);

    y -= 6;
    y = drawSectionTitle(page, "Parent / Guardian Details", y);
    y = drawRow(page, "Father", `${payload.father_name || "-"} | ${payload.father_phone || "-"} | ${payload.father_occupation || "-"}`, y);
    y = drawRow(page, "Father Email", payload.father_email || "-", y);
    y = drawRow(page, "Mother", `${payload.mother_name || "-"} | ${payload.mother_phone || "-"} | ${payload.mother_occupation || "-"}`, y);
    y = drawRow(page, "Mother Email", payload.mother_email || "-", y);

    y -= 6;
    y = drawSectionTitle(page, "Address Details", y);
    y = drawRow(page, "Correspondence", payload.correspondence_address || "-", y);
    y = drawRow(page, "Permanent", payload.permanent_address || "-", y);

    y -= 6;
    y = drawSectionTitle(page, "Academic Details", y);
    const tableX = 42;
    const tableW = 511;
    const colWidths = [150, 70, 210, 70];
    const headerY = y;
    page.drawRectangle({ x: tableX, y: headerY - 18, width: tableW, height: 18, borderColor: accent, borderWidth: 0.8 });
    page.drawText("Qualification", { x: tableX + 6, y: headerY - 14, size: 9, font: bold, color: accent });
    page.drawText("Year", { x: tableX + colWidths[0] + 6, y: headerY - 14, size: 9, font: bold, color: accent });
    page.drawText("Institution", { x: tableX + colWidths[0] + colWidths[1] + 6, y: headerY - 14, size: 9, font: bold, color: accent });
    page.drawText("%", { x: tableX + colWidths[0] + colWidths[1] + colWidths[2] + 6, y: headerY - 14, size: 9, font: bold, color: accent });

    let rowY = headerY - 18;
    const rows = Array.isArray(payload.academic_details) ? payload.academic_details : [];
    const maxRows = Math.min(rows.length, 5);
    for (let i = 0; i < maxRows; i += 1) {
      const item = rows[i] || {};
      rowY -= 20;
      page.drawRectangle({ x: tableX, y: rowY, width: tableW, height: 20, borderColor: rgb(0.82, 0.85, 0.9), borderWidth: 0.6 });
      page.drawText(String(item.qualification || "-"), { x: tableX + 6, y: rowY + 6, size: 9, font, color: text });
      page.drawText(String(item.year_of_passing || "-"), { x: tableX + colWidths[0] + 6, y: rowY + 6, size: 9, font, color: text });
      page.drawText(String(item.institution || "-"), { x: tableX + colWidths[0] + colWidths[1] + 6, y: rowY + 6, size: 9, font, color: text });
      page.drawText(String(item.percentage || "-"), { x: tableX + colWidths[0] + colWidths[1] + colWidths[2] + 6, y: rowY + 6, size: 9, font, color: text });
    }
    if (!maxRows) {
      rowY -= 20;
      page.drawRectangle({ x: tableX, y: rowY, width: tableW, height: 20, borderColor: rgb(0.82, 0.85, 0.9), borderWidth: 0.6 });
      page.drawText("No academic details provided.", { x: tableX + 6, y: rowY + 6, size: 9, font, color: muted });
    }

    y = rowY - 26;
    page.drawText("Declaration: I hereby confirm that the above information is true and correct to the best of my knowledge.", {
      x: 42,
      y,
      size: 9,
      font,
      color: muted,
    });
    y -= 26;
    page.drawText("Applicant Signature", { x: 42, y, size: 9, font: bold, color: muted });
    page.drawLine({ start: { x: 42, y: y - 4 }, end: { x: 220, y: y - 4 }, thickness: 0.6, color: muted });
    page.drawText("Parent/Guardian Signature", { x: 300, y, size: 9, font: bold, color: muted });
    page.drawLine({ start: { x: 300, y: y - 4 }, end: { x: 553, y: y - 4 }, thickness: 0.6, color: muted });
  };

  drawAdmissionFormPage("Student Copy");
  drawAdmissionFormPage("Office Copy");

  const bytes = await doc.save();
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error("Admission PDF must be less than 1 MB. Please reduce academic rows and retry.");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const filename = `admission_${payload.first_name}_${payload.last_name}_${Date.now()}.pdf`.replace(/\s+/g, "_");
  return { base64, filename, bytes };
}

async function fetchAdmissionPhotoBytes(admissionId) {
  if (!admissionId) return null;
  const res = await authFetch(`${API}/admissions/${admissionId}/photo`);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), type: res.headers.get("content-type") || "image/jpeg" };
}

async function generateIdCardPdf(admission) {
  if (!window.PDFLib || !admission) return;
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([260, 165]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.06, 0.27, 0.5);

  page.drawRectangle({ x: 6, y: 6, width: 248, height: 153, borderColor: accent, borderWidth: 1 });
  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    const logo = await pdfDoc.embedPng(logoBytes);
    const scale = 40 / logo.width;
    page.drawImage(logo, { x: 12, y: 118, width: logo.width * scale, height: logo.height * scale });
  } catch (_) {
    // no-op
  }

  page.drawText("Arunand's Aviation Institute", { x: 60, y: 135, size: 10, font: bold, color: accent });
  page.drawText("Student ID Card", { x: 60, y: 122, size: 9, font, color: accent });

  const photoBox = { x: 14, y: 40, w: 60, h: 70 };
  page.drawRectangle({ x: photoBox.x, y: photoBox.y, width: photoBox.w, height: photoBox.h, borderColor: accent, borderWidth: 0.8 });
  const photo = await fetchAdmissionPhotoBytes(Number(admission.admission_id || 0));
  if (photo && photo.bytes?.length) {
    try {
      const img = photo.type.includes("png")
        ? await pdfDoc.embedPng(photo.bytes)
        : await pdfDoc.embedJpg(photo.bytes);
      const scale = Math.min(photoBox.w / img.width, photoBox.h / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      page.drawImage(img, {
        x: photoBox.x + (photoBox.w - drawW) / 2,
        y: photoBox.y + (photoBox.h - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    } catch (_) {
      // no-op
    }
  }

  const x = 82;
  let y = 100;
  const line = (label, value) => {
    page.drawText(`${label}:`, { x, y, size: 8, font: bold, color: accent });
    page.drawText(String(value || "-"), { x: x + 48, y, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 12;
  };
  line("Name", admission.full_name || "-");
  line("Course", admission.course || "-");
  line("Phone", admission.phone || "-");
  line("ID", admission.admission_id || "-");

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `id_card_${admission.admission_id || "student"}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function generateCertificatePdf(admission) {
  if (!window.PDFLib || !admission) return;
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.06, 0.27, 0.5);

  page.drawRectangle({ x: 30, y: 30, width: 535, height: 782, borderColor: accent, borderWidth: 1.2 });
  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    const logo = await pdfDoc.embedPng(logoBytes);
    const scale = 120 / logo.width;
    page.drawImage(logo, { x: 42, y: 740, width: logo.width * scale, height: logo.height * scale });
  } catch (_) {
    // no-op
  }
  page.drawText("Certificate of Completion", { x: 160, y: 700, size: 24, font: bold, color: accent });
  page.drawText("This is to certify that", { x: 210, y: 640, size: 14, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(String(admission.full_name || "-"), { x: 160, y: 610, size: 22, font: bold, color: accent });
  page.drawText(`has successfully completed the ${admission.course || "course"}.`, { x: 150, y: 570, size: 14, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Date: ${formatDateDDMMYYYY(getTodayIso())}`, { x: 42, y: 120, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Authorized Signature", { x: 400, y: 120, size: 12, font: bold, color: accent });
  page.drawLine({ start: { x: 400, y: 110 }, end: { x: 540, y: 110 }, thickness: 1, color: accent });

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `certificate_${admission.admission_id || "student"}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function addAcademicRow() {
  const container = document.getElementById("academicRows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "academic-row";
  row.innerHTML = `
    <input class="academic-qualification" placeholder="Qualification" />
    <input class="academic-year" placeholder="Year Of Passing" />
    <input class="academic-institution" placeholder="University / Institution" />
    <input class="academic-percentage" placeholder="Percentage" />
    <button type="button" class="btn" onclick="this.parentElement.remove()">Remove</button>
  `;
  container.appendChild(row);
}

function setupSidebarNav() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      switchSection(btn.dataset.section);
    });
  });
}

function setupGlobalSearch() {
  const input = document.getElementById("globalSearch");
  if (!input) return;
  input.addEventListener("input", () => {
    const query = String(input.value || "").trim();
    if (!query) return;
    switchSection("search");
    runGlobalSearch(query);
  });
}

function switchSection(target) {
  if (authInfo && authInfo.role === "student") {
    const blocked = new Set(["students", "reports", "activity", "admissions"]);
    if (blocked.has(target)) {
      target = "attendance";
    }
  }
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const activeBtn = document.querySelector(`.nav-item[data-section="${target}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
  }
  document.querySelectorAll(".section").forEach(sec => sec.classList.add("hidden"));
  const sectionEl = document.getElementById(`section-${target}`);
  if (sectionEl) {
    sectionEl.classList.remove("hidden");
  }
  localStorage.setItem("activeSection", target);
  if (target === "attendance") {
    window.ensureAttendanceDateConstraints?.();
    window.renderTodayAttendance?.();
    window.renderBackAttendance?.();
    window.loadAttendanceCalendar?.();
  }
  if (target === "fees") {
    loadFeePolicies();
    renderFeesEntryList();
    loadFeeSummary();
  }
  if (target === "tests") {
    loadTests();
  }
  if (target === "feed") {
    loadFeed();
  }
  if (target === "timetable") {
    loadTimetable();
  }
  if (target === "interviews") {
    loadInterviews();
  }
  if (target === "announcements") {
    loadAnnouncements();
  }
  if (target === "notifications") {
    loadNotifications();
  }
  if (target === "admissions") {
    loadAdmissions();
  }
  if (target === "leads") {
    loadLeads();
  }
  if (target === "alumni") {
    loadProudAlumni();
  }
  if (target === "activity") {
    loadActivityLogs();
  }
  if (target === "search") {
    runGlobalSearch(document.getElementById("globalSearch")?.value || "");
  }
  if (window.matchMedia && window.matchMedia("(max-width: 1100px)").matches) {
    setSidebarOpen("app", false);
  }
}

async function loadRecentFees() {
  const body = document.getElementById("recentFeesBody");
  if (!body) {
    return;
  }
  const res = await authFetch(`${API}/fees/recent`);
  const rows = await res.json();
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No fee entries</td></tr>`;
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${r.fee_id}</td>
      <td>${r.student_id}</td>
      <td>${formatMoney(r.amount_total)}</td>
      <td>${formatMoney(r.amount_paid)}</td>
      <td>${r.due_date || "-"}</td>
      <td>${r.remarks || ""}</td>
    `;
    body.appendChild(tr);
  });
}

function renderFeesEntryList() {
  if (authInfo && authInfo.role === "student") {
    return;
  }
  const body = document.getElementById("feeEntryBody");
  body.innerHTML = "";

  if (!allStudents.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty">No students found</td></tr>`;
    return;
  }

  allStudents.forEach(s => {
    const policy = feePoliciesByStudent[String(s.student_id)] || {};
    const totalAmount = 150000;
    const totalDisplay = "INR 1.5L";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.student_name} (ID: ${s.student_id})</td>
      <td>${s.batch}</td>
      <td>
        <span class="fee-total-label">${totalDisplay}</span>
        <input class="fee-input" id="fee-total-${s.student_id}" type="number" min="0" step="0.01" value="${totalAmount}" hidden />
      </td>
      <td><input class="fee-input" id="fee-paid-${s.student_id}" type="number" min="0" step="0.01" placeholder="Paid" /></td>
      <td><input id="fee-receipt-${s.student_id}" type="file" /></td>
      <td><input class="fee-input" id="fee-remarks-${s.student_id}" placeholder="Remarks" /></td>
      <td><input class="fee-input" id="fee-concession-${s.student_id}" type="number" min="0" step="0.01" placeholder="Concession" value="${Number(policy.concession_amount || 0)}" /></td>
      <td><input id="fee-deadline-${s.student_id}" type="date" value="${policy.due_date || ""}" /></td>
      <td>
        <button class="btn" onclick="recordFee('${s.student_id}')">Record</button>
        <button class="btn" onclick="saveFeePolicy('${s.student_id}')">Save Policy</button>
      </td>
    `;
    body.appendChild(tr);
  });
}

async function recordFee(studentId) {
  const totalEl = document.getElementById(`fee-total-${studentId}`);
  const paidEl = document.getElementById(`fee-paid-${studentId}`);
  const remarksEl = document.getElementById(`fee-remarks-${studentId}`);
  const receiptEl = document.getElementById(`fee-receipt-${studentId}`);

  const amountPaid = Number(paidEl.value);
  if (!amountPaid || amountPaid <= 0) {
    alert("Enter amount paid.");
    return;
  }
  const amountTotal = totalEl.value ? Number(totalEl.value) : amountPaid;

  const form = new FormData();
  form.append("student_id", String(studentId));
  form.append("amount_paid", String(amountPaid));
  form.append("amount_total", String(amountTotal));
  form.append("remarks", remarksEl.value || "");
  if (receiptEl.files[0]) {
    form.append("receipt", receiptEl.files[0]);
  }

  const res = await authFetch(`${API}/fees/record`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to record fee.");
    return;
  }

  totalEl.value = "";
  paidEl.value = "";
  remarksEl.value = "";
  receiptEl.value = "";
  alert("Fee recorded.");
}

async function saveFeePolicy(studentId) {
  const concessionEl = document.getElementById(`fee-concession-${studentId}`);
  const deadlineEl = document.getElementById(`fee-deadline-${studentId}`);
  const concession = Math.max(Number(concessionEl?.value || 0), 0);
  const dueDate = String(deadlineEl?.value || "").trim();

  const res = await authFetch(`${API}/fees/admin/policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: String(studentId),
      concession_amount: concession,
      due_date: dueDate || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to update fee policy.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  feePoliciesByStudent[String(studentId)] = {
    concession_amount: Number(data.concession_amount || concession),
    due_date: data.due_date || dueDate || "",
  };
  await Promise.all([loadFeeSummary(), loadStudentFeeSummary()]);
  alert("Fee concession/deadline updated.");
}

async function resetFeesToUnpaid() {
  if (!confirm("This will reset all students to 100% unpaid and clear paid history. Continue?")) return;
  const res = await authFetch(`${API}/fees/admin/reset-unpaid`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to reset fees.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  await Promise.all([loadRecentFees(), loadFeeSummary(), loadStudents(), loadFeePolicies()]);
  renderFeesEntryList();
  alert(data.message || "Fees reset to unpaid.");
}

async function changeOwnPassword() {
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

async function adminSetUserPassword() {
  if (!authInfo || authInfo.role !== "superuser") return;
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

async function loadReports() {
  const res = await authFetch(`${API}/reports/summary`);
  const data = await res.json();

  document.getElementById("reportStudents").textContent = data.students ?? "-";
  document.getElementById("reportFeesTotal").textContent = formatMoney(data.fees_total);
  document.getElementById("reportFeesPaid").textContent = formatMoney(data.fees_paid);
  document.getElementById("reportBalance").textContent = formatMoney(data.fees_balance);
  document.getElementById("reportPresent").textContent = data.attendance_present ?? "-";
  document.getElementById("reportAbsent").textContent = data.attendance_absent ?? "-";
}

async function loadFeeSummary() {
  const res = await authFetch(`${API}/fees/summary`);
  if (!res.ok) return;
  const data = await res.json();
  const total = document.getElementById("feeSummaryTotal");
  const due = document.getElementById("feeSummaryDue");
  const txns = document.getElementById("feeSummaryTransactions");
  if (total) total.textContent = formatMoney(data.total);
  if (due) due.textContent = formatMoney(data.due);
  if (txns) txns.textContent = String(data.transactions ?? 0);
  const gatewayRes = await authFetch(`${API}/payments/gateway-status`);
  if (gatewayRes.ok) {
    const gateway = await gatewayRes.json();
    const gatewayEl = document.getElementById("paymentGatewayInfo");
    if (gatewayEl) gatewayEl.textContent = `Payment gateway: ${gateway.message}`;
    razorpayKeyId = gateway.key_id || null;
  }
}

async function loadFeed() {
  const res = await authFetch(`${API}/feed`);
  if (!res.ok) return;
  const data = await res.json();

  setText("feedFeesTotal", formatMoney(data.fees?.total));
  setText("feedFeesDue", formatMoney(data.fees?.due));
  setText("feedFeesTxn", String(data.fees?.transactions ?? 0));

  renderSimpleList(
    "feedInterviews",
    (data.interviews || []).map(i => `${i.airline_name} • ${formatDateDDMMYYYY(i.interview_date)} • ${i.student_name || "N/A"}`),
    "No interviews"
  );
  renderSimpleList("feedAnnouncements", (data.announcements || []).map(a => `${a.title} • ${a.message}`), "No announcements");
  renderSimpleList("feedNotifications", (data.notifications || []).map(n => `${n.title} • ${n.message}`), "No notifications");
}

async function loadTimetable() {
  const res = await authFetch(`${API}/timetable`);
  if (!res.ok) return;
  const rows = await res.json();
  const body = document.getElementById("timetableBody");
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">No timetable entries</td></tr>`;
    return;
  }
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.day_of_week}</td><td>${r.start_time} - ${r.end_time}</td><td>${r.title}</td><td>${r.course || "-"}</td><td>${r.batch || "-"}</td><td>${r.location || "-"}</td><td>${r.instructor || "-"}</td>`;
    body.appendChild(tr);
  });
}

async function addTimetable() {
  const payload = {
    title: value("ttTitle"),
    day_of_week: value("ttDay"),
    start_time: value("ttStart"),
    end_time: value("ttEnd"),
    course: value("ttCourse"),
    batch: value("ttBatch"),
    location: value("ttLocation"),
    instructor: value("ttInstructor"),
  };
  if (!payload.title || !payload.day_of_week || !payload.start_time || !payload.end_time) {
    alert("Title, day, start, and end time are required.");
    return;
  }
  const res = await authFetch(`${API}/timetable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert("Failed to add timetable entry.");
    return;
  }
  clearInputs(["ttTitle", "ttDay", "ttStart", "ttEnd", "ttCourse", "ttBatch", "ttLocation", "ttInstructor"]);
  loadTimetable();
}

async function loadInterviews() {
  const res = await authFetch(`${API}/interviews`);
  if (!res.ok) return;
  const rows = await res.json();
  const body = document.getElementById("interviewBody");
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">No interview records</td></tr>`;
    return;
  }
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.student_name || "-"}</td><td>${r.airline_name}</td><td>${formatDateDDMMYYYY(r.interview_date)}</td><td>${r.notes || ""}</td>`;
    body.appendChild(tr);
  });
}

async function addInterview() {
  const payload = {
    airline_name: value("ivAirline"),
    interview_date: value("ivDate"),
    notes: value("ivNotes"),
  };
  if (!payload.airline_name || !payload.interview_date) {
    alert("Airline and date are required.");
    return;
  }
  const res = await authFetch(`${API}/interviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert("Failed to add interview.");
    return;
  }
  clearInputs(["ivAirline", "ivDate", "ivNotes"]);
  loadInterviews();
}

async function loadAnnouncements() {
  const res = await authFetch(`${API}/announcements`);
  if (!res.ok) return;
  const rows = await res.json();
  renderSimpleList("announcementList", rows.map(a => `${a.title} • ${a.message}`), "No announcements");
}

function stopAnnouncementNotifier() {
  if (announcementPollTimer) {
    clearInterval(announcementPollTimer);
    announcementPollTimer = null;
  }
  announcementsNotifierBootstrapped = false;
}

async function initAnnouncementNotifier() {
  stopAnnouncementNotifier();
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (_) {
      return;
    }
  }
  await checkForAnnouncementPush();
  announcementPollTimer = setInterval(checkForAnnouncementPush, 30000);
}

async function checkForAnnouncementPush() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const res = await authFetch(`${API}/announcements?limit=10`);
  if (!res.ok) return;
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return;
  const sorted = [...rows].sort((a, b) => Number(a.announcement_id || 0) - Number(b.announcement_id || 0));
  if (!announcementsNotifierBootstrapped) {
    latestAnnouncementIdSeen = Math.max(latestAnnouncementIdSeen, Number(sorted[sorted.length - 1].announcement_id || 0));
    localStorage.setItem("latestAnnouncementIdSeen", String(latestAnnouncementIdSeen));
    announcementsNotifierBootstrapped = true;
    return;
  }
  const newItems = sorted.filter((a) => Number(a.announcement_id || 0) > latestAnnouncementIdSeen);
  if (!newItems.length) return;
  latestAnnouncementIdSeen = Math.max(...newItems.map((a) => Number(a.announcement_id || 0)), latestAnnouncementIdSeen);
  localStorage.setItem("latestAnnouncementIdSeen", String(latestAnnouncementIdSeen));
  if (Notification.permission !== "granted") return;
  for (const item of newItems) {
    try {
      new Notification(item.title || "New Announcement", {
        body: item.message || "",
        icon: "/assets/logo.png",
      });
    } catch (_) {
      // no-op
    }
  }
}

async function addAnnouncement() {
  const payload = { title: value("anTitle"), message: value("anMessage") };
  if (!payload.title || !payload.message) {
    alert("Title and message are required.");
    return;
  }
  const res = await authFetch(`${API}/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert("Failed to create announcement.");
    return;
  }
  clearInputs(["anTitle", "anMessage"]);
  loadAnnouncements();
}

async function loadNotifications() {
  const res = await authFetch(`${API}/notifications`);
  if (!res.ok) return;
  const rows = await res.json();
  const list = document.getElementById("notificationList");
  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = `<li class="student-item"><strong>No notifications</strong></li>`;
    return;
  }
  rows.forEach(n => {
    const li = document.createElement("li");
    li.className = "student-item";
    li.innerHTML = `<div><strong>${n.title}</strong> ${n.is_read ? "" : "<span class='hint'>(new)</span>"}</div><div class="student-meta">${n.message}</div>`;
    if (!n.is_read) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Mark Read";
      btn.onclick = async () => {
        await authFetch(`${API}/notifications/${n.notification_id}/read`, { method: "POST" });
        loadNotifications();
      };
      li.appendChild(btn);
    }
    list.appendChild(li);
  });
}

async function loadAdmissions() {
  const body = document.getElementById("admissionsBody");
  if (!body) return;
  const res = await authFetch(`${API}/admissions`);
  if (!res.ok) {
    body.innerHTML = `<tr><td colspan="8" class="empty">Failed to load admissions</td></tr>`;
    return;
  }
  const rows = await res.json();
  admissionsCache = Array.isArray(rows) ? rows : [];
  body.innerHTML = "";
  if (!admissionsCache.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty">No admissions found</td></tr>`;
    return;
  }
  admissionsCache.forEach((r) => {
    const tr = document.createElement("tr");
    const hasPdf = Boolean(r.pdf_available);
    tr.innerHTML = `
      <td>${r.admission_id || "-"}</td>
      <td>${r.full_name || "-"}</td>
      <td>${r.course || "-"}</td>
      <td>${r.phone || "-"}</td>
      <td>${r.email || "-"}</td>
      <td>${formatDateTime(r.created_at || "")}</td>
      <td>${hasPdf ? `<button class="btn" data-id="${r.admission_id}">View PDF</button>` : "-"}</td>
      <td>
        <button class="btn" data-delete-id="${r.admission_id}">Delete</button>
        <button class="btn" data-id-card="${r.admission_id}">ID Card</button>
        <button class="btn" data-cert="${r.admission_id}">Certificate</button>
      </td>
    `;
    const btn = tr.querySelector("button[data-id]");
    if (btn) {
      btn.addEventListener("click", async () => {
        await openAdmissionPdf(Number(r.admission_id));
      });
    }
    const deleteBtn = tr.querySelector("button[data-delete-id]");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        await deleteAdmission(Number(r.admission_id), r.full_name || "");
      });
    }
    const idBtn = tr.querySelector("button[data-id-card]");
    if (idBtn) {
      idBtn.addEventListener("click", async () => {
        await generateIdCardPdf(r);
      });
    }
    const certBtn = tr.querySelector("button[data-cert]");
    if (certBtn) {
      certBtn.addEventListener("click", async () => {
        await generateCertificatePdf(r);
      });
    }
    body.appendChild(tr);
  });
}

async function runGlobalSearch(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return;
  const isStudent = authInfo && authInfo.role === "student";
  if (!isStudent && !admissionsCache.length) {
    await loadAdmissions();
  }
  const feeRows = isStudent ? [] : await loadRecentFeesForSearch();
  const studentResults = allStudents.filter((s) => {
    const key = `${s.student_name} ${s.student_id} ${s.course} ${s.batch}`.toLowerCase();
    return key.includes(q);
  }).slice(0, 8);
  const admissionResults = isStudent ? [] : admissionsCache.filter((a) => {
    const key = `${a.full_name} ${a.phone} ${a.email} ${a.course}`.toLowerCase();
    return key.includes(q);
  }).slice(0, 8);
  const feesResults = feeRows.filter((f) => {
    const key = `${f.student_id} ${f.remarks || ""}`.toLowerCase();
    return key.includes(q);
  }).slice(0, 8);
  renderSearchResults("searchStudents", studentResults.map((s) => `${s.student_name} (${s.student_id}) • ${s.course || "-"}`));
  renderSearchResults("searchAdmissions", admissionResults.map((a) => `${a.full_name} • ${a.phone} • ${a.course}`));
  renderSearchResults("searchFees", feesResults.map((f) => `#${f.fee_id} • ${f.student_id} • INR ${formatMoney(f.amount_paid || 0)}`));
}

function renderSearchResults(id, items) {
  const list = document.getElementById(id);
  if (!list) return;
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<li class="student-item"><strong>No results</strong></li>`;
    return;
  }
  items.forEach((text) => {
    const li = document.createElement("li");
    li.className = "student-item";
    li.textContent = text;
    list.appendChild(li);
  });
}

async function loadRecentFeesForSearch() {
  const res = await authFetch(`${API}/fees/recent`);
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

async function loadLeads() {
  const body = document.getElementById("leadsBody");
  if (!body) return;
  const res = await authFetch(`${API}/leads`);
  if (!res.ok) {
    body.innerHTML = `<tr><td colspan="12" class="empty">Failed to load leads</td></tr>`;
    return;
  }
  const rows = await res.json();
  leadsState.cache = Array.isArray(rows) ? rows : [];
  applyLeadsFilters();
}

function applyLeadsFilters() {
  const statusSelect = document.getElementById("leadsStatusFilter");
  if (statusSelect) {
    leadsState.statusFilter = statusSelect.value || "all";
  }
  const filtered = leadsState.cache.filter((r) => {
    const status = String(r.status || "new");
    if (leadsState.statusFilter !== "all" && status !== leadsState.statusFilter) return false;
    if (leadsState.upcomingOnly) {
      const date = String(r.followup_date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const today = getTodayIso();
      const max = addDaysIso(today, 7);
      if (date < today || date > max) return false;
    }
    return true;
  });
  renderLeadsTable(filtered);
  const btn = document.getElementById("leadsUpcomingBtn");
  if (btn) btn.classList.toggle("primary", leadsState.upcomingOnly);
}

function renderLeadsTable(rows) {
  const body = document.getElementById("leadsBody");
  if (!body) return;
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="12" class="empty">No leads found</td></tr>`;
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const status = String(r.status || "new");
    const statusDisplay = status.replace(/_/g, " ");
    const actionBtn = status === "contacted"
      ? `<span class="badge muted">Contacted</span>`
      : `<button class="btn" data-contact-id="${r.lead_id}">Mark Contacted</button>`;
    const notInterestedBtn = status === "not_interested"
      ? `<span class="badge muted">Not Interested</span>`
      : `<button class="btn" data-ni-id="${r.lead_id}">Not Interested</button>`;
    const followupValue = r.followup_date || "";
    tr.innerHTML = `
      <td>${r.lead_id || "-"}</td>
      <td>${r.name || "-"}</td>
      <td>${r.phone || "-"}</td>
      <td>${r.location || "-"}</td>
      <td>${r.qualification || "-"}</td>
      <td>${r.age || "-"}</td>
      <td>${r.intent || "-"}</td>
      <td>${r.preferred_time || "-"}</td>
      <td>
        <input class="fee-input" type="date" value="${followupValue}" data-followup-id="${r.lead_id}" />
        <button class="btn" data-followup-save="${r.lead_id}">Save</button>
      </td>
      <td>${statusDisplay}</td>
      <td>${actionBtn} ${notInterestedBtn}</td>
      <td>${formatDateDDMMYYYY(r.created_at || "")}</td>
    `;
    tr.querySelector("[data-contact-id]")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = Number(e.target.dataset.contactId || 0);
      if (!id) return;
      const resp = await authFetch(`${API}/leads/${id}/contacted`, { method: "POST" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert(err.detail || "Failed to update lead.");
        return;
      }
      await loadLeads();
    });
    tr.querySelector("[data-ni-id]")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = Number(e.target.dataset.niId || 0);
      if (!id) return;
      const resp = await authFetch(`${API}/leads/${id}/not-interested`, { method: "POST" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert(err.detail || "Failed to update lead.");
        return;
      }
      await loadLeads();
    });
    tr.querySelector("[data-followup-save]")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = Number(e.target.dataset.followupSave || 0);
      const dateInput = tr.querySelector(`[data-followup-id="${id}"]`);
      const followupDate = String(dateInput?.value || "").trim();
      if (!followupDate) {
        alert("Select a follow-up date first.");
        return;
      }
      const resp = await authFetch(`${API}/leads/${id}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followup_date: followupDate }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert(err.detail || "Failed to save follow-up date.");
        return;
      }
      await loadLeads();
    });
    body.appendChild(tr);
  });
}

function toggleLeadsUpcoming() {
  leadsState.upcomingOnly = !leadsState.upcomingOnly;
  applyLeadsFilters();
}

function addDaysIso(iso, days) {
  const base = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return iso;
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function exportLeadsCsv() {
  const body = document.getElementById("leadsBody");
  if (!body) return;
  const rows = Array.from(body.querySelectorAll("tr"));
  if (!rows.length || rows[0].querySelector(".empty")) {
    alert("No leads to export.");
    return;
  }
  const headers = [
    "ID",
    "Name",
    "Phone",
    "Location",
    "Qualification",
    "Age",
    "Intent",
    "Preferred Time",
    "Follow-up Date",
    "Status",
    "Submitted",
  ];
  const data = rows.map((row) => {
    const cells = Array.from(row.children);
    const base = cells.slice(0, 8).map((cell) => String(cell.textContent || "").trim());
    const followupCell = cells[8];
    const followupInput = followupCell?.querySelector("input");
    const followupDate = String(followupInput?.value || "").trim();
    const status = String(cells[9]?.textContent || "").trim();
    const submitted = String(cells[11]?.textContent || "").trim();
    return base.concat([followupDate, status, submitted]);
  });
  const csvLines = [headers.join(",")].concat(
    data.map((row) => row.map((value) => `"${value.replace(/"/g, "\"\"")}"`).join(","))
  );
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `leads_${getTodayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportAttendanceCsv() {
  const body = document.getElementById("recentAttendanceBody");
  if (!body) return;
  const rows = Array.from(body.querySelectorAll("tr"));
  if (!rows.length || rows[0].querySelector(".empty")) {
    alert("No attendance data to export.");
    return;
  }
  const headers = ["Date", "Student", "Status", "Remarks"];
  const data = rows.map((row) => Array.from(row.children).map((cell) => String(cell.textContent || "").trim()));
  downloadCsv(headers, data, `attendance_${getTodayIso()}.csv`);
}

function exportFeesCsv() {
  const body = document.getElementById("feeEntryBody");
  if (!body) return;
  const rows = Array.from(body.querySelectorAll("tr"));
  if (!rows.length || rows[0].querySelector(".empty")) {
    alert("No fee data to export.");
    return;
  }
  const headers = ["Student", "Batch", "Total Fee", "Paid", "Remarks", "Concession", "Deadline"];
  const data = rows.map((row) => {
    const cells = Array.from(row.children);
    const student = String(cells[0]?.textContent || "").trim();
    const batch = String(cells[1]?.textContent || "").trim();
    const total = "150000";
    const paid = String(cells[3]?.querySelector("input")?.value || "").trim();
    const remarks = String(cells[5]?.querySelector("input")?.value || "").trim();
    const concession = String(cells[6]?.querySelector("input")?.value || "").trim();
    const deadline = String(cells[7]?.querySelector("input")?.value || "").trim();
    return [student, batch, total, paid, remarks, concession, deadline];
  });
  downloadCsv(headers, data, `fees_${getTodayIso()}.csv`);
}

function exportReportsCsv() {
  const rows = [
    ["Students", document.getElementById("reportStudents")?.textContent || ""],
    ["Fees Total", document.getElementById("reportFeesTotal")?.textContent || ""],
    ["Fees Paid", document.getElementById("reportFeesPaid")?.textContent || ""],
    ["Balance Due", document.getElementById("reportBalance")?.textContent || ""],
    ["Present", document.getElementById("reportPresent")?.textContent || ""],
    ["Absent", document.getElementById("reportAbsent")?.textContent || ""],
  ];
  downloadCsv(["Metric", "Value"], rows, `reports_${getTodayIso()}.csv`);
}

function downloadCsv(headers, rows, filename) {
  const csvLines = [headers.join(",")].concat(
    rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(","))
  );
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function sendFeeReminders() {
  if (!confirm("Send fee reminders to students with upcoming due dates?")) return;
  const res = await authFetch(`${API}/fees/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: 7 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to send reminders.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  alert(`Reminders sent: ${data.sent || 0}`);
}

function parseAcademicDetails(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function buildAdmissionPayloadFromRow(r) {
  return {
    first_name: r.first_name || "",
    middle_name: r.middle_name || "",
    last_name: r.last_name || "",
    phone: r.phone || "",
    email: r.email || "",
    blood_group: r.blood_group || "",
    age: Number(r.age || 0),
    dob: r.dob || "",
    aadhaar_number: r.aadhaar_number || "",
    nationality: r.nationality || "",
    course: r.course || "",
    father_name: r.father_name || "",
    father_phone: r.father_phone || "",
    father_occupation: r.father_occupation || "",
    father_email: r.father_email || "",
    mother_name: r.mother_name || "",
    mother_phone: r.mother_phone || "",
    mother_occupation: r.mother_occupation || "",
    mother_email: r.mother_email || "",
    correspondence_address: r.correspondence_address || "",
    permanent_address: r.permanent_address || "",
    academic_details: parseAcademicDetails(r.academic_details_json),
  };
}

async function regenerateAdmissionPdfs() {
  if (!admissionsCache.length) {
    alert("No admissions loaded yet. Click Refresh first.");
    return;
  }
  if (!confirm(`Regenerate PDFs for ${admissionsCache.length} admission(s)? This will overwrite stored PDFs.`)) {
    return;
  }
    for (const r of admissionsCache) {
      const admissionId = Number(r.admission_id || 0);
      if (!admissionId) continue;
      const payload = buildAdmissionPayloadFromRow(r);
      let photoBytes = null;
      if (r.photo_available) {
        const photoRes = await authFetch(`${API}/admissions/${admissionId}/photo`);
        if (photoRes.ok) {
          const buf = await photoRes.arrayBuffer();
          photoBytes = new Uint8Array(buf);
          payload.admission_photo_type = photoRes.headers.get("content-type") || "image/jpeg";
        }
      }
      const pdfAttachment = await generateAdmissionPdfAttachment({
        ...payload,
        admission_photo_bytes: photoBytes,
      });
      if (!pdfAttachment) continue;
      const res = await authFetch(`${API}/admissions/${admissionId}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        admission_pdf_base64: pdfAttachment.base64,
        admission_pdf_filename: pdfAttachment.filename,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || `Failed to update admission #${admissionId}.`);
      return;
    }
  }
  await loadAdmissions();
  alert("Admission PDFs regenerated.");
}

async function loadFeePolicies() {
  if (!authInfo || authInfo.role === "student") return;
  const res = await authFetch(`${API}/fees/admin/policies`);
  if (!res.ok) return;
  const rows = await res.json().catch(() => []);
  const map = {};
  (rows || []).forEach((r) => {
    const sid = String(r.student_id || "");
    if (!sid) return;
    map[sid] = {
      concession_amount: Number(r.concession_amount || 0),
      due_date: r.due_date || "",
    };
  });
  feePoliciesByStudent = map;
  renderFeesEntryList();
}

async function openAdmissionPdf(admissionId) {
  if (!admissionId) return;
  const res = await authFetch(`${API}/admissions/${admissionId}/pdf`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Unable to open admission PDF.");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

async function deleteAdmission(admissionId, fullName) {
  if (!admissionId) return;
  if (!confirm(`Delete admission #${admissionId}${fullName ? ` (${fullName})` : ""}?`)) return;
  const res = await authFetch(`${API}/admissions/${admissionId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Unable to delete admission.");
    return;
  }
  await Promise.all([loadAdmissions(), loadActivityLogs()]);
}

function addTestQuestionRow(data = {}) {
  const container = document.getElementById("testQuestionRows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "test-question-row";
  row.innerHTML = `
    <div class="test-question-header">
      <strong>Question</strong>
      <button type="button" class="btn" onclick="this.closest('.test-question-row').remove()">Remove</button>
    </div>
    <div class="test-question-main">
      <textarea class="test-question-text" placeholder="Question text">${escapeHtml(data.question_text || "")}</textarea>
    </div>
    <div class="test-options-grid">
      <input class="test-option-a" placeholder="Option A" value="${escapeHtml(data.option_a || "")}" />
      <input class="test-option-b" placeholder="Option B" value="${escapeHtml(data.option_b || "")}" />
      <input class="test-option-c" placeholder="Option C" value="${escapeHtml(data.option_c || "")}" />
      <input class="test-option-d" placeholder="Option D" value="${escapeHtml(data.option_d || "")}" />
    </div>
    <div class="test-correct-row">
      <label class="hint">Correct option</label>
      <select class="test-correct">
        <option value="A" ${(data.correct_answer || "") === "A" ? "selected" : ""}>A</option>
        <option value="B" ${(data.correct_answer || "") === "B" ? "selected" : ""}>B</option>
        <option value="C" ${(data.correct_answer || "") === "C" ? "selected" : ""}>C</option>
        <option value="D" ${(data.correct_answer || "") === "D" ? "selected" : ""}>D</option>
      </select>
    </div>
  `;
  container.appendChild(row);
}

async function createTest() {
  if (!authInfo || authInfo.role !== "superuser") return;
  const title = value("testTitle");
  const description = value("testDescription");
  const durationMinutes = Number(value("testDuration") || 30);
  const assignedRaw = value("testAssignedStudents");
  if (!title) {
    alert("Test title is required.");
    return;
  }
  const questions = Array.from(document.querySelectorAll(".test-question-row")).map((row) => ({
    question_text: (row.querySelector(".test-question-text")?.value || "").trim(),
    option_a: (row.querySelector(".test-option-a")?.value || "").trim(),
    option_b: (row.querySelector(".test-option-b")?.value || "").trim(),
    option_c: (row.querySelector(".test-option-c")?.value || "").trim(),
    option_d: (row.querySelector(".test-option-d")?.value || "").trim(),
    correct_answer: (row.querySelector(".test-correct")?.value || "A").trim().toUpperCase(),
  })).filter((q) => q.question_text && q.option_a && q.option_b && q.option_c && q.option_d && ["A", "B", "C", "D"].includes(q.correct_answer));

  if (!questions.length) {
    alert("Add at least one complete MCQ question.");
    return;
  }

  const assignedStudents = assignedRaw
    ? assignedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const res = await authFetch(`${API}/tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      description,
      duration_minutes: durationMinutes,
      questions,
      assigned_students: assignedStudents,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to create test.");
    return;
  }
  document.getElementById("testTitle").value = "";
  document.getElementById("testDescription").value = "";
  document.getElementById("testDuration").value = "30";
  document.getElementById("testAssignedStudents").value = "";
  document.getElementById("testQuestionRows").innerHTML = "";
  addTestQuestionRow();
  await Promise.all([loadTests(), loadActivityLogs()]);
  alert("Test created.");
}

async function loadTests() {
  const res = await authFetch(`${API}/tests`);
  if (!res.ok) return;
  const data = await res.json();
  if (authInfo && authInfo.role === "superuser") {
    if (!document.querySelector("#testQuestionRows .test-question-row")) {
      addTestQuestionRow();
    }
    const body = document.getElementById("adminTestsBody");
    if (!body) return;
    body.innerHTML = "";
    if (!data.length) {
      body.innerHTML = `<tr><td colspan="7" class="empty">No tests created</td></tr>`;
      const attemptsBody = document.getElementById("testAttemptsBody");
      if (attemptsBody) attemptsBody.innerHTML = `<tr><td colspan="6" class="empty">No attempts to review</td></tr>`;
      return;
    }
    data.forEach((t) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t.test_id}</td>
        <td>${escapeHtml(t.title || "")}</td>
        <td>${t.question_count || 0}</td>
        <td>${t.assignment_count || 0}</td>
        <td>${t.attempt_count || 0}</td>
        <td>${t.malpractice_count || 0}</td>
        <td><button class="btn" data-review-test-id="${t.test_id}">Review</button></td>
      `;
      tr.querySelector('[data-review-test-id]')?.addEventListener("click", async (e) => {
        await loadTestAttempts(Number(e.target.dataset.reviewTestId || 0), t.title || "");
      });
      body.appendChild(tr);
    });
    await loadTestAttempts(Number(data[0].test_id || 0), data[0].title || "");
    return;
  }
  const body = document.getElementById("studentTestsBody");
  if (!body) return;
  body.innerHTML = "";
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">No tests assigned</td></tr>`;
    return;
  }
  data.forEach((t) => {
    const tr = document.createElement("tr");
    const status = t.attempt_status || "Not started";
    const canStart = status !== "submitted";
    tr.innerHTML = `
      <td>${escapeHtml(t.title || "")}</td>
      <td>${t.duration_minutes || 30} mins</td>
      <td>${status}</td>
      <td>${canStart ? `<button class="btn" data-test-id="${t.test_id}">${status === "in_progress" ? "Resume" : "Start"}</button>` : "Completed"}</td>
    `;
    const btn = tr.querySelector("button[data-test-id]");
    if (btn) {
      btn.addEventListener("click", async () => {
        await startTestAttempt(Number(t.test_id));
      });
    }
    body.appendChild(tr);
  });
}

async function startTestAttempt(testId) {
  const startRes = await authFetch(`${API}/tests/${testId}/start`, { method: "POST" });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    alert(err.detail || "Unable to start test.");
    return;
  }
  const attempt = await startRes.json();
  malpracticeAutoSubmitted = false;
  currentAttempt = attempt;
  currentAttemptQuestions = Array.isArray(attempt.questions) ? attempt.questions : [];
  document.getElementById("attemptTestTitle").textContent = attempt.title || "Test Attempt";
  renderAttemptQuestions(currentAttemptQuestions, attempt.answers || {});
  document.getElementById("testAttemptPanel")?.classList.remove("hidden");
  enableAttemptProtection();
  startAttemptTimer();
}

function renderAttemptQuestions(questions, existingAnswers) {
  const container = document.getElementById("attemptQuestions");
  if (!container) return;
  container.innerHTML = "";
  questions.forEach((q, index) => {
    const val = String((existingAnswers || {})[q.question_id] || "");
    const options = Array.isArray(q.options) && q.options.length
      ? q.options
      : [
          { key: "A", text: q.option_a || "" },
          { key: "B", text: q.option_b || "" },
          { key: "C", text: q.option_c || "" },
          { key: "D", text: q.option_d || "" },
        ];
    const div = document.createElement("div");
    div.className = "attempt-question attempt-protected";
    const optionsHtml = options
      .map((opt) => `<label><input type="radio" name="attempt-q-${q.question_id}" value="${escapeHtml(opt.key)}" ${val === opt.key ? "checked" : ""}/> ${escapeHtml(opt.text || "")}</label><br/>`)
      .join("");
    div.innerHTML = `
      <div><strong>Q${index + 1}. ${escapeHtml(q.question_text || "")}</strong></div>
      ${optionsHtml}
    `;
    container.appendChild(div);
  });
}

function collectAttemptAnswers() {
  return currentAttemptQuestions.map((q) => {
    const selected = document.querySelector(`input[name="attempt-q-${q.question_id}"]:checked`);
    return {
      question_id: q.question_id,
      answer: selected ? selected.value : "",
    };
  });
}

async function submitCurrentAttempt() {
  if (!currentAttempt || !currentAttempt.attempt_id) return;
  const answers = collectAttemptAnswers();
  const res = await authFetch(`${API}/tests/attempts/${currentAttempt.attempt_id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to submit.");
    return;
  }
  const data = await res.json();
  alert(`Test submitted. Score: ${data.score}/${data.total_points}`);
  endAttemptProtection();
  currentAttempt = null;
  currentAttemptQuestions = [];
  malpracticeAutoSubmitted = false;
  document.getElementById("testAttemptPanel")?.classList.add("hidden");
  await loadTests();
}

function startAttemptTimer() {
  if (!currentAttempt) return;
  clearInterval(currentAttemptTimer);
  const endTs = Number(currentAttempt.ends_at_epoch || 0) * 1000;
  const timerEl = document.getElementById("attemptTimer");
  const tick = async () => {
    const leftMs = endTs - Date.now();
    if (leftMs <= 0) {
      clearInterval(currentAttemptTimer);
      if (timerEl) timerEl.textContent = "Time left: 00:00";
      await submitCurrentAttempt();
      return;
    }
    const totalSec = Math.floor(leftMs / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    if (timerEl) timerEl.textContent = `Time left: ${mm}:${ss}`;
  };
  tick();
  currentAttemptTimer = setInterval(tick, 1000);
}

async function reportMalpractice(eventType, details) {
  if (!currentAttempt || !currentAttempt.attempt_id) return;
  const res = await authFetch(`${API}/tests/attempts/${currentAttempt.attempt_id}/malpractice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType, details }),
  });
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  if (!malpracticeAutoSubmitted && Number(data.malpractice_count || 0) >= 1) {
    malpracticeAutoSubmitted = true;
    alert("Malpractice recorded. Test will be auto-submitted.");
    await submitCurrentAttempt();
  }
}

function enableAttemptProtection() {
  const handler = async (e) => {
    if (!currentAttempt) return;
    const key = String(e.key || "").toLowerCase();
    const blocked = (e.ctrlKey && ["c", "v", "x", "a", "p", "u", "s"].includes(key))
      || key === "printscreen"
      || key === "f12";
    if (blocked) {
      e.preventDefault();
      await reportMalpractice("blocked_key", `${e.ctrlKey ? "ctrl+" : ""}${key}`);
      alert("Malpractice warning: restricted action detected.");
    }
  };
  const contextHandler = async (e) => {
    if (!currentAttempt) return;
    e.preventDefault();
    await reportMalpractice("context_menu", "Right click blocked");
  };
  const copyHandler = async (e) => {
    if (!currentAttempt) return;
    e.preventDefault();
    await reportMalpractice("copy_paste", "Copy/Cut/Paste blocked");
  };
  const visibilityHandler = async () => {
    if (!currentAttempt) return;
    if (document.hidden) {
      await reportMalpractice("tab_switch", "Visibility changed");
      alert("Malpractice warning: tab switch detected.");
    }
  };
  window.__attemptProtection = { handler, contextHandler, copyHandler, visibilityHandler };
  document.addEventListener("keydown", handler, true);
  document.addEventListener("contextmenu", contextHandler, true);
  document.addEventListener("copy", copyHandler, true);
  document.addEventListener("cut", copyHandler, true);
  document.addEventListener("paste", copyHandler, true);
  document.addEventListener("visibilitychange", visibilityHandler, true);
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function endAttemptProtection() {
  clearInterval(currentAttemptTimer);
  const p = window.__attemptProtection;
  if (p) {
    document.removeEventListener("keydown", p.handler, true);
    document.removeEventListener("contextmenu", p.contextHandler, true);
    document.removeEventListener("copy", p.copyHandler, true);
    document.removeEventListener("cut", p.copyHandler, true);
    document.removeEventListener("paste", p.copyHandler, true);
    document.removeEventListener("visibilitychange", p.visibilityHandler, true);
    window.__attemptProtection = null;
  }
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

async function loadActivityLogs() {
  const body = document.getElementById("activityBody");
  if (!body) return;
  const res = await authFetch(`${API}/activity/logs`);
  if (!res.ok) {
    body.innerHTML = `<tr><td colspan="6" class="empty">Failed to load activity logs</td></tr>`;
    return;
  }
  const rows = await res.json();
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No activity yet</td></tr>`;
    return;
  }
  const filter = (document.getElementById("activityFilter")?.value || "all").toLowerCase();
  const filteredRows = (rows || []).filter((r) => matchesActivityFilter(r, filter));
  if (!filteredRows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No activity for selected filter</td></tr>`;
    return;
  }

  filteredRows.forEach((r) => {
    const tr = document.createElement("tr");
    const created = formatDateTime(r.created_at);
    const status = r.undone ? `Undone ${formatDateTime(r.undone_at || "")}` : "Active";
    tr.innerHTML = `
      <td>${created}</td>
      <td>${r.action_type || "-"}</td>
      <td>${r.description || "-"}</td>
      <td>${r.created_by || "-"}</td>
      <td>${status}</td>
      <td>${r.undoable ? `<button class="btn" onclick="undoActivity(${r.activity_id})">Undo</button>` : "-"}</td>
    `;
    body.appendChild(tr);
  });
}

function matchesActivityFilter(row, filter) {
  if (filter === "all") return true;
  const action = String(row?.action_type || "").toLowerCase();
  if (filter === "attendance") {
    return action.includes("attendance");
  }
  if (filter === "fees") {
    return action.includes("fee");
  }
  if (filter === "admissions") {
    return action.includes("admission");
  }
  if (filter === "content") {
    return action.includes("announcement") || action.includes("notification") || action.includes("timetable") || action.includes("interview");
  }
  return true;
}

async function undoActivity(activityId) {
  if (!confirm("Undo this action?")) return;
  const res = await authFetch(`${API}/activity/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activity_id: activityId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Undo failed.");
    return;
  }
  await Promise.all([
    loadActivityLogs(),
    loadStudents(),
    window.loadRecentAttendance?.(),
    loadFeeSummary(),
    loadReports(),
  ]);
  alert("Undo successful.");
}

async function addNotification() {
  const payload = {
    title: value("ntTitle"),
    message: value("ntMessage"),
    target_user: value("ntTarget") || null,
    level: "info",
  };
  if (!payload.title || !payload.message) {
    alert("Title and message are required.");
    return;
  }
  const res = await authFetch(`${API}/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert("Failed to create notification.");
    return;
  }
  clearInputs(["ntTitle", "ntMessage", "ntTarget"]);
  loadNotifications();
}

function renderSimpleList(id, items, emptyText) {
  const list = document.getElementById(id);
  if (!list) return;
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<li class="student-item"><strong>${emptyText}</strong></li>`;
    return;
  }
  items.forEach(text => {
    const li = document.createElement("li");
    li.className = "student-item";
    li.textContent = text;
    list.appendChild(li);
  });
}

function value(id) {
  return (document.getElementById(id)?.value || "").trim();
}

async function loadTestAttempts(testId, testTitle) {
  const body = document.getElementById("testAttemptsBody");
  const title = document.getElementById("testReviewTitle");
  if (!body) return;
  if (!testId) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No attempts to review</td></tr>`;
    if (title) title.textContent = "Select a test";
    return;
  }
  const res = await authFetch(`${API}/tests/${testId}/attempts`);
  if (!res.ok) {
    body.innerHTML = `<tr><td colspan="6" class="empty">Failed to load attempts</td></tr>`;
    return;
  }
  const rows = await res.json();
  if (title) title.textContent = `${testTitle || "Test"} (#${testId})`;
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No attempts to review</td></tr>`;
    return;
  }
  rows.forEach((a) => {
    const events = Array.isArray(a.malpractice_events) ? a.malpractice_events : [];
    const timeline = events.length
      ? events.map((e) => `${formatDateTime(e.created_at)} - ${e.event_type}${e.details ? ` (${e.details})` : ""}`).join(" | ")
      : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${a.attempt_id}</td>
      <td>${escapeHtml(a.student_id || "-")}</td>
      <td>${escapeHtml(a.status || "-")}</td>
      <td>${Number(a.score || 0)}/${Number(a.total_points || 0)}</td>
      <td>${Number(a.malpractice_count || 0)} ${a.malpractice_flag ? "(Flagged)" : ""}</td>
      <td>${escapeHtml(timeline)}</td>
    `;
    body.appendChild(tr);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clearInputs(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function generateParentLink() {
  if (!selectedId) {
    alert("Select a student first.");
    return;
  }
  const res = await authFetch(`${API}/parent/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: String(selectedId), days: 30 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to generate parent link.");
    return;
  }
  const data = await res.json();
  const url = `${window.location.origin}/?parent_token=${data.token}`;
  const input = document.getElementById("parentLinkInput");
  if (input) input.value = url;
}

function copyParentLink() {
  const input = document.getElementById("parentLinkInput");
  const value = String(input?.value || "").trim();
  if (!value) {
    alert("Generate a link first.");
    return;
  }
  navigator.clipboard?.writeText(value);
  alert("Parent link copied.");
}

function formatDateTime(value) {
  const s = String(value || "").trim();
  if (!s) return "-";
  const dt = new Date(s.includes("T") ? s : `${s}Z`);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleString("en-IN", { hour12: true });
  }
  return s;
}

function formatDateDDMMYYYY(value) {
  const s = String(value || "").trim();
  if (!s) return "-";
  // yyyy-mm-dd -> dd-mm-yyyy
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}-${m}-${y}`;
  }
  // ddmmyyyy -> dd-mm-yyyy
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 8)}`;
  }
  // already dd-mm-yyyy
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    return s;
  }
  return s;
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function updateAttendancePercentFromRows(rows) {
  let present = 0;
  let total = 0;
  rows.forEach(r => {
    if (!r.attendance_status) return;
    total += 1;
    const status = String(r.attendance_status).toLowerCase();
    if (status === "present" || status === "p") {
      present += 1;
    }
  });
  updateAttendancePercent(present, total);
}

function updateAttendancePercent(present, total) {
  const el = document.getElementById("attendancePercentValue");
  const metricEl = document.getElementById("metricAttendance");
  const pctText = total ? `${Math.round((present / total) * 100)}%` : "--%";
  if (el) el.textContent = pctText;
  if (metricEl) metricEl.textContent = pctText;
}

async function initAuth() {
  if (parentMode) return;
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
  authInfo = await res.json();
  showApp();
  applyRoleUI();
  afterLoginInit();
}

function afterLoginInit() {
  loadStudents();
  window.loadRecentAttendance?.();
  loadFeed();
  loadTimetable();
  loadInterviews();
  loadAnnouncements();
  loadNotifications();
  loadTests();
  loadFeeSummary();
  if (authInfo && authInfo.role === "superuser") {
    loadFeePolicies();
    loadRecentFees();
    loadReports();
  } else {
    loadStudentFeeSummary();
  }
  initAnnouncementNotifier();
  const savedSection = localStorage.getItem("activeSection")
    || (authInfo && authInfo.role === "student" ? "attendance" : "feed");
  switchSection(savedSection);
  if (!document.querySelector("#testQuestionRows .test-question-row")) {
    addTestQuestionRow();
  }
}

async function handleLogin() {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();
  const error = document.getElementById("loginError");
  error.classList.add("hidden");

  if (!user || !pass) {
    error.textContent = "Enter username and password.";
    error.classList.remove("hidden");
    return;
  }

  if (portalMode === "student" && !/^AAI/i.test(user)) {
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

function showApp() {
  document.getElementById("homeRoot")?.classList.add("hidden");
  document.getElementById("loginRoot")?.classList.add("hidden");
  document.getElementById("appRoot")?.classList.remove("hidden");
}

function logout() {
  endAttemptProtection();
  currentAttempt = null;
  currentAttemptQuestions = [];
  malpracticeAutoSubmitted = false;
  localStorage.removeItem(TOKEN_KEY);
  showHome();
}

async function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = options.headers || {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const suppressAutoHome = Boolean(options.suppressAutoHome);
  const autoHandleError = Boolean(options.autoHandleError);
  const errorMessage = options.errorMessage || "Request failed.";
  const reqOptions = { ...options, headers };
  delete reqOptions.suppressAutoHome;
  delete reqOptions.autoHandleError;
  delete reqOptions.errorMessage;
  const res = await fetch(url, reqOptions);
  if (!res.ok && autoHandleError) {
    await handleApiError(res, errorMessage);
  }
  if (res.status === 401) {
    if (!suppressAutoHome) {
      showHome();
    }
  }
  return res;
}

function applyRoleUI() {
  if (!authInfo) return;
  const isStudent = authInfo.role === "student";

  document.querySelectorAll(".nav-item").forEach(btn => {
    const section = btn.dataset.section;
    if (isStudent && (section === "students" || section === "reports" || section === "activity" || section === "admissions")) {
      btn.classList.add("hidden");
    } else {
      btn.classList.remove("hidden");
    }
  });

  const welcomePanel = document.getElementById("studentWelcomePanel");
  const welcomeTitle = document.getElementById("studentWelcomeTitle");
  const staffWelcomePanel = document.getElementById("staffWelcomePanel");
  const staffWelcomeTitle = document.getElementById("staffWelcomeTitle");
  if (welcomePanel && welcomeTitle) {
    if (isStudent) {
      const name = authInfo.first_name || authInfo.user || "Student";
      welcomeTitle.textContent = `Hello ${name}`;
      welcomePanel.classList.remove("hidden");
    } else {
      welcomePanel.classList.add("hidden");
    }
  }
  if (staffWelcomePanel && staffWelcomeTitle) {
    const username = String(authInfo?.user || "").toLowerCase();
    if (!isStudent && username === "praharsh") {
      staffWelcomeTitle.textContent = "Welcome Praharsh Sir!";
      staffWelcomePanel.classList.remove("hidden");
    } else if (!isStudent && username === "nanda") {
      staffWelcomeTitle.textContent = "Welcome Nanda Sir!";
      staffWelcomePanel.classList.remove("hidden");
    } else {
      staffWelcomePanel.classList.add("hidden");
    }
  }

  const takePanel = document.getElementById("takeAttendancePanel");
  if (takePanel) {
    takePanel.classList.toggle("hidden", isStudent);
  }
  const backdatePanel = document.getElementById("backdateAttendancePanel");
  if (backdatePanel) {
    backdatePanel.classList.toggle("hidden", isStudent);
  }

  const adminFees = document.getElementById("adminFeesPanel");
  const studentFees = document.getElementById("studentFeePanel");
  if (adminFees) adminFees.classList.toggle("hidden", isStudent);
  if (studentFees) studentFees.classList.toggle("hidden", !isStudent);
  const addStudentPanel = document.getElementById("addStudentPanel");
  if (addStudentPanel) addStudentPanel.classList.toggle("hidden", isStudent);
  const bulkPanel = document.getElementById("studentBulkPanel");
  if (bulkPanel) bulkPanel.classList.toggle("hidden", isStudent);
  const adminTimetablePanel = document.getElementById("adminTimetablePanel");
  if (adminTimetablePanel) adminTimetablePanel.classList.toggle("hidden", isStudent);
  const adminInterviewPanel = document.getElementById("adminInterviewPanel");
  if (adminInterviewPanel) adminInterviewPanel.classList.toggle("hidden", isStudent);
  const adminAnnouncementPanel = document.getElementById("adminAnnouncementPanel");
  if (adminAnnouncementPanel) adminAnnouncementPanel.classList.toggle("hidden", isStudent);
  const adminNotificationPanel = document.getElementById("adminNotificationPanel");
  if (adminNotificationPanel) adminNotificationPanel.classList.toggle("hidden", isStudent);
  const adminTestsPanel = document.getElementById("adminTestsPanel");
  if (adminTestsPanel) adminTestsPanel.classList.toggle("hidden", isStudent);
  const adminTestsListPanel = document.getElementById("adminTestsListPanel");
  if (adminTestsListPanel) adminTestsListPanel.classList.toggle("hidden", isStudent);
  const testReviewPanel = document.getElementById("testReviewPanel");
  if (testReviewPanel) testReviewPanel.classList.toggle("hidden", isStudent);
  const studentTestsPanel = document.getElementById("studentTestsPanel");
  if (studentTestsPanel) studentTestsPanel.classList.toggle("hidden", !isStudent);
  const adminPasswordPanel = document.getElementById("adminPasswordPanel");
  if (adminPasswordPanel) adminPasswordPanel.classList.toggle("hidden", isStudent);

  const feesTitle = document.getElementById("feesTitle");
  const feesSubtitle = document.getElementById("feesSubtitle");
  const feesRefresh = document.getElementById("feesRefreshBtn");
  const attendanceTitle = document.getElementById("attendanceTitle");
  const attendanceSubtitle = document.getElementById("attendanceSubtitle");
  if (isStudent) {
    if (feesTitle) feesTitle.textContent = "My Fees";
    if (feesSubtitle) feesSubtitle.textContent = "View your remaining balance";
    if (feesRefresh) feesRefresh.classList.add("hidden");
    if (attendanceTitle) attendanceTitle.textContent = "My Attendance";
    if (attendanceSubtitle) attendanceSubtitle.textContent = "Your recent attendance records";
  } else {
    if (feesTitle) feesTitle.textContent = "Fees Overview";
    if (feesSubtitle) feesSubtitle.textContent = "Record fees paid for each student";
    if (feesRefresh) feesRefresh.classList.remove("hidden");
    if (attendanceTitle) attendanceTitle.textContent = "Attendance Overview";
    if (attendanceSubtitle) attendanceSubtitle.textContent = "Date-wise attendance across all students";
  }
}

async function loadStudentFeeSummary() {
  if (!authInfo || authInfo.role !== "student") return;
  const res = await authFetch(`${API}/students/${encodeURIComponent(authInfo.user)}/balance`);
  if (!res.ok) return;
  const data = await res.json();
  studentFeeSummary = data;
  const remaining = Number(data.balance || 0);
  const el = document.getElementById("studentFeeRemaining");
  if (el) {
    el.textContent = formatMoney(remaining);
  }
  setText("studentFeeCourse", data.course || "-");
  setText("studentFeeTotal", formatMoney(data.total));
  setText("studentFeePaid", formatMoney(data.paid));
  setText("studentFeeConcession", formatMoney(data.concession_amount || 0));
  setText("studentFeeDeadline", data.due_date ? formatDateDDMMYYYY(data.due_date) : "-");
  const installmentEl = document.getElementById("studentInstallmentAmount");
  if (installmentEl && !installmentEl.value) {
    installmentEl.value = remaining > 0 ? String(Number(remaining.toFixed(2))) : "";
  }

  const gatewayRes = await authFetch(`${API}/payments/gateway-status`);
  if (gatewayRes.ok) {
    const gateway = await gatewayRes.json();
    razorpayKeyId = gateway.key_id || null;
    const statusEl = document.getElementById("studentGatewayStatus");
    const payBtn = document.getElementById("payNowBtn");
    if (statusEl) {
      statusEl.textContent = gateway.enabled
        ? "Secure payments powered by Razorpay."
        : "Payment gateway is currently unavailable.";
    }
    if (payBtn) {
      payBtn.classList.toggle("hidden", !(gateway.enabled && remaining > 0));
    }
  }
}

async function payNowRazorpay() {
  if (!authInfo || authInfo.role !== "student") return;
  const dueAmount = Number(studentFeeSummary?.balance || 0);
  if (!studentFeeSummary || dueAmount <= 0) {
    alert("No due amount to pay.");
    return;
  }
  if (!razorpayKeyId || typeof Razorpay === "undefined") {
    alert("Razorpay is not available right now.");
    return;
  }
  const installmentEl = document.getElementById("studentInstallmentAmount");
  const requestedInstallment = Number(installmentEl?.value || 0);
  const amountToPay = requestedInstallment > 0 ? requestedInstallment : dueAmount;
  if (amountToPay <= 0) {
    alert("Enter installment amount.");
    return;
  }
  if (amountToPay > dueAmount) {
    alert("Installment amount cannot be more than remaining balance.");
    return;
  }

  const orderRes = await authFetch(`${API}/payments/razorpay/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: authInfo.user, amount_inr: amountToPay })
  });
  if (!orderRes.ok) {
    const err = await orderRes.json().catch(() => ({}));
    alert(err.detail || "Failed to create payment order.");
    return;
  }
  const orderData = await orderRes.json();
  const order = orderData.order || {};

  const options = {
    key: orderData.key_id,
    amount: order.amount,
    currency: order.currency || "INR",
    name: "Arunand's Aviation Institute",
    description: "Fee Payment",
    order_id: order.id,
    prefill: {
      name: authInfo.student_name || authInfo.first_name || "Student",
    },
    notes: order.notes || {},
    handler: async function (response) {
      const verifyRes = await authFetch(`${API}/payments/razorpay/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: authInfo.user,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          amount_paid_inr: (order.amount || 0) / 100
        })
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        alert(err.detail || "Payment verification failed.");
        return;
      }
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (verifyData.invoice) {
        await downloadInvoicePdf(verifyData.invoice);
      }
      alert("Payment successful and recorded.");
      const installmentInput = document.getElementById("studentInstallmentAmount");
      if (installmentInput) installmentInput.value = "";
      await loadStudentFeeSummary();
      await loadFeeSummary();
      await loadRecentFees();
    },
    theme: { color: "#0f5ea9" }
  };

  const rzp = new Razorpay(options);
  rzp.open();
}

async function downloadInvoicePdf(invoice) {
  if (!window.PDFLib) return;
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.06, 0.27, 0.5);
  const muted = rgb(0.15, 0.2, 0.3);
  const dim = rgb(0.3, 0.35, 0.45);
  let logoImage = null;
  let logoWidth = 0;
  let logoHeight = 0;

  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    logoImage = await pdfDoc.embedPng(logoBytes);
    const maxW = 150;
    const scale = maxW / logoImage.width;
    logoWidth = logoImage.width * scale;
    logoHeight = logoImage.height * scale;
  } catch (_) {
    logoImage = null;
    logoWidth = 0;
    logoHeight = 0;
  }

  const drawReceiptPage = (copyLabel) => {
    const page = pdfDoc.addPage([595, 842]);
    page.drawRectangle({
      x: 30,
      y: 30,
      width: 535,
      height: 782,
      borderColor: accent,
      borderWidth: 1.2,
    });

    if (logoImage) {
      page.drawImage(logoImage, {
        x: 42,
        y: 730,
        width: logoWidth,
        height: logoHeight,
      });
    }

    const headerX = 42 + (logoWidth ? logoWidth + 16 : 0);
    page.drawText("Fee Payment Receipt", {
      x: headerX,
      y: 710,
      size: 20,
      font: fontBold,
      color: accent,
    });
    page.drawText(copyLabel, {
      x: headerX,
      y: 690,
      size: 11,
      font,
      color: muted,
    });

    const lines = [
      ["Receipt No", invoice.invoice_no || "-"],
      ["Date", formatDateDDMMYYYY(invoice.date || "")],
      ["Student ID", invoice.student_id || "-"],
      ["Student Name", invoice.student_name || "-"],
      ["Course", invoice.course || "-"],
      ["Payment ID", invoice.payment_id || "-"],
      ["Order ID", invoice.order_id || "-"],
      ["Amount Paid", `INR ${formatMoney(invoice.amount_paid || 0)}`],
      ["Total Fee", `INR ${formatMoney(invoice.amount_total || 0)}`],
      ["Remaining", `INR ${formatMoney(invoice.balance_due || 0)}`],
    ];

    let y = 640;
    for (const [k, v] of lines) {
      page.drawText(`${k}:`, { x: 42, y, size: 12, font: fontBold, color: muted });
      page.drawText(String(v), { x: 180, y, size: 12, font, color: rgb(0.08, 0.08, 0.08) });
      y -= 28;
    }

    page.drawText("Arunand's Aviation Institute", {
      x: 42,
      y: 80,
      size: 11,
      font: fontBold,
      color: accent,
    });
    page.drawText("Thank you for your payment.", {
      x: 42,
      y: 62,
      size: 10,
      font,
      color: dim,
    });

    page.drawText("Authorized Signature", { x: 42, y: 110, size: 10, font: fontBold, color: muted });
    page.drawLine({ start: { x: 42, y: 104 }, end: { x: 220, y: 104 }, thickness: 0.6, color: muted });
    page.drawText("Student Signature", { x: 300, y: 110, size: 10, font: fontBold, color: muted });
    page.drawLine({ start: { x: 300, y: 104 }, end: { x: 553, y: 104 }, thickness: 0.6, color: muted });
  };

  drawReceiptPage("Student Copy");
  drawReceiptPage("Office Copy");

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${invoice.invoice_no || "invoice"}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export {
  handleLogin,
  openPortal,
  showHome,
  showApp,
  logout,
  initAuth,
  applyRoleUI,
  changeOwnPassword,
  adminSetUserPassword,
  toggleSidebar,
  setupTabs,
  setupSidebarNav,
  setupGlobalSearch,
  initSidebarUX,
  registerServiceWorker,
  initOfflineAttendanceSync,
  initInstallPrompt,
  populateBatchInputs,
  authFetch,
  enqueueAttendance,
  updateAttendancePercentFromRows,
  updateAttendancePercent,
  formatDateDDMMYYYY,
  getTodayIso,
  loadProudAlumni,
  showAdmissionForm,
  submitHomeInquiry,
  addAcademicRow,
  submitAdmissionForm,
  loadAdmissions,
  deleteAdmission,
  regenerateAdmissionPdfs,
  openAdmissionPdf,
  generateAdmissionPdfAttachment,
  generateIdCardPdf,
  generateCertificatePdf,
  loadStudents,
  renderStudentList,
  addStudent,
  bulkMoveBatch,
  bulkMarkAlumni,
  bulkDeleteStudents,
  markSingleAlumni,
  deleteSingleStudent,
  selectStudent,
  loadBalance,
  loadAttendance,
  loadFees,
  exportAttendanceCsv,
  renderFeesEntryList,
  loadRecentFees,
  loadFeeSummary,
  loadFeePolicies,
  recordFee,
  resetFeesToUnpaid,
  exportFeesCsv,
  sendFeeReminders,
  payNowRazorpay,
  openFeeInvoicePdf,
  loadStudentFeeSummary,
  loadTests,
  createTest,
  addTestQuestionRow,
  submitCurrentAttempt,
  loadFeed,
  generateParentLink,
  copyParentLink,
  initParentPortal,
  loadTimetable,
  addTimetable,
  loadInterviews,
  addInterview,
  loadAnnouncements,
  addAnnouncement,
  loadNotifications,
  addNotification,
  loadLeads,
  exportLeadsCsv,
  toggleLeadsUpcoming,
  loadReports,
  exportReportsCsv,
  loadActivityLogs,
};

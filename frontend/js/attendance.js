import { API, ATTENDANCE_QUEUE_KEY } from "./config.js";
import { state } from "./state.js";
import { authFetch } from "./api-client.js";
import { ensureStudentsLoaded } from "./students.js";
import {
  getTodayIso,
  formatDateDDMMYYYY,
  downloadCsv
} from "./utils.js";
import { showToast } from "./ui.js";

let attendanceRenderToken = 0;
let todayRenderInFlight = false;
let backRenderInFlight = false;

export function ensureAttendanceDateConstraints() {
  const today = getTodayIso();
  const backDate = document.getElementById("backDate");
  const todayLabel = document.getElementById("todayAttendanceDate");
  if (todayLabel) {
    todayLabel.textContent = formatDateDDMMYYYY(today);
  }
  if (backDate) {
    backDate.max = today;
    if (!backDate.value) {
      backDate.value = today;
    } else if (backDate.value > today) {
      backDate.value = today;
    }
  }
}

export function getRollCallStudents() {
  return state.allStudents.filter((s) => !state.alumniSelectedIds.has(String(s.student_id)));
}

export function renderAttendanceForm(date, opts) {
  const { bodyId, toggleClass, remarkClass, presentId, absentId, emptyMsg } = opts;
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML = "";

  if (!date) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Select a date to load students</td></tr>`;
    updateAttendanceCounts(toggleClass, presentId, absentId);
    return;
  }

  if (date > getTodayIso()) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Future dates are not allowed</td></tr>`;
    updateAttendanceCounts(toggleClass, presentId, absentId);
    return;
  }

  if (!state.allStudents.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">No students found</td></tr>`;
    updateAttendanceCounts(toggleClass, presentId, absentId);
    return;
  }

  const rollCallStudents = getRollCallStudents();
  if (!rollCallStudents.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">${emptyMsg}</td></tr>`;
    updateAttendanceCounts(toggleClass, presentId, absentId);
    return;
  }

  if (body.dataset.toggleClass !== toggleClass) {
    body.addEventListener("change", (e) => {
      const target = e.target;
      if (!target.classList.contains(toggleClass)) return;
      updateAttendanceCounts(toggleClass, presentId, absentId);
    });
    body.dataset.toggleClass = toggleClass;
  }

  const token = ++attendanceRenderToken;
  let idx = 0;
  const chunkSize = 80;
  const renderChunk = () => {
    if (attendanceRenderToken !== token) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < chunkSize && idx < rollCallStudents.length; i += 1, idx += 1) {
      const s = rollCallStudents[idx];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.student_name} (ID: ${s.student_id})</td>
        <td>${s.batch}</td>
        <td>
          <label>
            <input type="checkbox" class="${toggleClass}" data-id="${s.student_id}">
            Present
          </label>
        </td>
        <td>
          <input class="${remarkClass}" data-id="${s.student_id}" placeholder="Remarks (optional)" />
        </td>
      `;
      frag.appendChild(tr);
    }
    body.appendChild(frag);
    if (idx < rollCallStudents.length) {
      requestAnimationFrame(renderChunk);
      return;
    }
    updateAttendanceCounts(toggleClass, presentId, absentId);
  };
  requestAnimationFrame(renderChunk);
}

export async function renderTodayAttendance() {
  if (state.authInfo && state.authInfo.role === "student") return;
  if (todayRenderInFlight) return;
  todayRenderInFlight = true;
  const btn = document.getElementById("loadTodayAttendanceBtn");
  const prevText = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.classList.add("loading");
    btn.textContent = "Loading...";
  }
  ensureAttendanceDateConstraints();
  try {
    if (!state.allStudents.length) {
      await ensureStudentsLoaded({ renderList: false });
    }
    renderAttendanceForm(getTodayIso(), {
      bodyId: "todayAttendanceBody",
      toggleClass: "today-present-toggle",
      remarkClass: "today-remark-input",
      presentId: "todayPresentCount",
      absentId: "todayAbsentCount",
      emptyMsg: "All current students are marked as alumni/selected. No roll call entries.",
    });
  } finally {
    todayRenderInFlight = false;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("loading");
      btn.textContent = prevText || "Load Students";
    }
  }
}

export async function renderBackAttendance() {
  if (state.authInfo && state.authInfo.role === "student") return;
  if (backRenderInFlight) return;
  backRenderInFlight = true;
  const btn = document.getElementById("loadBackAttendanceBtn");
  const prevText = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.classList.add("loading");
    btn.textContent = "Loading...";
  }
  ensureAttendanceDateConstraints();
  const dateInput = document.getElementById("backDate");
  const date = dateInput?.value || "";
  try {
    if (!state.allStudents.length) {
      await ensureStudentsLoaded({ renderList: false });
    }
    renderAttendanceForm(date, {
      bodyId: "backAttendanceBody",
      toggleClass: "back-present-toggle",
      remarkClass: "back-remark-input",
      presentId: "backPresentCount",
      absentId: "backAbsentCount",
      emptyMsg: "All current students are marked as alumni/selected. No roll call entries.",
    });
  } finally {
    backRenderInFlight = false;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("loading");
      btn.textContent = prevText || "Load Date";
    }
  }
}

export function updateAttendanceCounts(toggleClass, presentId, absentId) {
  const toggles = document.querySelectorAll(`.${toggleClass}`);
  let present = 0;
  toggles.forEach((t) => {
    if (t.checked) present += 1;
  });
  const total = toggles.length;
  const p = document.getElementById(presentId);
  const a = document.getElementById(absentId);
  if (p) p.textContent = String(present);
  if (a) a.textContent = String(Math.max(total - present, 0));
}

export async function submitTodayAttendance() {
  await submitAttendanceForDate(getTodayIso(), {
    toggleClass: "today-present-toggle",
    remarkClass: "today-remark-input",
    presentId: "todayPresentCount",
    absentId: "todayAbsentCount",
  });
}

export async function submitBackAttendance() {
  ensureAttendanceDateConstraints();
  const dateInput = document.getElementById("backDate");
  const date = dateInput?.value || "";
  await submitAttendanceForDate(date, {
    toggleClass: "back-present-toggle",
    remarkClass: "back-remark-input",
    presentId: "backPresentCount",
    absentId: "backAbsentCount",
  });
}

async function submitAttendanceForDate(date, opts) {
  if (state.authInfo && state.authInfo.role === "student") return;
  if (!date) {
    alert("Select a date first.");
    return;
  }
  if (date > getTodayIso()) {
    alert("Future dates are not allowed.");
    return;
  }
  if (!state.allStudents.length) {
    alert("No students to mark.");
    return;
  }
  const rollCallStudents = getRollCallStudents();
  if (!rollCallStudents.length) {
    alert("No eligible students in roll call.");
    return;
  }

  const records = rollCallStudents.map((s) => {
    const isPresent = document.querySelector(`.${opts.toggleClass}[data-id="${s.student_id}"]`)?.checked;
    const remarkInput = document.querySelector(`.${opts.remarkClass}[data-id="${s.student_id}"]`);
    const remark = remarkInput?.value || "";
    return {
      student_id: String(s.student_id),
      student_name: s.student_name,
      course: s.course,
      batch: s.batch,
      attendance_status: isPresent ? "P" : "A",
      remarks: remark.trim()
    };
  });

  const payload = { date, records };
  if (!navigator.onLine) {
    enqueueAttendance(payload);
    alert("You're offline. Attendance saved locally and will sync when you're back online.");
    return;
  }

  try {
    const res = await authFetch(`${API}/attendance/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Failed to submit attendance.");
      return;
    }
  } catch (_) {
    enqueueAttendance(payload);
    alert("Network issue. Attendance saved locally and will sync when you're back online.");
    return;
  }

  const viewDate = document.getElementById("attendanceDate");
  if (viewDate) viewDate.value = date;
  await loadAttendanceByDate();
  document.querySelectorAll(`.${opts.toggleClass}`).forEach(cb => { cb.checked = false; });
  document.querySelectorAll(`.${opts.remarkClass}`).forEach(input => { input.value = ""; });
  updateAttendanceCounts(opts.toggleClass, opts.presentId, opts.absentId);
  alert("Attendance recorded.");
}

export async function loadRecentAttendance() {
  const res = await authFetch(`${API}/attendance/recent`);
  const rows = await res.json();
  const body = document.getElementById("recentAttendanceBody");
  if (!body) return;
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">No attendance records</td></tr>`;
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateDDMMYYYY(r.date || "-")}</td>
      <td>${r.student_name || r.student_id}</td>
      <td>${r.attendance_status || "-"}</td>
      <td>${r.remarks || ""}</td>
    `;
    body.appendChild(tr);
  });

  if (state.authInfo && state.authInfo.role === "student") {
    if (window.updateAttendancePercentFromRows) window.updateAttendancePercentFromRows(rows);
  }
}

export async function loadAttendanceByDate() {
  const dateInput = document.getElementById("attendanceDate");
  const date = dateInput?.value;
  if (!date) {
    alert("Select a date first.");
    return;
  }
  const res = await authFetch(`${API}/attendance/by-date?date=${encodeURIComponent(date)}`);
  const rows = await res.json();
  const body = document.getElementById("recentAttendanceBody");
  if (!body) return;
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">No attendance records for ${date}</td></tr>`;
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateDDMMYYYY(r.date || "-")}</td>
      <td>${r.student_name || r.student_id}</td>
      <td>${r.attendance_status || "-"}</td>
      <td>${r.remarks || ""}</td>
    `;
    body.appendChild(tr);
  });

  if (state.authInfo && state.authInfo.role === "student") {
    if (window.updateAttendancePercentFromRows) window.updateAttendancePercentFromRows(rows);
  }
}

export async function loadAttendance(studentId) {
  const res = await authFetch(`${API}/students/${encodeURIComponent(studentId)}/attendance`);
  const rows = await res.json();
  const body = document.getElementById("attendanceBody");
  if (!body) return;
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3" class="empty">No attendance records</td></tr>`;
    if (window.updateAttendancePercent) window.updateAttendancePercent(0, 0);
    return;
  }

  if (window.updateAttendancePercentFromRows) window.updateAttendancePercentFromRows(rows);

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

export async function loadAttendanceCalendar() {
  const monthInput = document.getElementById("attendanceMonth");
  const month = (monthInput?.value || "").trim() || getTodayIso().slice(0, 7);
  if (monthInput && !monthInput.value) monthInput.value = month;
  const res = await authFetch(`${API}/attendance/month?month=${encodeURIComponent(month)}`);
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  renderAttendanceCalendar(month, data);
}

function renderAttendanceCalendar(month, data) {
  const container = document.getElementById("attendanceCalendar");
  if (!container) return;
  container.innerHTML = "";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  dayNames.forEach((name) => {
    const header = document.createElement("div");
    header.className = "calendar-cell";
    header.innerHTML = `<div class="day">${name}</div>`;
    container.appendChild(header);
  });

  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return;
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDay = first.getUTCDay();
  for (let i = 0; i < startDay; i += 1) {
    const pad = document.createElement("div");
    pad.className = "calendar-cell";
    container.appendChild(pad);
  }
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDate = new Map((data?.days || []).map((d) => [String(d.date), d]));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${String(y)}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const item = byDate.get(date);
    const cell = document.createElement("div");
    let cls = "calendar-cell";
    let value = "-";
    if (item) {
      if (data?.mode === "student") {
        value = item.status || "-";
        if (String(item.status || "").toLowerCase() === "present") cls += " present";
        if (String(item.status || "").toLowerCase() === "absent") cls += " absent";
      } else {
        const present = Number(item.present || 0);
        const absent = Number(item.absent || 0);
        value = `P:${present} A:${absent}`;
        if (present > absent) cls += " present";
        else if (absent > present) cls += " absent";
      }
    }
    cell.className = cls;
    cell.innerHTML = `<div class="day">${day}</div><div class="value">${value}</div>`;
    container.appendChild(cell);
  }
}

export async function syncAttendanceFromExcel() {
  const fileInput = document.getElementById("attendanceSyncFile");
  const file = fileInput?.files?.[0];
  let res;
  if (file) {
    const form = new FormData();
    form.append("file", file);
    res = await authFetch(`${API}/attendance/sync/upload`, { method: "POST", body: form });
  } else {
    res = await authFetch(`${API}/attendance/sync`, { method: "POST" });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to sync from Excel.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  await loadRecentAttendance();
  if (fileInput) fileInput.value = "";
  alert(`${data.message || "Sync complete"}. Inserted: ${data.inserted ?? 0}, Skipped: ${data.skipped ?? 0}`);
}

export function exportAttendanceCsv() {
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

function getAttendanceQueue() {
  try {
    const raw = localStorage.getItem(ATTENDANCE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function saveAttendanceQueue(queue) {
  localStorage.setItem(ATTENDANCE_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueAttendance(payload) {
  const queue = getAttendanceQueue();
  queue.push({
    date: payload.date,
    records: payload.records,
    queued_at: new Date().toISOString(),
  });
  saveAttendanceQueue(queue);
  updateOfflineStatus();
}

export function updateOfflineStatus() {
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

export async function flushAttendanceQueue() {
  if (state.attendanceQueueFlushing) return;
  if (!navigator.onLine) return;
  if (!localStorage.getItem("authToken")) return;
  const queue = getAttendanceQueue();
  if (!queue.length) return;
  state.attendanceQueueFlushing = true;
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
  state.attendanceQueueFlushing = false;
  const synced = initialCount - remaining.length;
  if (synced > 0 && remaining.length === 0) {
    showToast(`Attendance synced (${synced} batch${synced > 1 ? "es" : ""}).`, "success");
  }
}

export function initOfflineAttendanceSync() {
  window.addEventListener("online", () => { flushAttendanceQueue(); });
  window.addEventListener("offline", () => { updateOfflineStatus(); });
  flushAttendanceQueue();
  updateOfflineStatus();
}

export function updateAttendancePercentFromRows(rows) {
  let present = 0;
  let total = 0;
  rows.forEach(r => {
    if (!r.attendance_status) return;
    total += 1;
    const status = String(r.attendance_status).toLowerCase();
    if (status === "present" || status === "p") present += 1;
  });
  updateAttendancePercent(present, total);
}

export function updateAttendancePercent(present, total) {
  const el = document.getElementById("attendancePercentValue");
  const metricEl = document.getElementById("metricAttendance");
  const pctText = total ? `${Math.round((present / total) * 100)}%` : "--%";
  if (el) el.textContent = pctText;
  if (metricEl) metricEl.textContent = pctText;
}

import { API, authInfo, allStudents, alumniSelectedIds, authFetch, formatDateDDMMYYYY, getTodayIso, updateAttendancePercentFromRows, updateAttendancePercent, enqueueAttendance } from "./app-core.js?v=20260311b";

function ensureAttendanceDateConstraints() {
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
    }
  }
}

function getRollCallStudents() {
  return allStudents.filter((s) => !alumniSelectedIds.has(String(s.student_id)));
}

function updateAttendanceCounts(toggleClass, presentId, absentId) {
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

function renderAttendanceForm(date, opts) {
  const { bodyId, toggleClass, remarkClass, presentId, absentId, emptyMsg } = opts;
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML = "";

  if (!date) {
    updateAttendanceCounts(toggleClass, presentId, absentId);
    return;
  }

  if (date > getTodayIso()) {
    body.innerHTML = `<tr><td colspan="5" class="empty">Future dates are not allowed</td></tr>`;
    updateAttendanceCounts(toggleClass, presentId, absentId);
    return;
  }

  if (!allStudents.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No students found</td></tr>`;
    updateAttendanceCounts(toggleClass, presentId, absentId);
    return;
  }

  const rollCallStudents = getRollCallStudents();
  if (!rollCallStudents.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">${emptyMsg}</td></tr>`;
    updateAttendanceCounts(toggleClass, presentId, absentId);
    return;
  }

  rollCallStudents.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.student_id}</td>
      <td>${s.student_name}</td>
      <td>${s.course}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" class="${toggleClass}" data-id="${s.student_id}" />
          <span class="slider"></span>
        </label>
      </td>
      <td><input class="${remarkClass}" data-id="${s.student_id}" placeholder="Remarks" /></td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll(`.${toggleClass}`).forEach((cb) => {
    cb.addEventListener("change", () => updateAttendanceCounts(toggleClass, presentId, absentId));
  });
  updateAttendanceCounts(toggleClass, presentId, absentId);
}

function renderTodayAttendance() {
  if (authInfo && authInfo.role === "student") return;
  ensureAttendanceDateConstraints();
  renderAttendanceForm(getTodayIso(), {
    bodyId: "todayAttendanceBody",
    toggleClass: "today-present-toggle",
    remarkClass: "today-remark-input",
    presentId: "todayPresentCount",
    absentId: "todayAbsentCount",
    emptyMsg: "All current students are marked as alumni/selected. No roll call entries.",
  });
}

function renderBackAttendance() {
  if (authInfo && authInfo.role === "student") return;
  ensureAttendanceDateConstraints();
  const date = document.getElementById("backDate")?.value || "";
  renderAttendanceForm(date, {
    bodyId: "backAttendanceBody",
    toggleClass: "back-present-toggle",
    remarkClass: "back-remark-input",
    presentId: "backPresentCount",
    absentId: "backAbsentCount",
    emptyMsg: "All current students are marked as alumni/selected. No roll call entries.",
  });
}

async function submitAttendanceForDate(date, opts) {
  if (authInfo && authInfo.role === "student") {
    return;
  }
  if (!date) {
    alert("Select a date first.");
    return;
  }
  if (date > getTodayIso()) {
    alert("Future dates are not allowed.");
    return;
  }
  if (!allStudents.length) {
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
    const remark = document.querySelector(`.${opts.remarkClass}[data-id="${s.student_id}"]`)?.value || "";
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

  let res;
  try {
    res = await authFetch(`${API}/attendance/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    enqueueAttendance(payload);
    alert("Network issue. Attendance saved locally and will sync when you're back online.");
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to submit attendance.");
    return;
  }

  const viewDate = document.getElementById("attendanceDate");
  if (viewDate) viewDate.value = date;
  await loadAttendanceByDate();
  document.querySelectorAll(`.${opts.toggleClass}`).forEach(cb => {
    cb.checked = false;
  });
  document.querySelectorAll(`.${opts.remarkClass}`).forEach(input => {
    input.value = "";
  });
  updateAttendanceCounts(opts.toggleClass, opts.presentId, opts.absentId);
  alert("Attendance recorded.");
}

async function submitTodayAttendance() {
  await submitAttendanceForDate(getTodayIso(), {
    toggleClass: "today-present-toggle",
    remarkClass: "today-remark-input",
    presentId: "todayPresentCount",
    absentId: "todayAbsentCount",
  });
}

async function submitBackAttendance() {
  ensureAttendanceDateConstraints();
  const date = document.getElementById("backDate")?.value || "";
  await submitAttendanceForDate(date, {
    toggleClass: "back-present-toggle",
    remarkClass: "back-remark-input",
    presentId: "backPresentCount",
    absentId: "backAbsentCount",
  });
}

async function loadRecentAttendance() {
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
      <td>${r.student_name || "-"}</td>
      <td>${r.attendance_status || "-"}</td>
      <td>${r.remarks || ""}</td>
    `;
    body.appendChild(tr);
  });

  if (authInfo && authInfo.role === "student") {
    updateAttendancePercentFromRows(rows);
  }
}

async function loadAttendanceByDate() {
  const date = document.getElementById("attendanceDate")?.value || "";
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
      <td>${r.student_name || "-"}</td>
      <td>${r.attendance_status || "-"}</td>
      <td>${r.remarks || ""}</td>
    `;
    body.appendChild(tr);
  });

  if (authInfo && authInfo.role === "student") {
    updateAttendancePercentFromRows(rows);
  }
}

async function syncAttendanceFromExcel() {
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

async function loadAttendanceCalendar() {
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

export {
  ensureAttendanceDateConstraints,
  renderTodayAttendance,
  renderBackAttendance,
  submitTodayAttendance,
  submitBackAttendance,
  loadRecentAttendance,
  loadAttendanceByDate,
  syncAttendanceFromExcel,
  loadAttendanceCalendar,
  renderAttendanceCalendar,
};



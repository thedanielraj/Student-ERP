const LOCAL_FASTAPI_HOSTS = ["127.0.0.1:8000", "localhost:8000"];
const API = LOCAL_FASTAPI_HOSTS.includes(window.location.host)
  ? window.location.origin
  : `${window.location.origin}/api`;
const TOKEN_KEY = "authToken";

let allStudents = [];
let selectedId = null;
let authInfo = null;
let studentFeeSummary = null;
let razorpayKeyId = null;

async function loadStudents() {
  const res = await authFetch(`${API}/students`);
  allStudents = await res.json();
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

  const filtered = allStudents.filter(s => {
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
    return;
  }

  filtered.forEach(s => {
    const li = document.createElement("li");
    li.className = "student-item";
    if (String(s.student_id) === String(selectedId)) {
      li.classList.add("active");
    }
    li.innerHTML = `
      <div><strong>${s.student_name}</strong></div>
      <div class="student-meta">ID: ${s.student_id} • ${s.course} • ${s.batch}</div>
    `;
    li.addEventListener("click", () => selectStudent(s));
    list.appendChild(li);
  });
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

async function selectStudent(student) {
  selectedId = student.student_id;
  renderStudentList();

  document.getElementById("detailName").textContent = student.student_name;
  document.getElementById("detailMeta").textContent = `ID: ${student.student_id} • ${student.course} • ${student.batch}`;

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
    body.innerHTML = `<tr><td colspan="5" class="empty">No fee entries</td></tr>`;
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
    `;
    body.appendChild(tr);
  });
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
  return number.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

document.getElementById("search").addEventListener("input", renderStudentList);
setupTabs();
setupSidebarNav();
initAuth();

function setupSidebarNav() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      switchSection(btn.dataset.section);
    });
  });
}

function switchSection(target) {
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
    ensureTakeDate();
    renderTakeAttendance();
  }
  if (target === "fees") {
    renderFeesEntryList();
    loadFeeSummary();
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
}

async function loadRecentAttendance() {
  const res = await authFetch(`${API}/attendance/recent`);
  const rows = await res.json();
  const body = document.getElementById("recentAttendanceBody");
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

  if (authInfo && authInfo.role === "student") {
    updateAttendancePercentFromRows(rows);
  }
}

async function loadAttendanceByDate() {
  const date = document.getElementById("attendanceDate").value;
  if (!date) {
    alert("Select a date first.");
    return;
  }
  const res = await authFetch(`${API}/attendance/by-date?date=${encodeURIComponent(date)}`);
  const rows = await res.json();
  const body = document.getElementById("recentAttendanceBody");
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
    body.innerHTML = `<tr><td colspan="7" class="empty">No students found</td></tr>`;
    return;
  }

  allStudents.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.student_name} (ID: ${s.student_id})</td>
      <td>${s.batch}</td>
      <td><input class="fee-input" id="fee-total-${s.student_id}" type="number" min="0" step="0.01" placeholder="Total" /></td>
      <td><input class="fee-input" id="fee-paid-${s.student_id}" type="number" min="0" step="0.01" placeholder="Paid" /></td>
      <td><input id="fee-receipt-${s.student_id}" type="file" /></td>
      <td><input class="fee-input" id="fee-remarks-${s.student_id}" placeholder="Remarks" /></td>
      <td><button class="btn" onclick="recordFee('${s.student_id}')">Record</button></td>
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

function ensureTakeDate() {
  const input = document.getElementById("takeDate");
  if (!input.value) {
    const today = new Date().toISOString().slice(0, 10);
    input.value = today;
  }
}

function renderTakeAttendance() {
  if (authInfo && authInfo.role === "student") {
    return;
  }
  const date = document.getElementById("takeDate").value;
  const body = document.getElementById("takeAttendanceBody");
  body.innerHTML = "";

  if (!date) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Select a date to load students</td></tr>`;
    updateAttendanceCounts();
    return;
  }

  if (!allStudents.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">No students found</td></tr>`;
    updateAttendanceCounts();
    return;
  }

  allStudents.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.student_name} (ID: ${s.student_id})</td>
      <td>${s.batch}</td>
      <td>
        <label>
          <input type="checkbox" class="present-toggle" data-id="${s.student_id}">
          Present
        </label>
      </td>
      <td>
        <input class="remark-input" data-id="${s.student_id}" placeholder="Remarks (optional)" />
      </td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll(".present-toggle").forEach(cb => {
    cb.addEventListener("change", updateAttendanceCounts);
  });
  updateAttendanceCounts();
}

function updateAttendanceCounts() {
  const toggles = document.querySelectorAll(".present-toggle");
  let present = 0;
  toggles.forEach(t => {
    if (t.checked) present += 1;
  });
  const total = toggles.length;
  document.getElementById("presentCount").textContent = present;
  document.getElementById("absentCount").textContent = Math.max(total - present, 0);
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

async function submitAttendance() {
  if (authInfo && authInfo.role === "student") {
    return;
  }
  const date = document.getElementById("takeDate").value;
  if (!date) {
    alert("Select a date first.");
    return;
  }
  if (!allStudents.length) {
    alert("No students to mark.");
    return;
  }

  const records = allStudents.map(s => {
    const isPresent = document.querySelector(`.present-toggle[data-id="${s.student_id}"]`)?.checked;
    const remark = document.querySelector(`.remark-input[data-id="${s.student_id}"]`)?.value || "";
    return {
      student_id: String(s.student_id),
      student_name: s.student_name,
      course: s.course,
      batch: s.batch,
      attendance_status: isPresent ? "P" : "A",
      remarks: remark.trim()
    };
  });

  const res = await authFetch(`${API}/attendance/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, records })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to submit attendance.");
    return;
  }

  const viewDate = document.getElementById("attendanceDate");
  viewDate.value = date;
  await loadAttendanceByDate();
  document.querySelectorAll(".present-toggle").forEach(cb => {
    cb.checked = false;
  });
  document.querySelectorAll(".remark-input").forEach(input => {
    input.value = "";
  });
  updateAttendanceCounts();
  alert("Attendance recorded.");
}

async function initAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    showLogin();
    return;
  }
  const res = await authFetch(`${API}/auth/me`);
  if (!res.ok) {
    showLogin();
    return;
  }
  authInfo = await res.json();
  showApp();
  applyRoleUI();
  afterLoginInit();
}

function afterLoginInit() {
  loadStudents();
  loadRecentAttendance();
  loadFeed();
  loadTimetable();
  loadInterviews();
  loadAnnouncements();
  loadNotifications();
  loadFeeSummary();
  if (authInfo && authInfo.role === "superuser") {
    loadRecentFees();
    loadReports();
  } else {
    loadStudentFeeSummary();
  }
  const savedSection = localStorage.getItem("activeSection") || (authInfo && authInfo.role === "student" ? "attendance" : "students");
  switchSection(savedSection);
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

function showLogin() {
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById("loginRoot").classList.remove("hidden");
  document.getElementById("appRoot").classList.add("hidden");
}

function showApp() {
  document.getElementById("loginRoot").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}

async function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = options.headers || {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    showLogin();
  }
  return res;
}

function applyRoleUI() {
  if (!authInfo) return;
  const isStudent = authInfo.role === "student";

  document.querySelectorAll(".nav-item").forEach(btn => {
    const section = btn.dataset.section;
    if (isStudent && (section === "students" || section === "reports")) {
      btn.classList.add("hidden");
    } else {
      btn.classList.remove("hidden");
    }
  });

  const welcomePanel = document.getElementById("studentWelcomePanel");
  const welcomeTitle = document.getElementById("studentWelcomeTitle");
  if (isStudent && welcomePanel) {
    const name = authInfo.first_name || authInfo.user || "Student";
    welcomeTitle.textContent = `Hello ${name}`;
    welcomePanel.classList.remove("hidden");
  } else if (welcomePanel) {
    welcomePanel.classList.add("hidden");
  }

  const takePanel = document.getElementById("takeAttendancePanel");
  if (takePanel) {
    takePanel.classList.toggle("hidden", isStudent);
  }

  const adminFees = document.getElementById("adminFeesPanel");
  const studentFees = document.getElementById("studentFeePanel");
  if (adminFees) adminFees.classList.toggle("hidden", isStudent);
  if (studentFees) studentFees.classList.toggle("hidden", !isStudent);
  const addStudentPanel = document.getElementById("addStudentPanel");
  if (addStudentPanel) addStudentPanel.classList.toggle("hidden", isStudent);
  const adminTimetablePanel = document.getElementById("adminTimetablePanel");
  if (adminTimetablePanel) adminTimetablePanel.classList.toggle("hidden", isStudent);
  const adminInterviewPanel = document.getElementById("adminInterviewPanel");
  if (adminInterviewPanel) adminInterviewPanel.classList.toggle("hidden", isStudent);
  const adminAnnouncementPanel = document.getElementById("adminAnnouncementPanel");
  if (adminAnnouncementPanel) adminAnnouncementPanel.classList.toggle("hidden", isStudent);
  const adminNotificationPanel = document.getElementById("adminNotificationPanel");
  if (adminNotificationPanel) adminNotificationPanel.classList.toggle("hidden", isStudent);

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
  if (!studentFeeSummary || Number(studentFeeSummary.balance || 0) <= 0) {
    alert("No due amount to pay.");
    return;
  }
  if (!razorpayKeyId || typeof Razorpay === "undefined") {
    alert("Razorpay is not available right now.");
    return;
  }

  const orderRes = await authFetch(`${API}/payments/razorpay/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: authInfo.user })
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
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 30,
    y: 30,
    width: 535,
    height: 782,
    borderColor: rgb(0.06, 0.27, 0.5),
    borderWidth: 1.2,
  });

  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    const logo = await pdfDoc.embedPng(logoBytes);
    const maxW = 150;
    const scale = maxW / logo.width;
    page.drawImage(logo, {
      x: 42,
      y: 730,
      width: logo.width * scale,
      height: logo.height * scale,
    });
  } catch (_) {
    // If logo is unavailable, invoice still downloads.
  }

  page.drawText("Fee Payment Invoice", {
    x: 42,
    y: 700,
    size: 20,
    font: fontBold,
    color: rgb(0.06, 0.27, 0.5),
  });

  const lines = [
    ["Invoice No", invoice.invoice_no || "-"],
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

  let y = 650;
  for (const [k, v] of lines) {
    page.drawText(`${k}:`, { x: 42, y, size: 12, font: fontBold, color: rgb(0.15, 0.2, 0.3) });
    page.drawText(String(v), { x: 180, y, size: 12, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 28;
  }

  page.drawText("Arunand's Aviation Institute", {
    x: 42,
    y: 80,
    size: 11,
    font: fontBold,
    color: rgb(0.06, 0.27, 0.5),
  });
  page.drawText("Thank you for your payment.", {
    x: 42,
    y: 62,
    size: 10,
    font,
    color: rgb(0.3, 0.35, 0.45),
  });

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${invoice.invoice_no || "invoice"}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

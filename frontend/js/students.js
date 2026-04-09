import { API } from "./config.js";
import { state } from "./state.js";
import { authFetch } from "./api-client.js";
import { formatMoney, formatDateDDMMYYYY } from "./utils.js";

let studentsLoadingPromise = null;
let studentRenderToken = 0;

function isAlumni(student) {
  return String(student?.status || "").trim().toLowerCase() === "alumni";
}

function bindStudentListHandlers() {
  const list = document.getElementById("studentList");
  if (!list || list.dataset.bound === "1") return;
  list.dataset.bound = "1";

  list.addEventListener("change", (e) => {
    const target = e.target;
    if (!target.classList.contains("student-select")) return;
    const sid = String(target.dataset.id || "");
    if (!sid) return;
    if (target.checked) state.selectedStudentIds.add(sid);
    else state.selectedStudentIds.delete(sid);
    updateSelectedCount();
  });

  list.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList.contains("student-select")) return;
    if (target.dataset.action === "alumni") {
      markSingleAlumni(String(target.dataset.id || ""));
      return;
    }
    if (target.dataset.action === "delete") {
      deleteSingleStudent(String(target.dataset.id || ""));
      return;
    }
    const li = target.closest("li.student-item");
    if (!li) return;
    const sid = String(li.dataset.id || "");
    if (!sid) return;
    const student = state.studentById.get(sid);
    if (student) selectStudent(student);
  });
}

function renderStudentRow(student) {
  const li = document.createElement("li");
  li.className = "student-item";
  li.dataset.id = String(student.student_id);
  if (String(student.student_id) === String(state.selectedId)) {
    li.classList.add("active");
  }
  const isChecked = state.selectedStudentIds.has(String(student.student_id));
  const dueAmount = Number(student.fee_due);
  const feeLabel = Number.isFinite(dueAmount) ? `INR ${formatMoney(dueAmount)}` : "INR -";
  li.innerHTML = `
      <div class="student-row-top">
        <div class="student-row-main">
          <input type="checkbox" class="student-select" data-id="${student.student_id}" ${isChecked ? "checked" : ""} />
          <div><strong>${student.student_name}</strong></div>
        </div>
        <div class="student-fee-total">Due: ${feeLabel}</div>
      </div>
      <div class="student-meta">ID: ${student.student_id} | ${student.course} | ${student.batch} | ${student.status || "Active"}</div>
      <div class="student-actions">
        <button class="btn" data-action="alumni" data-id="${student.student_id}">Mark Alumni</button>
        <button class="btn" data-action="delete" data-id="${student.student_id}">Delete</button>
      </div>
    `;
  return li;
}

export async function loadStudents(options = {}) {
  const { renderList = true } = options;
  if (studentsLoadingPromise) return studentsLoadingPromise;
  studentsLoadingPromise = (async () => {
    const res = await authFetch(`${API}/students`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ([]));
    state.allStudents = Array.isArray(data) ? data : [];
    state.studentById = new Map(state.allStudents.map((s) => [String(s.student_id), s]));
    const validIds = new Set(state.allStudents.map((s) => String(s.student_id)));
    state.selectedStudentIds = new Set(Array.from(state.selectedStudentIds).filter((id) => validIds.has(id)));
    if (renderList) {
      renderStudentList();
      if (window.updateSideCounts) window.updateSideCounts();
    }
    return state.allStudents;
  })();
  try {
    return await studentsLoadingPromise;
  } finally {
    studentsLoadingPromise = null;
  }
}

export async function ensureStudentsLoaded(options = {}) {
  if (state.allStudents.length) return state.allStudents;
  return loadStudents(options);
}

export function renderStudentList() {
  if (state.authInfo && state.authInfo.role === "student") {
    return;
  }
  const list = document.getElementById("studentList");
  const searchInput = document.getElementById("search");
  const showAlumniToggle = document.getElementById("showAlumniToggle");
  if (!list || !searchInput) return;
  bindStudentListHandlers();
  if (showAlumniToggle && showAlumniToggle.dataset.bound !== "1") {
    showAlumniToggle.dataset.bound = "1";
    showAlumniToggle.addEventListener("change", () => renderStudentList());
  }
  const search = searchInput.value.trim().toLowerCase();
  list.innerHTML = "";

  const filtered = state.allStudents.filter((s) => {
    if (!showAlumniToggle?.checked && isAlumni(s)) {
      return false;
    }
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

  const token = ++studentRenderToken;
  let idx = 0;
  const chunkSize = 60;
  const renderChunk = () => {
    if (studentRenderToken !== token) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < chunkSize && idx < filtered.length; i += 1, idx += 1) {
      frag.appendChild(renderStudentRow(filtered[idx]));
    }
    list.appendChild(frag);
    if (idx < filtered.length) {
      requestAnimationFrame(renderChunk);
      return;
    }
    updateSelectedCount();
  };
  requestAnimationFrame(renderChunk);
}

export function updateSelectedCount() {
  const el = document.getElementById("selectedStudentCount");
  if (el) el.textContent = String(state.selectedStudentIds.size);
}

export async function addStudent() {
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

export async function bulkMoveBatch() {
  const ids = Array.from(state.selectedStudentIds);
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
  state.selectedStudentIds.clear();
  updateSelectedCount();
  await loadStudents();
  alert("Batch updated.");
}

export async function bulkMarkAlumni() {
  const ids = Array.from(state.selectedStudentIds);
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
  const data = await res.json().catch(() => ({}));
  if (Array.isArray(data.missing_ids) && data.missing_ids.length) {
    alert(`Missing student IDs: ${data.missing_ids.join(", ")}`);
  }
  const updated = Number(data.updated || 0);
  if (!updated) {
    alert("No students were marked as alumni.");
  } else if (updated < ids.length) {
    alert(`Marked ${updated} of ${ids.length} selected students as alumni.`);
  }
  state.selectedStudentIds.clear();
  updateSelectedCount();
  await Promise.all([loadStudents(), window.loadProudAlumni ? window.loadProudAlumni() : null]);
  if (updated) {
    alert("Marked as alumni.");
  }
}

export async function bulkDeleteStudents() {
  const ids = Array.from(state.selectedStudentIds);
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
  state.selectedStudentIds.clear();
  updateSelectedCount();
  await Promise.all([loadStudents(), window.loadProudAlumni ? window.loadProudAlumni() : null]);
  alert("Deleted.");
}

export async function markSingleAlumni(studentId) {
  if (!studentId) return;
  const res = await authFetch(`${API}/students/mark-alumni`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_ids: [studentId] }),
    autoHandleError: true,
    errorMessage: "Failed to mark alumni.",
  });
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  if (Array.isArray(data.missing_ids) && data.missing_ids.length) {
    alert(`Missing student IDs: ${data.missing_ids.join(", ")}`);
  }
  const updated = Number(data.updated || 0);
  if (!updated) {
    alert("Student was not marked as alumni.");
  }
  state.selectedStudentIds.delete(studentId);
  await Promise.all([loadStudents(), window.loadProudAlumni ? window.loadProudAlumni() : null]);
}

export async function deleteSingleStudent(studentId) {
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
  state.selectedStudentIds.delete(studentId);
  await Promise.all([loadStudents(), window.loadProudAlumni ? window.loadProudAlumni() : null]);
}

export async function selectStudent(student) {
  state.selectedId = student.student_id;
  renderStudentList();

  const detailName = document.getElementById("detailName");
  const detailMeta = document.getElementById("detailMeta");
  const passwordInput = document.getElementById("studentPasswordInput");
  if (detailName) detailName.textContent = student.student_name;
  if (detailMeta) detailMeta.textContent = `ID: ${student.student_id} | ${student.course} | ${student.batch}`;
  if (passwordInput) passwordInput.value = "Loading...";

  const tasks = [];
  if (window.loadBalance) tasks.push(window.loadBalance(student.student_id));
  if (window.loadAttendance) tasks.push(window.loadAttendance(student.student_id));
  if (window.loadFees) tasks.push(window.loadFees(student.student_id));
  tasks.push(loadStudentPassword(student.student_id));
  await Promise.all(tasks);
}

export async function loadBalance(studentId) {
  const res = await authFetch(`${API}/students/${encodeURIComponent(studentId)}/balance`);
  const data = await res.json();

  const total = document.getElementById("metricTotal");
  const paid = document.getElementById("metricPaid");
  const balance = document.getElementById("metricBalance");
  if (total) total.textContent = formatMoney(data.total);
  if (paid) paid.textContent = formatMoney(data.paid);
  if (balance) balance.textContent = formatMoney(data.balance);
}

export async function loadStudentPassword(studentId) {
  const passwordInput = document.getElementById("studentPasswordInput");
  if (!passwordInput) return;
  if (!state.authInfo || state.authInfo.role === "student") {
    passwordInput.value = "";
    passwordInput.placeholder = "Student password (staff only)";
    return;
  }
  const res = await authFetch(`${API}/students/${encodeURIComponent(studentId)}/password`);
  if (!res.ok) {
    passwordInput.value = "-";
    return;
  }
  const data = await res.json().catch(() => ({}));
  passwordInput.value = String(data.password || "-");
}

export function copyStudentPassword() {
  const passwordInput = document.getElementById("studentPasswordInput");
  if (!passwordInput || !passwordInput.value) {
    alert("No password to copy.");
    return;
  }
  navigator.clipboard?.writeText(passwordInput.value).then(
    () => alert("Password copied."),
    () => alert("Unable to copy password."),
  );
}

export function updateSideCounts() {
  if (state.authInfo && state.authInfo.role === "student") {
    return;
  }
  const studentCount = document.getElementById("studentCount");
  const batchCount = document.getElementById("batchCount");
  if (studentCount) studentCount.textContent = state.allStudents.length;
  const batches = new Set(state.allStudents.map(s => s.batch).filter(Boolean));
  if (batchCount) batchCount.textContent = batches.size;
}

export async function loadStudentPortalLogins() {
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

export async function loadProudAlumni() {
  const homeList = document.getElementById("alumniList");
  const portalList = document.getElementById("portalAlumniList");
  const urls = [`${API}/public/alumni`, "/api/public/alumni", "/public/alumni"];
  const withTs = (url) => `${url}${url.includes("?") ? "&" : "?"}ts=${Date.now()}`;
  try {
    let rows = null;
    for (const url of urls) {
      const res = await fetch(withTs(url), { cache: "no-store" });
      if (!res.ok) continue;
      rows = await res.json();
      break;
    }
    if (!rows) throw new Error("failed");
    state.alumniSelectedIds = new Set((rows || []).map((r) => String(r.student_id || "")));
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

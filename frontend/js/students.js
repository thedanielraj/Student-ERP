import { API } from "./config.js";
import { state } from "./state.js";
import { authFetch } from "./api-client.js";
import { formatMoney } from "./utils.js";

export async function loadStudents() {
  const res = await authFetch(`${API}/students`);
  state.allStudents = await res.json();
  const validIds = new Set(state.allStudents.map((s) => String(s.student_id)));
  state.selectedStudentIds = new Set(Array.from(state.selectedStudentIds).filter((id) => validIds.has(id)));
  renderStudentList();
  if (window.updateSideCounts) window.updateSideCounts();
}

export function renderStudentList() {
  if (state.authInfo && state.authInfo.role === "student") {
    return;
  }
  const list = document.getElementById("studentList");
  const searchInput = document.getElementById("search");
  if (!list || !searchInput) return;
  const search = searchInput.value.trim().toLowerCase();
  list.innerHTML = "";

  const filtered = state.allStudents.filter((s) => {
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
    if (String(s.student_id) === String(state.selectedId)) {
      li.classList.add("active");
    }
    const isChecked = state.selectedStudentIds.has(String(s.student_id));
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
      if (e.target.checked) state.selectedStudentIds.add(sid);
      else state.selectedStudentIds.delete(sid);
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
  state.selectedStudentIds.clear();
  updateSelectedCount();
  await Promise.all([loadStudents(), window.loadProudAlumni ? window.loadProudAlumni() : null]);
  alert("Marked as alumni.");
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
  if (detailName) detailName.textContent = student.student_name;
  if (detailMeta) detailMeta.textContent = `ID: ${student.student_id} | ${student.course} | ${student.batch}`;

  const tasks = [];
  if (window.loadBalance) tasks.push(window.loadBalance(student.student_id));
  if (window.loadAttendance) tasks.push(window.loadAttendance(student.student_id));
  if (window.loadFees) tasks.push(window.loadFees(student.student_id));
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
  try {
    const res = await fetch(`${API}/public/alumni`);
    if (!res.ok) throw new Error("failed");
    const rows = await res.json();
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

import { API } from "./config.js";
import { state } from "./state.js";
import { formatMoney, formatDateDDMMYYYY, setText } from "./utils.js";

export function initParentPortal() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("parent_token");
  if (!token) return;
  state.parentMode = true;
  document.getElementById("homeRoot")?.classList.add("hidden");
  document.getElementById("loginRoot")?.classList.add("hidden");
  document.getElementById("appRoot")?.classList.add("hidden");
  document.getElementById("parentRoot")?.classList.remove("hidden");
  loadParentSummary(token);
}

export async function loadParentSummary(token) {
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

export async function generateParentLink() {
  if (!state.selectedId) {
    alert("Select a student first.");
    return;
  }
  const res = await window.authFetch(`${API}/parent/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: String(state.selectedId), days: 30 }),
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

export function copyParentLink() {
  const input = document.getElementById("parentLinkInput");
  const value = String(input?.value || "").trim();
  if (!value) {
    alert("Generate a link first.");
    return;
  }
  navigator.clipboard?.writeText(value);
  alert("Parent link copied.");
}

import { API } from "./config.js";
import { authFetch } from "./api-client.js";
import { formatDateTime } from "./utils.js";

export async function loadActivityLogs() {
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
  const filterSelect = document.getElementById("activityFilter");
  const filter = (filterSelect?.value || "all").toLowerCase();
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
      <td>${r.undoable ? `<button class="btn" data-undo-id="${r.activity_id}">Undo</button>` : "-"}</td>
    `;
    tr.querySelector('[data-undo-id]')?.addEventListener("click", () => undoActivity(r.activity_id));
    body.appendChild(tr);
  });
}

function matchesActivityFilter(row, filter) {
  if (filter === "all") return true;
  const action = String(row?.action_type || "").toLowerCase();
  if (filter === "attendance") return action.includes("attendance");
  if (filter === "fees") return action.includes("fee");
  if (filter === "admissions") return action.includes("admission");
  if (filter === "content") {
    return action.includes("announcement") || action.includes("notification") || action.includes("timetable") || action.includes("interview");
  }
  return true;
}

export async function undoActivity(activityId) {
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

  const tasks = [];
  if (window.loadActivityLogs) tasks.push(window.loadActivityLogs());
  if (window.loadStudents) tasks.push(window.loadStudents());
  if (window.loadRecentAttendance) tasks.push(window.loadRecentAttendance());
  if (window.loadFeeSummary) tasks.push(window.loadFeeSummary());
  if (window.loadReports) tasks.push(window.loadReports());
  await Promise.all(tasks);

  alert("Undo successful.");
}

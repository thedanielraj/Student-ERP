import { API } from "./config.js";
import { state } from "./state.js";
import { authFetch } from "./api-client.js";
import { handleApiError } from "./errors.js";
import {
  getTodayIso,
  formatDateDDMMYYYY,
  addDaysIso,
  downloadCsv
} from "./utils.js";

export async function submitHomeInquiry() {
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

export async function loadLeads() {
  const body = document.getElementById("leadsBody");
  if (!body) return;
  const res = await authFetch(`${API}/leads`);
  if (!res.ok) {
    body.innerHTML = `<tr><td colspan="12" class="empty">Failed to load leads</td></tr>`;
    return;
  }
  const rows = await res.json();
  state.leadsState.cache = Array.isArray(rows) ? rows : [];
  applyLeadsFilters();
}

export function applyLeadsFilters() {
  const statusSelect = document.getElementById("leadsStatusFilter");
  if (statusSelect) {
    state.leadsState.statusFilter = statusSelect.value || "all";
  }
  const filtered = state.leadsState.cache.filter((r) => {
    const status = String(r.status || "new");
    if (state.leadsState.statusFilter !== "all" && status !== state.leadsState.statusFilter) return false;
    if (state.leadsState.upcomingOnly) {
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
  if (btn) btn.classList.toggle("primary", state.leadsState.upcomingOnly);
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

export function toggleLeadsUpcoming() {
  state.leadsState.upcomingOnly = !state.leadsState.upcomingOnly;
  applyLeadsFilters();
}

export function exportLeadsCsv() {
  const body = document.getElementById("leadsBody");
  if (!body) return;
  const rows = Array.from(body.querySelectorAll("tr"));
  if (!rows.length || rows[0].querySelector(".empty")) {
    alert("No leads to export.");
    return;
  }
  const headers = [
    "ID", "Name", "Phone", "Location", "Qualification", "Age", "Intent", "Preferred Time", "Follow-up Date", "Status", "Submitted",
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
  downloadCsv(headers, data, `leads_${getTodayIso()}.csv`);
}

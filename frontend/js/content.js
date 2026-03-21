import { API } from "./config.js";
import { authFetch } from "./api-client.js";
import { state } from "./state.js";
import {
  formatMoney,
  formatDateDDMMYYYY,
  setText,
  renderSimpleList,
  value,
  clearInputs
} from "./utils.js";
import { showToast } from "./ui.js";

export async function loadFeed() {
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

export async function loadTimetable() {
  const res = await authFetch(`${API}/timetable`);
  if (!res.ok) return;
  const rows = await res.json();
  const body = document.getElementById("timetableBody");
  if (!body) return;
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

export async function loadInterviews() {
  const res = await authFetch(`${API}/interviews`);
  if (!res.ok) return;
  const rows = await res.json();
  const body = document.getElementById("interviewBody");
  if (!body) return;
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

export async function loadAnnouncements() {
  const res = await authFetch(`${API}/announcements`);
  if (!res.ok) return;
  const rows = await res.json();
  renderSimpleList("announcementList", rows.map(a => `${a.title} • ${a.message}`), "No announcements");
}

export async function addAnnouncement() {
  if (!state.authInfo || state.authInfo.role === "student") {
    showToast("Only staff can post announcements.");
    return;
  }
  const title = value("anTitle");
  const message = value("anMessage");
  if (!title || !message) {
    showToast("Title and message are required.");
    return;
  }
  const res = await authFetch(`${API}/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showToast(err.detail || "Failed to post announcement.");
    return;
  }
  clearInputs(["anTitle", "anMessage"]);
  await Promise.all([loadAnnouncements(), window.loadFeed ? window.loadFeed() : null]);
  showToast("Announcement posted.", "success");
}

export async function loadNotifications() {
  const res = await authFetch(`${API}/notifications`);
  if (!res.ok) return;
  const rows = await res.json();
  const list = document.getElementById("notificationList");
  if (!list) return;
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

export async function addNotification() {
  if (!state.authInfo || state.authInfo.role === "student") {
    showToast("Only staff can send notifications.");
    return;
  }
  const title = value("ntTitle");
  const message = value("ntMessage");
  const targetUserRaw = value("ntTarget");
  if (!title || !message) {
    showToast("Title and message are required.");
    return;
  }
  const payload = {
    title,
    message,
    level: "info",
    target_user: targetUserRaw || null,
  };
  const res = await authFetch(`${API}/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showToast(err.detail || "Failed to send notification.");
    return;
  }
  clearInputs(["ntTitle", "ntMessage", "ntTarget"]);
  await Promise.all([loadNotifications(), window.loadFeed ? window.loadFeed() : null]);
  showToast("Notification sent.", "success");
}

export async function initAnnouncementNotifier() {
  if (state.announcementPollTimer) {
    clearInterval(state.announcementPollTimer);
    state.announcementPollTimer = null;
  }
  state.announcementsNotifierBootstrapped = false;

  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (_) {
      return;
    }
  }
  await checkForAnnouncementPush();
  state.announcementPollTimer = setInterval(checkForAnnouncementPush, 30000);
}

async function checkForAnnouncementPush() {
  const token = localStorage.getItem("authToken");
  if (!token) return;
  const res = await authFetch(`${API}/announcements?limit=10`);
  if (!res.ok) return;
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return;
  const sorted = [...rows].sort((a, b) => Number(a.announcement_id || 0) - Number(b.announcement_id || 0));

  if (!state.announcementsNotifierBootstrapped) {
    state.latestAnnouncementIdSeen = Math.max(state.latestAnnouncementIdSeen, Number(sorted[sorted.length - 1].announcement_id || 0));
    localStorage.setItem("latestAnnouncementIdSeen", String(state.latestAnnouncementIdSeen));
    state.announcementsNotifierBootstrapped = true;
    return;
  }
  const newItems = sorted.filter((a) => Number(a.announcement_id || 0) > state.latestAnnouncementIdSeen);
  if (!newItems.length) return;
  state.latestAnnouncementIdSeen = Math.max(...newItems.map((a) => Number(a.announcement_id || 0)), state.latestAnnouncementIdSeen);
  localStorage.setItem("latestAnnouncementIdSeen", String(state.latestAnnouncementIdSeen));
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

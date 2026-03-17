import { API } from "./config.js";
import { state } from "./state.js";
import { authFetch } from "./api-client.js";
import { escapeHtml, value, formatDateTime } from "./utils.js";

export function addTestQuestionRow(data = {}) {
  const container = document.getElementById("testQuestionRows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "test-question-row";
  row.innerHTML = `
    <div class="test-question-header">
      <strong>Question</strong>
      <button type="button" class="btn" data-action="remove">Remove</button>
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
  row.querySelector('[data-action="remove"]')?.addEventListener("click", () => row.remove());
  container.appendChild(row);
}

export async function createTest() {
  if (!state.authInfo || state.authInfo.role !== "superuser") return;
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

  // Reset form
  ["testTitle", "testDescription", "testDuration", "testAssignedStudents"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = (id === "testDuration" ? "30" : "");
  });
  const rows = document.getElementById("testQuestionRows");
  if (rows) rows.innerHTML = "";
  addTestQuestionRow();
  await Promise.all([loadTests(), window.loadActivityLogs ? window.loadActivityLogs() : null]);
  alert("Test created.");
}

export async function loadTests() {
  const res = await authFetch(`${API}/tests`);
  if (!res.ok) return;
  const data = await res.json();
  if (state.authInfo && state.authInfo.role === "superuser") {
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
      tr.querySelector('[data-review-test-id]')?.addEventListener("click", () => {
        loadTestAttempts(Number(t.test_id), t.title || "");
      });
      body.appendChild(tr);
    });
    if (data[0]) await loadTestAttempts(Number(data[0].test_id || 0), data[0].title || "");
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
    tr.querySelector('button[data-test-id]')?.addEventListener("click", () => startTestAttempt(Number(t.test_id)));
    body.appendChild(tr);
  });
}

export async function startTestAttempt(testId) {
  const startRes = await authFetch(`${API}/tests/${testId}/start`, { method: "POST" });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    alert(err.detail || "Unable to start test.");
    return;
  }
  const attempt = await startRes.json();
  state.malpracticeAutoSubmitted = false;
  state.currentAttempt = attempt;
  state.currentAttemptQuestions = Array.isArray(attempt.questions) ? attempt.questions : [];

  const title = document.getElementById("attemptTestTitle");
  if (title) title.textContent = attempt.title || "Test Attempt";

  renderAttemptQuestions(state.currentAttemptQuestions, attempt.answers || {});
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

export async function submitCurrentAttempt() {
  if (!state.currentAttempt || !state.currentAttempt.attempt_id) return;
  const answers = state.currentAttemptQuestions.map((q) => {
    const selected = document.querySelector(`input[name="attempt-q-${q.question_id}"]:checked`);
    return {
      question_id: q.question_id,
      answer: selected ? selected.value : "",
    };
  });

  const res = await authFetch(`${API}/tests/attempts/${state.currentAttempt.attempt_id}/submit`, {
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
  state.currentAttempt = null;
  state.currentAttemptQuestions = [];
  state.malpracticeAutoSubmitted = false;
  document.getElementById("testAttemptPanel")?.classList.add("hidden");
  await loadTests();
}

function startAttemptTimer() {
  if (!state.currentAttempt) return;
  if (state.currentAttemptTimer) clearInterval(state.currentAttemptTimer);
  const endTs = Number(state.currentAttempt.ends_at_epoch || 0) * 1000;
  const timerEl = document.getElementById("attemptTimer");
  const tick = async () => {
    const leftMs = endTs - Date.now();
    if (leftMs <= 0) {
      clearInterval(state.currentAttemptTimer);
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
  state.currentAttemptTimer = setInterval(tick, 1000);
}

async function reportMalpractice(eventType, details) {
  if (!state.currentAttempt || !state.currentAttempt.attempt_id) return;
  const res = await authFetch(`${API}/tests/attempts/${state.currentAttempt.attempt_id}/malpractice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType, details }),
  });
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  if (!state.malpracticeAutoSubmitted && Number(data.malpractice_count || 0) >= 1) {
    state.malpracticeAutoSubmitted = true;
    alert("Malpractice recorded. Test will be auto-submitted.");
    await submitCurrentAttempt();
  }
}

export function enableAttemptProtection() {
  const handler = async (e) => {
    if (!state.currentAttempt) return;
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
    if (!state.currentAttempt) return;
    e.preventDefault();
    await reportMalpractice("context_menu", "Right click blocked");
  };
  const copyHandler = async (e) => {
    if (!state.currentAttempt) return;
    e.preventDefault();
    await reportMalpractice("copy_paste", "Copy/Cut/Paste blocked");
  };
  const visibilityHandler = async () => {
    if (!state.currentAttempt) return;
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

export function endAttemptProtection() {
  if (state.currentAttemptTimer) clearInterval(state.currentAttemptTimer);
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

export async function loadTestAttempts(testId, testTitle) {
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

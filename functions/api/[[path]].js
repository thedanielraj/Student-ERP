const COURSE_FEES_INR = {
  "ground operations": 150000,
  "cabin crew": 250000,
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/^\/api\/?/, "");

  if (method === "OPTIONS") {
    return json({ ok: true });
  }

  try {
    if (path === "login" && method === "POST") {
      return handleLogin(request, env);
    }
    if (path === "auth/me" && method === "GET") {
      const session = await requireAuth(request, env);
      return json(await authMe(session.user_id, env));
    }
    if (path === "payments/gateway-status" && method === "GET") {
      await requireAuth(request, env);
      return json({
        enabled: !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
        provider: "razorpay",
        message: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? "Razorpay ready" : "Razorpay keys not configured.",
        key_id: env.RAZORPAY_KEY_ID || null,
      });
    }

    const session = await requireAuth(request, env);

    if (path === "students" && method === "GET") return listStudents(session, env);
    if (path === "students" && method === "POST") return addStudent(url, session, env);

    if (path.startsWith("students/") && path.endsWith("/balance") && method === "GET") {
      const studentId = path.split("/")[1];
      return studentBalance(studentId, session, env);
    }
    if (path.startsWith("students/") && path.endsWith("/attendance") && method === "GET") {
      const studentId = path.split("/")[1];
      return studentAttendance(studentId, session, env);
    }
    if (path.startsWith("students/") && path.endsWith("/fees") && method === "GET") {
      const studentId = path.split("/")[1];
      return studentFees(studentId, session, env);
    }

    if (path === "attendance/recent" && method === "GET") return attendanceRecent(session, env);
    if (path === "attendance/by-date" && method === "GET") return attendanceByDate(url, session, env);
    if (path === "attendance/record" && method === "POST") return attendanceRecord(request, session, env);
    if (path === "attendance/sync" && method === "POST") return json({ detail: "Use /attendance/sync/upload with a CSV file." }, 400);
    if (path === "attendance/sync/upload" && method === "POST") return attendanceSyncUpload(request, session, env);

    if (path === "fees/recent" && method === "GET") return feesRecent(session, env);
    if (path === "fees/summary" && method === "GET") return feesSummary(session, env);
    if (path === "fees/record" && method === "POST") return feesRecord(request, session, env);

    if (path === "payments/razorpay/order" && method === "POST") return razorpayOrder(request, session, env);
    if (path === "payments/razorpay/verify" && method === "POST") return razorpayVerify(request, session, env);

    if (path === "reports/summary" && method === "GET") return reportsSummary(session, env);
    if (path === "feed" && method === "GET") return feed(session, env);

    if (path === "timetable" && method === "GET") return timetableList(session, env);
    if (path === "timetable" && method === "POST") return timetableCreate(request, session, env);

    if (path === "interviews" && method === "GET") return interviewsList(session, env);
    if (path === "interviews" && method === "POST") return interviewsCreate(request, session, env);

    if (path === "announcements" && method === "GET") return announcementsList(env);
    if (path === "announcements" && method === "POST") return announcementsCreate(request, session, env);

    if (path === "notifications" && method === "GET") return notificationsList(session, env);
    if (path === "notifications" && method === "POST") return notificationsCreate(request, session, env);
    if (/^notifications\/\d+\/read$/.test(path) && method === "POST") {
      const id = Number(path.split("/")[1]);
      return notificationsRead(id, session, env);
    }

    return json({ detail: "Not found" }, 404);
  } catch (e) {
    if (e && e.status) return json({ detail: e.message || "Error" }, e.status);
    return json({ detail: String(e) }, 500);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isSuperuser(session) {
  return session.user_id === "superuser";
}

function ensureSelfOrSuperuser(session, studentId) {
  if (!isSuperuser(session) && session.user_id !== studentId) {
    throw httpError(403, "Forbidden");
  }
}

function random8Digits() {
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 10);
  return s;
}

async function ensureCredentials(env) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO credentials (username, password, role) VALUES ('superuser', 'qwerty', 'superuser')"
  ).run();
  const students = await env.DB.prepare("SELECT student_id FROM students").all();
  for (const row of students.results || []) {
    if (/\d/.test(String(row.student_id))) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO credentials (username, password, role) VALUES (?, ?, 'student')"
      ).bind(row.student_id, random8Digits()).run();
    }
  }
}

async function requireAuth(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw httpError(401, "Unauthorized");
  const token = auth.slice("Bearer ".length).trim();
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "SELECT token, user_id, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!row || row.expires_at <= now) throw httpError(401, "Session expired");
  const timeout = Number(env.SESSION_TIMEOUT_SECONDS || "300");
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?")
    .bind(now + timeout, token).run();
  return { token, user_id: row.user_id };
}

async function handleLogin(request, env) {
  await ensureCredentials(env);
  const body = await request.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();
  const cred = await env.DB.prepare(
    "SELECT username FROM credentials WHERE username = ? AND password = ?"
  ).bind(username, password).first();
  if (!cred) throw httpError(401, "Invalid credentials");
  const token = crypto.randomUUID().replace(/-/g, "");
  const now = Math.floor(Date.now() / 1000);
  const timeout = Number(env.SESSION_TIMEOUT_SECONDS || "300");
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(token, username, now + timeout).run();
  return json({ status: "ok", token });
}

async function authMe(userId, env) {
  if (userId === "superuser") return { status: "ok", user: "superuser", role: "superuser" };
  const s = await env.DB.prepare(
    "SELECT student_name, course, batch FROM students WHERE student_id = ?"
  ).bind(userId).first();
  return {
    status: "ok",
    user: userId,
    role: "student",
    student_name: s?.student_name || "",
    first_name: s?.student_name ? String(s.student_name).trim().split(" ")[0] : "",
    course: s?.course || "",
    batch: s?.batch || "",
  };
}

async function studentFinancials(env, studentId) {
  const student = await env.DB.prepare(
    "SELECT student_id, student_name, course, batch FROM students WHERE student_id = ?"
  ).bind(studentId).first();
  if (!student) return null;
  const fee = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount_paid),0) AS paid, COALESCE(MAX(amount_total),0) AS max_total, COUNT(*) AS transactions FROM fees WHERE student_id = ?"
  ).bind(studentId).first();
  const planned = COURSE_FEES_INR[String(student.course || "").toLowerCase()];
  const total = Number(planned ?? fee.max_total ?? 0);
  const paid = Number(fee.paid || 0);
  const due = Math.max(total - paid, 0);
  return { student, total, paid, due, transactions: Number(fee.transactions || 0) };
}

async function listStudents(session, env) {
  let rows;
  if (isSuperuser(session)) {
    rows = await env.DB.prepare("SELECT * FROM students ORDER BY student_id DESC").all();
  } else {
    rows = await env.DB.prepare("SELECT * FROM students WHERE student_id = ? ORDER BY student_id DESC").bind(session.user_id).all();
  }
  return json(rows.results || []);
}

async function addStudent(url, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const studentName = url.searchParams.get("student_name") || "";
  const course = url.searchParams.get("course") || "";
  const batch = url.searchParams.get("batch") || "";
  if (!studentName || !course || !batch) throw httpError(400, "Missing required fields");
  const sid = "AAI" + Math.floor(100 + Math.random() * 900);
  await env.DB.prepare(
    "INSERT INTO students (student_id, student_name, course, batch) VALUES (?, ?, ?, ?)"
  ).bind(sid, studentName, course, batch).run();
  await ensureCredentials(env);
  return json({ status: "ok", message: "Student added", student_id: sid });
}

async function studentBalance(studentId, session, env) {
  ensureSelfOrSuperuser(session, studentId);
  const info = await studentFinancials(env, studentId);
  if (!info) throw httpError(404, "Student not found");
  return json({
    student_id: studentId,
    student_name: info.student.student_name,
    course: info.student.course,
    total: info.total,
    paid: info.paid,
    balance: info.due,
    gst_percent: 18,
  });
}

async function studentAttendance(studentId, session, env) {
  ensureSelfOrSuperuser(session, studentId);
  const rows = await env.DB.prepare(
    "SELECT date, attendance_status, remarks FROM attendance WHERE student_id = ? ORDER BY date DESC"
  ).bind(studentId).all();
  return json(rows.results || []);
}

async function studentFees(studentId, session, env) {
  ensureSelfOrSuperuser(session, studentId);
  const rows = await env.DB.prepare(
    "SELECT fee_id, amount_total, amount_paid, due_date, remarks FROM fees WHERE student_id = ? ORDER BY fee_id DESC"
  ).bind(studentId).all();
  return json(rows.results || []);
}

async function attendanceRecent(session, env) {
  let rows;
  if (isSuperuser(session)) {
    rows = await env.DB.prepare("SELECT student_id, student_name, date, attendance_status, remarks FROM attendance ORDER BY date DESC LIMIT 20").all();
  } else {
    rows = await env.DB.prepare("SELECT student_id, student_name, date, attendance_status, remarks FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 20").bind(session.user_id).all();
  }
  return json(rows.results || []);
}

async function attendanceByDate(url, session, env) {
  const date = url.searchParams.get("date") || "";
  if (!date) throw httpError(400, "date is required");
  let rows;
  if (isSuperuser(session)) {
    rows = await env.DB.prepare("SELECT student_id, student_name, date, attendance_status, remarks FROM attendance WHERE date = ? ORDER BY student_name ASC").bind(date).all();
  } else {
    rows = await env.DB.prepare("SELECT student_id, student_name, date, attendance_status, remarks FROM attendance WHERE date = ? AND student_id = ? ORDER BY student_name ASC").bind(date, session.user_id).all();
  }
  return json(rows.results || []);
}

async function attendanceRecord(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const body = await request.json();
  const date = String(body.date || "").trim();
  const records = Array.isArray(body.records) ? body.records : [];
  if (!date || !records.length) throw httpError(400, "Invalid payload");
  const stmt = env.DB.prepare(
    "INSERT OR IGNORE INTO attendance (student_id, student_name, course, batch, date, attendance_status, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const r of records) {
    const normalizedStatus = normalizeAttendanceStatus(String(r.attendance_status || "A"));
    await stmt.bind(
      String(r.student_id || ""),
      String(r.student_name || ""),
      String(r.course || ""),
      String(r.batch || ""),
      date,
      normalizedStatus,
      String(r.remarks || "")
    ).run();
  }
  return json({ status: "ok", message: "Attendance recorded", count: records.length });
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((v) => v.trim());
}

function normalizeDateToIso(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return `${y}-${m}-${d}`;
  }
  if (/^\d{8}$/.test(s)) {
    const d = s.slice(0, 2);
    const m = s.slice(2, 4);
    const y = s.slice(4, 8);
    return `${y}-${m}-${d}`;
  }
  return s;
}

function normalizeAttendanceStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "p" || s === "present") return "Present";
  if (s === "a" || s === "absent") return "Absent";
  return s ? (s[0].toUpperCase() + s.slice(1)) : "Absent";
}

async function attendanceSyncUpload(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !("name" in file)) {
    throw httpError(400, "file is required");
  }

  const fileName = String(file.name || "attendance.csv");
  const ext = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  const key = `attendance-sources/${Date.now()}_${safeName}`;
  if (env.ERP_FILES) {
    await env.ERP_FILES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
  }

  if (ext !== "csv") {
    return json({
      status: "uploaded_only",
      source_key: key,
      message: "File uploaded to R2. Please upload CSV for automatic parsing.",
      supported_parse_format: "csv",
    });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw httpError(400, "CSV has no data rows");

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);
  const required = ["student_id", "student_name", "course", "batch", "date", "attendance_status"];
  const missing = required.filter((c) => idx(c) === -1);
  if (missing.length) throw httpError(400, `Missing CSV columns: ${missing.join(", ")}`);
  const remarksIdx = idx("remarks");

  await env.DB.prepare("DELETE FROM attendance").run();

  let inserted = 0;
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const studentId = String(cells[idx("student_id")] || "").trim();
    const studentName = String(cells[idx("student_name")] || "").trim();
    const course = String(cells[idx("course")] || "").trim();
    const batch = String(cells[idx("batch")] || "").trim();
    const date = normalizeDateToIso(cells[idx("date")]);
    const attendanceStatus = normalizeAttendanceStatus(cells[idx("attendance_status")]);
    const remarks = remarksIdx >= 0 ? String(cells[remarksIdx] || "").trim() : "";
    if (!studentId || !date || !attendanceStatus) {
      skipped++;
      continue;
    }

    await env.DB.prepare(
      "INSERT OR IGNORE INTO students (student_id, student_name, course, batch) VALUES (?, ?, ?, ?)"
    ).bind(studentId, studentName, course, batch).run();

    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO attendance (student_id, student_name, course, batch, date, attendance_status, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(studentId, studentName, course, batch, date, attendanceStatus, remarks).run();

    if (result.success && Number(result.meta?.changes || 0) > 0) inserted++;
    else skipped++;
  }

  return json({
    status: "ok",
    source_key: key,
    inserted,
    skipped,
    message: "Attendance synced from uploaded CSV",
  });
}

async function feesRecent(session, env) {
  let rows;
  if (isSuperuser(session)) {
    rows = await env.DB.prepare("SELECT fee_id, student_id, amount_total, amount_paid, due_date, remarks FROM fees ORDER BY fee_id DESC LIMIT 20").all();
  } else {
    rows = await env.DB.prepare("SELECT fee_id, student_id, amount_total, amount_paid, due_date, remarks FROM fees WHERE student_id = ? ORDER BY fee_id DESC LIMIT 20").bind(session.user_id).all();
  }
  return json(rows.results || []);
}

async function feesSummary(session, env) {
  if (isSuperuser(session)) {
    const row = await env.DB.prepare("SELECT COALESCE(SUM(amount_total),0) AS total, COALESCE(SUM(amount_paid),0) AS paid, COUNT(*) AS transactions FROM fees").first();
    const total = Number(row.total || 0);
    const paid = Number(row.paid || 0);
    return json({ total, paid, due: total - paid, transactions: Number(row.transactions || 0) });
  }
  const info = await studentFinancials(env, session.user_id);
  if (!info) return json({ total: 0, paid: 0, due: 0, transactions: 0 });
  return json({
    total: info.total,
    paid: info.paid,
    due: info.due,
    transactions: info.transactions,
    course: info.student.course,
    gst_percent: 18,
  });
}

async function feesRecord(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const form = await request.formData();
  const studentId = String(form.get("student_id") || "");
  const amountPaid = Number(form.get("amount_paid") || 0);
  const amountTotal = Number(form.get("amount_total") || amountPaid);
  const dueDate = String(form.get("due_date") || "");
  const remarks = String(form.get("remarks") || "");
  if (!studentId || amountPaid <= 0) throw httpError(400, "Invalid fee payload");
  let receiptPath = null;
  const receipt = form.get("receipt");
  if (receipt && typeof receipt === "object" && "arrayBuffer" in receipt && env.ERP_FILES) {
    const ext = String(receipt.name || "bin").split(".").pop();
    const key = `receipts/${studentId}_${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
    await env.ERP_FILES.put(key, await receipt.arrayBuffer(), {
      httpMetadata: { contentType: receipt.type || "application/octet-stream" },
    });
    receiptPath = key;
  }
  await env.DB.prepare(
    "INSERT INTO fees (student_id, amount_total, amount_paid, due_date, remarks, receipt_path) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(studentId, amountTotal, amountPaid, dueDate || null, remarks, receiptPath).run();
  return json({ status: "ok", message: "Fee recorded" });
}

async function reportsSummary(session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const students = await env.DB.prepare("SELECT COUNT(*) AS c FROM students").first();
  const fees = await env.DB.prepare("SELECT COALESCE(SUM(amount_total),0) AS total, COALESCE(SUM(amount_paid),0) AS paid FROM fees").first();
  const attendance = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN lower(attendance_status) IN ('present','p') THEN 1 ELSE 0 END),0) AS present, COALESCE(SUM(CASE WHEN lower(attendance_status) IN ('absent','a') THEN 1 ELSE 0 END),0) AS absent FROM attendance").first();
  const total = Number(fees.total || 0);
  const paid = Number(fees.paid || 0);
  return json({
    students: Number(students.c || 0),
    fees_total: total,
    fees_paid: paid,
    fees_balance: total - paid,
    attendance_present: Number(attendance.present || 0),
    attendance_absent: Number(attendance.absent || 0),
  });
}

async function feed(session, env) {
  const summary = await feesSummary(session, env).then(r => r.json());
  const announcements = await env.DB.prepare("SELECT announcement_id, title, message, created_at FROM announcements ORDER BY announcement_id DESC LIMIT 5").all();
  const notifications = await env.DB.prepare("SELECT notification_id, title, message, level, created_at FROM notifications WHERE target_user IS NULL OR target_user = ? ORDER BY notification_id DESC LIMIT 5").bind(session.user_id).all();
  const interviews = await interviewsList(session, env).then(r => r.json());
  return json({
    fees: { total: summary.total || 0, due: summary.due || 0, transactions: summary.transactions || 0 },
    announcements: announcements.results || [],
    notifications: notifications.results || [],
    interviews: (interviews || []).slice(0, 5),
  });
}

async function timetableList(session, env) {
  let rows;
  if (isSuperuser(session)) {
    rows = await env.DB.prepare("SELECT * FROM timetable ORDER BY day_of_week ASC, start_time ASC, timetable_id DESC").all();
  } else {
    const student = await env.DB.prepare("SELECT course, batch FROM students WHERE student_id = ?").bind(session.user_id).first();
    rows = await env.DB.prepare("SELECT * FROM timetable WHERE (course = ? OR course = '') AND (batch = ? OR batch = '') ORDER BY day_of_week ASC, start_time ASC, timetable_id DESC").bind(student?.course || "", student?.batch || "").all();
  }
  return json(rows.results || []);
}

async function timetableCreate(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const b = await request.json();
  await env.DB.prepare("INSERT INTO timetable (title, day_of_week, start_time, end_time, course, batch, location, instructor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(b.title || "", b.day_of_week || "", b.start_time || "", b.end_time || "", b.course || "", b.batch || "", b.location || "", b.instructor || "").run();
  return json({ status: "ok", message: "Timetable entry created" });
}

function airlineFromRemark(remark) {
  const text = String(remark || "").trim();
  const m1 = text.match(/interview\s*[:\-]\s*([A-Za-z0-9 .&-]+)/i);
  if (m1) return m1[1].trim();
  const m2 = text.match(/([A-Za-z][A-Za-z .&-]{2,})\s+interview/i);
  if (m2) return m2[1].trim();
  return "Interview";
}

async function interviewsList(session, env) {
  const manual = await env.DB.prepare("SELECT interview_id, airline_name, interview_date, notes FROM interview_stats ORDER BY interview_date DESC, interview_id DESC").all();
  let attendance;
  if (isSuperuser(session)) {
    attendance = await env.DB.prepare("SELECT attendance_id, student_id, student_name, date, remarks FROM attendance WHERE remarks IS NOT NULL AND trim(remarks) <> '' AND lower(remarks) LIKE '%interview%' ORDER BY date DESC, attendance_id DESC").all();
  } else {
    attendance = await env.DB.prepare("SELECT attendance_id, student_id, student_name, date, remarks FROM attendance WHERE student_id = ? AND remarks IS NOT NULL AND trim(remarks) <> '' AND lower(remarks) LIKE '%interview%' ORDER BY date DESC, attendance_id DESC").bind(session.user_id).all();
  }
  const items = [];
  for (const r of manual.results || []) items.push({ ...r, source: "manual" });
  for (const r of attendance.results || []) {
    items.push({
      interview_id: `attendance-${r.attendance_id}`,
      airline_name: airlineFromRemark(r.remarks || ""),
      interview_date: r.date,
      notes: r.remarks || "",
      source: "attendance_remark",
      student_id: r.student_id,
      student_name: r.student_name,
    });
  }
  items.sort((a, b) => String(b.interview_date || "").localeCompare(String(a.interview_date || "")));
  return json(items);
}

async function interviewsCreate(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const b = await request.json();
  await env.DB.prepare("INSERT INTO interview_stats (airline_name, interview_date, notes) VALUES (?, ?, ?)")
    .bind(b.airline_name || "", b.interview_date || "", b.notes || "").run();
  return json({ status: "ok", message: "Interview stat created" });
}

async function announcementsList(env) {
  const rows = await env.DB.prepare("SELECT * FROM announcements ORDER BY announcement_id DESC LIMIT 20").all();
  return json(rows.results || []);
}

async function announcementsCreate(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const b = await request.json();
  await env.DB.prepare("INSERT INTO announcements (title, message, created_by) VALUES (?, ?, ?)")
    .bind(b.title || "", b.message || "", session.user_id).run();
  return json({ status: "ok", message: "Announcement created" });
}

async function notificationsList(session, env) {
  const rows = await env.DB.prepare(
    "SELECT n.notification_id, n.title, n.message, n.level, n.target_user, n.created_at, CASE WHEN nr.user_id IS NULL THEN 0 ELSE 1 END AS is_read FROM notifications n LEFT JOIN notification_reads nr ON nr.notification_id = n.notification_id AND nr.user_id = ? WHERE n.target_user IS NULL OR n.target_user = ? ORDER BY n.notification_id DESC LIMIT 30"
  ).bind(session.user_id, session.user_id).all();
  return json(rows.results || []);
}

async function notificationsCreate(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const b = await request.json();
  await env.DB.prepare("INSERT INTO notifications (title, message, level, target_user) VALUES (?, ?, ?, ?)")
    .bind(b.title || "", b.message || "", b.level || "info", b.target_user || null).run();
  return json({ status: "ok", message: "Notification created" });
}

async function notificationsRead(notificationId, session, env) {
  await env.DB.prepare("INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)")
    .bind(notificationId, session.user_id).run();
  return json({ status: "ok" });
}

async function razorpayOrder(request, session, env) {
  if (!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) throw httpError(503, "Razorpay is not configured");
  const b = await request.json();
  const studentId = b.student_id || session.user_id;
  ensureSelfOrSuperuser(session, studentId);
  const info = await studentFinancials(env, studentId);
  if (!info) throw httpError(404, "Student not found");
  if (info.due <= 0) throw httpError(400, "No due amount");
  const amountInr = Math.max(1, Math.min(Number(b.amount_inr || info.due), info.due));
  const amountPaise = Math.round(amountInr * 100);
  const receipt = `fee-${studentId}-${Date.now()}`;
  const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: { student_id: studentId, course: info.student.course || "" },
      payment_capture: 1,
    }),
  });
  if (!orderRes.ok) throw httpError(502, `Razorpay order failed: ${await orderRes.text()}`);
  const order = await orderRes.json();
  return json({
    key_id: env.RAZORPAY_KEY_ID,
    order,
    student_id: studentId,
    amount_inr: amountInr,
    due_inr: info.due,
    student_name: info.student.student_name,
  });
}

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function razorpayVerify(request, session, env) {
  if (!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) throw httpError(503, "Razorpay is not configured");
  const b = await request.json();
  ensureSelfOrSuperuser(session, String(b.student_id || ""));
  const computed = await hmacHex(env.RAZORPAY_KEY_SECRET, `${b.razorpay_order_id}|${b.razorpay_payment_id}`);
  if (computed !== String(b.razorpay_signature || "")) throw httpError(400, "Invalid payment signature");
  const info = await studentFinancials(env, b.student_id);
  if (!info) throw httpError(404, "Student not found");
  const amountPaid = Math.min(Math.max(Number(b.amount_paid_inr || 0), 0), info.due);
  const remarks = `Razorpay payment_id=${b.razorpay_payment_id}, order_id=${b.razorpay_order_id}`;
  const ins = await env.DB.prepare("INSERT INTO fees (student_id, amount_total, amount_paid, remarks) VALUES (?, ?, ?, ?)")
    .bind(b.student_id, info.total, amountPaid, remarks).run();
  const feeId = Number(ins.meta?.last_row_id || 0);
  const nowIso = new Date().toISOString().slice(0, 10);
  const balanceDue = Math.max(info.due - amountPaid, 0);
  return json({
    status: "ok",
    message: "Payment verified and recorded",
    amount_paid_inr: amountPaid,
    invoice: {
      invoice_no: `AAI-INV-${feeId || Date.now()}`,
      date: nowIso,
      student_id: b.student_id,
      student_name: info.student.student_name,
      course: info.student.course || "",
      payment_id: b.razorpay_payment_id || "",
      order_id: b.razorpay_order_id || "",
      amount_paid: amountPaid,
      amount_total: info.total,
      balance_due: balanceDue,
    },
  });
}

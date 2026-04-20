const COURSE_FEES_INR = {
  "ground operations": 150000,
  "cabin crew": 250000,
};
const DEFAULT_TRAINING_CATEGORIES = [
  "Ground Operations",
  "Cabin Crew",
  "CPL Ground Classes",
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/^\/api\/?/, "");

  if (method === "OPTIONS") {
    return json({ ok: true });
  }

  try {
    if (path === "public/student-ids" && method === "GET") {
      return publicStudentIds(env);
    }
    if (path === "public/alumni" && method === "GET") {
      return publicAlumni(env);
    }
    if (path === "parent/summary" && method === "GET") {
      return parentSummary(url, env);
    }
    if (path === "chatbot/ask" && method === "POST") {
      return await chatbotAsk(request, env);
    }
    if (path === "leads" && method === "POST") {
      return await leadsCreate(request, env);
    }
    if (path === "leads" && method === "GET") {
      const session = await requireAuth(request, env);
      return await leadsList(session, env);
    }
    if (/^leads\/\d+\/contacted$/.test(path) && method === "POST") {
      const session = await requireAuth(request, env);
      const id = Number(path.split("/")[1]);
      return await leadsMarkContacted(id, session, env);
    }
    if (/^leads\/\d+\/not-interested$/.test(path) && method === "POST") {
      const session = await requireAuth(request, env);
      const id = Number(path.split("/")[1]);
      return await leadsMarkNotInterested(id, session, env);
    }
    if (/^leads\/\d+\/followup$/.test(path) && method === "POST") {
      const session = await requireAuth(request, env);
      const id = Number(path.split("/")[1]);
      return await leadsSetFollowup(id, request, session, env);
    }
    if (path === "admissions/apply" && method === "POST") {
      return await admissionsApply(request, env);
    }
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
    if (path === "auth/change-password" && method === "POST") return authChangePassword(request, session, env);
    if (path === "admin/users/password" && method === "POST") return adminSetUserPassword(request, session, env);

    if (path === "activity/logs" && method === "GET") return activityLogs(session, env);
    if (path === "activity/undo" && method === "POST") return activityUndo(request, session, env);
    if (path === "parent/link" && method === "POST") return parentLinkCreate(request, session, env);

    if (path === "students" && method === "GET") return listStudents(session, env);
    if (path === "students" && method === "POST") return addStudent(url, session, env);
    if (path === "students/bulk-batch" && method === "POST") return studentsBulkBatch(request, session, env);
    if (path === "students/mark-alumni" && method === "POST") return studentsMarkAlumni(request, session, env);
    if (path === "students/delete" && method === "POST") return studentsDelete(request, session, env);

    if (path.startsWith("students/") && path.endsWith("/balance") && method === "GET") {
      const studentId = path.split("/")[1];
      return studentBalance(studentId, session, env);
    }
    if (path.startsWith("students/") && path.endsWith("/password") && method === "GET") {
      const studentId = path.split("/")[1];
      return studentPassword(studentId, session, env);
    }
    if (path.startsWith("students/") && path.endsWith("/attendance") && method === "GET") {
      const studentId = path.split("/")[1];
      return studentAttendance(studentId, session, env);
    }
    if (path.startsWith("students/") && path.endsWith("/fees") && method === "GET") {
      const studentId = path.split("/")[1];
      return studentFees(studentId, session, env);
    }

    if (path.startsWith("students/") && path.endsWith("/profile") && method === "GET") {
      const studentId = path.split("/")[1];
      return studentProfileGet(studentId, session, env);
    }
    if (path.startsWith("students/") && path.endsWith("/profile") && method === "POST") {
      const studentId = path.split("/")[1];
      return await studentProfileSave(studentId, request, session, env);
    }
    if (path.startsWith("students/") && path.match(/\/profile\/files\/[^\/]+$/) && method === "GET") {
      const parts = path.split("/");
      const studentId = parts[1];
      const fileType = parts[4];
      return studentProfileFile(studentId, fileType, session, env);
    }

    if (path === "attendance/recent" && method === "GET") return attendanceRecent(session, env);
    if (path === "attendance/month" && method === "GET") return attendanceMonth(url, session, env);
    if (path === "attendance/by-date" && method === "GET") return attendanceByDate(url, session, env);
    if (path === "attendance/record" && method === "POST") return attendanceRecord(request, session, env);
    if (path === "attendance/update" && method === "POST") return attendanceUpdate(request, session, env);
    if (path === "attendance/sync" && method === "POST") return json({ detail: "Use /attendance/sync/upload with a CSV file." }, 400);
    if (path === "attendance/sync/upload" && method === "POST") return attendanceSyncUpload(request, session, env);

    if (path === "fees/recent" && method === "GET") return feesRecent(session, env);
    if (path === "fees/summary" && method === "GET") return feesSummary(session, env);
    if (path === "fees/record" && method === "POST") return feesRecord(request, session, env);
    if (path === "fees/reminders" && method === "POST") return feesReminders(request, session, env);
    if (path === "fees/admin/categories" && method === "GET") return feesCategoriesList(session, env);
    if (path === "fees/admin/category" && method === "POST") return feesCategoryUpsert(request, session, env);
    if (path === "fees/admin/policies" && method === "GET") return feesPoliciesList(session, env);
    if (path === "fees/admin/policy" && method === "POST") return feesPolicyUpsert(request, session, env);
    if (path === "fees/admin/reset-unpaid" && method === "POST") return feesResetUnpaid(session, env);
    if (/^fees\/\d+\/invoice$/.test(path) && method === "GET") {
      const feeId = Number(path.split("/")[1]);
      return feeInvoice(feeId, session, env);
    }
    if (path === "tests" && method === "GET") return testsList(session, env);
    if (path === "tests" && method === "POST") return testsCreate(request, session, env);
    if (/^tests\/\d+$/.test(path) && method === "GET") {
      const id = Number(path.split("/")[1]);
      return testDetail(id, session, env);
    }
    if (/^tests\/\d+\/attempts$/.test(path) && method === "GET") {
      const id = Number(path.split("/")[1]);
      return testAttemptsByTest(id, session, env);
    }
    if (/^tests\/\d+\/start$/.test(path) && method === "POST") {
      const id = Number(path.split("/")[1]);
      return testStart(id, session, env);
    }
    if (/^tests\/attempts\/\d+\/submit$/.test(path) && method === "POST") {
      const id = Number(path.split("/")[2]);
      return testSubmit(id, request, session, env);
    }
    if (/^tests\/attempts\/\d+\/malpractice$/.test(path) && method === "POST") {
      const id = Number(path.split("/")[2]);
      return testMalpractice(id, request, session, env);
    }

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
    if (path === "admissions" && method === "GET") return await admissionsList(session, env);
    if (/^admissions\/\d+\/pdf$/.test(path) && method === "GET") {
      const id = Number(path.split("/")[1]);
      return await admissionsPdf(id, session, env);
    }
    if (/^admissions\/\d+\/pdf$/.test(path) && method === "POST") {
      const id = Number(path.split("/")[1]);
      return await admissionsPdfReplace(id, request, session, env);
    }
    if (/^admissions\/\d+\/photo$/.test(path) && method === "GET") {
      const id = Number(path.split("/")[1]);
      return await admissionsPhoto(id, session, env);
    }
    if (/^admissions\/\d+$/.test(path) && method === "DELETE") {
      const id = Number(path.split("/")[1]);
      return await admissionsDelete(id, session, env);
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
  return session?.role === "superuser" || session?.role === "staff" || session?.user_id === "superuser";
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

function normalizeTrainingCategory(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function ensureStudentPasswordsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS student_passwords (
      student_id TEXT PRIMARY KEY,
      password_plain TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
}

async function ensureStudentPassword(env, studentId) {
  await ensureStudentPasswordsTable(env);
  const row = await env.DB.prepare("SELECT password_plain FROM student_passwords WHERE student_id = ?")
    .bind(studentId).first();
  if (row?.password_plain) return String(row.password_plain);
  const pwd = random8Digits();
  await env.DB.prepare(
    "INSERT INTO student_passwords (student_id, password_plain) VALUES (?, ?)"
  ).bind(studentId, pwd).run();
  return pwd;
}

async function ensureCredentials(env) {
  await ensureStudentPasswordsTable(env);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO credentials (username, password, role) VALUES ('superuser', ?, 'superuser')"
  ).bind(await hashPassword("qwerty")).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO credentials (username, password, role) VALUES ('praharsh', ?, 'staff')"
  ).bind(await hashPassword("9121726565")).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO credentials (username, password, role) VALUES ('nanda', ?, 'staff')"
  ).bind(await hashPassword("8124326444")).run();
  const students = await env.DB.prepare("SELECT student_id FROM students").all();
  for (const row of students.results || []) {
    if (/\d/.test(String(row.student_id))) {
      const pwd = await ensureStudentPassword(env, String(row.student_id));
      await env.DB.prepare(
        "INSERT INTO credentials (username, password, role) VALUES (?, ?, 'student') ON CONFLICT(username) DO UPDATE SET password = excluded.password, role = 'student'"
      ).bind(row.student_id, await hashPassword(pwd)).run();
    }
  }
}

async function ensureParentLinksTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS parent_links (
      token TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT
    )`
  ).run();
}

const PASSWORD_HASH_PREFIX = "pbkdf2";
const PASSWORD_HASH_ITERATIONS = 120000;

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(str) {
  const binary = atob(str || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hashPassword(password) {
  return String(password || "");
}

async function verifyPassword(storedPassword, plainPassword) {
  const stored = String(storedPassword || "");
  if (!stored) return { ok: false, needsDowngrade: false };
  if (!stored.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    return { ok: stored === String(plainPassword || ""), needsDowngrade: false };
  }
  const parts = stored.split("$");
  if (parts.length !== 4) return { ok: false, needsDowngrade: false };
  const iterations = Number(parts[1] || PASSWORD_HASH_ITERATIONS);
  const salt = base64ToBytes(parts[2] || "");
  const expected = parts[3] || "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(plainPassword || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256
  );
  const actual = bytesToBase64(new Uint8Array(bits));
  return { ok: actual === expected, needsDowngrade: actual === expected };
}

async function ensureActivityTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS activity_log (
      activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      undone INTEGER NOT NULL DEFAULT 0,
      undone_at TEXT
    )`
  ).run();
}

async function ensureLeadsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS leads (
      lead_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      age TEXT,
      qualification TEXT,
      location TEXT,
      phone TEXT,
      preferred_time TEXT,
      intent TEXT,
      source TEXT,
      last_message TEXT,
      last_reply TEXT,
      last_intent TEXT,
      updated_at TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      contacted_at TEXT,
      followup_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
  const cols = await env.DB.prepare("PRAGMA table_info(leads)").all();
  const existing = new Set((cols.results || []).map((c) => String(c.name || "")));
  const alter = [
    { name: "status", sql: "ALTER TABLE leads ADD COLUMN status TEXT NOT NULL DEFAULT 'new'" },
    { name: "contacted_at", sql: "ALTER TABLE leads ADD COLUMN contacted_at TEXT" },
    { name: "followup_date", sql: "ALTER TABLE leads ADD COLUMN followup_date TEXT" },
    { name: "source", sql: "ALTER TABLE leads ADD COLUMN source TEXT" },
    { name: "last_message", sql: "ALTER TABLE leads ADD COLUMN last_message TEXT" },
    { name: "last_reply", sql: "ALTER TABLE leads ADD COLUMN last_reply TEXT" },
    { name: "last_intent", sql: "ALTER TABLE leads ADD COLUMN last_intent TEXT" },
    { name: "updated_at", sql: "ALTER TABLE leads ADD COLUMN updated_at TEXT" },
  ];
  for (const col of alter) {
    if (!existing.has(col.name)) {
      await env.DB.prepare(col.sql).run();
    }
  }
}

async function ensureProfileTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS student_profiles (
      student_id TEXT PRIMARY KEY,
      student_phone TEXT,
      student_email TEXT,
      aadhaar_number TEXT,
      pan_number TEXT,
      blood_group TEXT,
      religion TEXT,
      mother_tongue TEXT,
      address_details TEXT,
      parent_name TEXT,
      parent_occupation TEXT,
      parent_aadhaar TEXT,
      parent_qualification TEXT,
      parent_office_address TEXT,
      parent_office_phone TEXT,
      parent_email TEXT,
      parent_address TEXT,
      guardian_name TEXT,
      guardian_relation TEXT,
      guardian_phone TEXT,
      guardian_aadhaar TEXT,
      guardian_email TEXT,
      guardian_address TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
  
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS profile_files (
      file_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_name TEXT,
      file_data BLOB,
      mime_type TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
}

async function leadsCreate(request, env) {
  await ensureLeadsTable(env);
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const age = String(body.age || "").trim();
  const qualification = String(body.qualification || "").trim();
  const location = String(body.location || "").trim();
  const phoneRaw = String(body.phone || "").replace(/\D/g, "");
  const preferredTime = String(body.preferred_time || "").trim();
  const intent = String(body.intent || "").trim();
  if (!phoneRaw || !/^\d{10}$/.test(phoneRaw)) {
    throw httpError(400, "Phone number must be a 10 digit number.");
  }
  await env.DB.prepare(
    `INSERT INTO leads (name, age, qualification, location, phone, preferred_time, intent, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'inquiry', datetime('now'))`
  ).bind(name, age, qualification, location, phoneRaw, preferredTime, intent).run();
  return json({ status: "ok", message: "Lead captured" });
}

async function recordChatbotLead(message, reply, profile, intent, env) {
  await ensureLeadsTable(env);
  const name = String(profile.name || "").trim();
  const age = String(profile.age || "").trim();
  const qualification = String(profile.qualification || "").trim();
  const location = String(profile.location || "").trim();
  const phoneRaw = String(profile.phone || "").replace(/\D/g, "");
  const preferredTime = String(profile.preferred_time || "").trim();
  const validPhone = /^\d{10}$/.test(phoneRaw) ? phoneRaw : "";
  const safeName = name || null;
  const safeAge = age || null;
  const safeQualification = qualification || null;
  const safeLocation = location || null;
  const safeIntent = String(intent || "").trim() || null;

  if (validPhone) {
    const existing = await env.DB.prepare(
      "SELECT lead_id FROM leads WHERE phone = ? ORDER BY lead_id DESC LIMIT 1"
    ).bind(validPhone).first();
    if (existing?.lead_id) {
      await env.DB.prepare(
        `UPDATE leads
         SET name = COALESCE(?, name),
             age = COALESCE(?, age),
             qualification = COALESCE(?, qualification),
             location = COALESCE(?, location),
             preferred_time = COALESCE(?, preferred_time),
             intent = COALESCE(?, intent),
             source = 'chatbot',
             last_message = ?,
             last_reply = ?,
             last_intent = ?,
             updated_at = datetime('now')
         WHERE lead_id = ?`
      ).bind(
        safeName,
        safeAge,
        safeQualification,
        safeLocation,
        preferredTime || null,
        safeIntent,
        message,
        reply,
        safeIntent,
        existing.lead_id
      ).run();
      return;
    }
  }

  await env.DB.prepare(
    `INSERT INTO leads
      (name, age, qualification, location, phone, preferred_time, intent, source, last_message, last_reply, last_intent, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'chatbot', ?, ?, ?, datetime('now'))`
  ).bind(
    safeName,
    safeAge,
    safeQualification,
    safeLocation,
    validPhone || null,
    preferredTime || null,
    safeIntent,
    message,
    reply,
    safeIntent
  ).run();
}

async function chatbotAsk(request, env) {
  const body = await request.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  const intent = String(body.intent || "").trim();
  if (!message) throw httpError(400, "Message is required.");

  const name = String(profile.name || "").trim();
  const age = String(profile.age || "").trim();
  const qualification = String(profile.qualification || "").trim();
  const location = String(profile.location || "").trim();
  const knownParts = [];
  if (name) knownParts.push(`Name: ${name}`);
  if (age) knownParts.push(`Age: ${age}`);
  if (qualification) knownParts.push(`Qualification: ${qualification}`);
  if (location) knownParts.push(`Location: ${location}`);
  const knownDetails = knownParts.length ? `Known details: ${knownParts.join(", ")}.` : "";

  const systemPrompt =
    "You are the official chatbot for Arunand's Aviation Institute in Bangalore. " +
    "Be warm, concise, and professional. " +
    "If asked about fees or pricing, do not provide numbers; say to contact us for the latest fee information. " +
    "Courses: Ground Operations (6 months), Cabin Crew (8 months), and CPL Ground Classes (6 months). " +
    "Eligibility is typically 10+2 pass. " +
    "The institute is based in Bangalore. " +
    "For documents, mention 10th/12th marksheets, Aadhaar/ID, and passport photos. " +
    "For schedules or batches, say timings vary and offer a counsellor callback. " +
    "If the user wants to talk to a counsellor, ask for their phone number and preferred time. " +
    "If the user asks whether this is AI, say yes and explain it can assist with courses, fees, eligibility, and admissions. " +
    "Do not make promises about discounts or admissions; invite them to share details for follow-up.";

  const messages = [{ role: "system", content: systemPrompt }];
  if (knownDetails) {
    messages.push({ role: "user", content: knownDetails });
  }
  messages.push({ role: "user", content: message });

  const fallbackReply = () => {
    const lower = message.toLowerCase();
    if (/cpl|commercial pilot|pilot/.test(lower)) {
      return "We offer CPL Ground Classes (Commercial Pilot License) with a 6-month duration. Would you like details on syllabus or fees?";
    }
    if (/course|courses|program/.test(lower)) {
      return "We offer Ground Operations (6 months), Cabin Crew (8 months), and CPL Ground Classes (6 months). Which course would you like details for?";
    }
    if (/fee|fees|cost|price/.test(lower)) {
      return "For the latest fee information, please contact us directly and we will share the current details.";
    }
    if (/eligibility|eligible|criteria/.test(lower)) {
      return "Eligibility typically requires 10+2 pass and good communication skills. Want the detailed criteria for a specific course?";
    }
    if (/counsellor|counselor|call|talk/.test(lower)) {
      return "Sure. Please share your phone number and preferred time to receive a call.";
    }
    if (/location|address|bangalore|bengaluru/.test(lower)) {
      return "We are based in Bangalore. Would you like our exact location and contact details?";
    }
    return "Thanks for reaching out! We can help with courses, fees, eligibility, and admissions. What would you like to know?";
  };

  if (!env.AI || typeof env.AI.run !== "function") {
    const reply = fallbackReply();
    await recordChatbotLead(message, reply, profile, intent, env);
    return json({ reply });
  }

  let response;
  try {
    response = await env.AI.run("@cf/meta/llama-3-8b-instruct", { messages });
  } catch (err) {
    const reply = fallbackReply();
    await recordChatbotLead(message, reply, profile, intent, env);
    return json({ reply });
  }
  const reply = String(response?.response || response?.result?.response || response?.text || "").trim();
  if (!reply) {
    const fallback = fallbackReply();
    await recordChatbotLead(message, fallback, profile, intent, env);
    return json({ reply: fallback });
  }
  await recordChatbotLead(message, reply, profile, intent, env);
  return json({ reply });
}

async function leadsList(session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureLeadsTable(env);
  const rows = await env.DB.prepare(
    `SELECT lead_id, name, age, qualification, location, phone, preferred_time, intent, source, last_message, last_reply, last_intent, updated_at, status, contacted_at, followup_date, created_at
     FROM leads
     ORDER BY lead_id DESC
     LIMIT 500`
  ).all();
  return json(rows.results || []);
}

async function leadsMarkContacted(leadId, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  if (!leadId) throw httpError(400, "Invalid lead id");
  await ensureLeadsTable(env);
  await env.DB.prepare(
    "UPDATE leads SET status = 'contacted', contacted_at = datetime('now') WHERE lead_id = ?"
  ).bind(leadId).run();
  return json({ status: "ok", lead_id: leadId });
}

async function leadsMarkNotInterested(leadId, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  if (!leadId) throw httpError(400, "Invalid lead id");
  await ensureLeadsTable(env);
  await env.DB.prepare(
    "UPDATE leads SET status = 'not_interested' WHERE lead_id = ?"
  ).bind(leadId).run();
  return json({ status: "ok", lead_id: leadId });
}

async function leadsSetFollowup(leadId, request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  if (!leadId) throw httpError(400, "Invalid lead id");
  await ensureLeadsTable(env);
  const body = await request.json().catch(() => ({}));
  const followupDate = String(body.followup_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(followupDate)) {
    throw httpError(400, "Invalid follow-up date");
  }
  await env.DB.prepare(
    "UPDATE leads SET followup_date = ? WHERE lead_id = ?"
  ).bind(followupDate, leadId).run();
  return json({ status: "ok", lead_id: leadId, followup_date: followupDate });
}

async function writeActivity(env, session, actionType, description, payload = {}) {
  await ensureActivityTable(env);
  await env.DB.prepare(
    "INSERT INTO activity_log (action_type, description, payload_json, created_by) VALUES (?, ?, ?, ?)"
  ).bind(actionType, description, JSON.stringify(payload), session.user_id).run();
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
  const cred = await env.DB.prepare(
    "SELECT role FROM credentials WHERE username = ?"
  ).bind(String(row.user_id || "")).first();
  const timeout = Number(env.SESSION_TIMEOUT_SECONDS || "300");
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?")
    .bind(now + timeout, token).run();
  return { token, user_id: row.user_id, role: String(cred?.role || "") };
}

async function handleLogin(request, env) {
  await ensureCredentials(env);
  const body = await request.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();
  const cred = await env.DB.prepare(
    "SELECT username, role, password FROM credentials WHERE username = ?"
  ).bind(username).first();
  if (!cred) throw httpError(401, "Invalid credentials");
  const verification = await verifyPassword(cred.password, password);
  if (!verification.ok) throw httpError(401, "Invalid credentials");
  if (verification.needsDowngrade) {
    await env.DB.prepare("UPDATE credentials SET password = ? WHERE username = ?")
      .bind(String(password || ""), username).run();
  }
  const token = crypto.randomUUID().replace(/-/g, "");
  const now = Math.floor(Date.now() / 1000);
  const timeout = Number(env.SESSION_TIMEOUT_SECONDS || "300");
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(token, username, now + timeout).run();
  return json({ status: "ok", token });
}

async function authMe(userId, env) {
  const cred = await env.DB.prepare(
    "SELECT role FROM credentials WHERE username = ?"
  ).bind(String(userId || "")).first();
  const role = String(cred?.role || "");
  if (role === "superuser" || role === "staff" || userId === "superuser") {
    const display = String(userId || "").toLowerCase();
    let welcome = "";
    if (display === "praharsh") welcome = "Welcome Praharsh Sir!";
    else if (display === "nanda") welcome = "Welcome Nanda Sir!";
    return { status: "ok", user: String(userId || ""), role: "superuser", welcome_message: welcome };
  }
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

async function authChangePassword(request, session, env) {
  await ensureCredentials(env);
  const b = await request.json();
  const currentPassword = String(b.current_password || "").trim();
  const newPassword = String(b.new_password || "").trim();
  if (!currentPassword || !newPassword) throw httpError(400, "current_password and new_password are required");
  if (newPassword.length < 6) throw httpError(400, "New password must be at least 6 characters");
  const cred = await env.DB.prepare(
    "SELECT username, password FROM credentials WHERE username = ?"
  ).bind(session.user_id).first();
  if (!cred) throw httpError(400, "Current password is incorrect");
  const verification = await verifyPassword(cred.password, currentPassword);
  if (!verification.ok) throw httpError(400, "Current password is incorrect");
  await env.DB.prepare("UPDATE credentials SET password = ? WHERE username = ?")
    .bind(await hashPassword(newPassword), session.user_id).run();
  await writeActivity(env, session, "password_changed", `Password changed for ${session.user_id}`, { username: session.user_id });
  return json({ status: "ok", message: "Password updated" });
}

async function adminSetUserPassword(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureCredentials(env);
  const b = await request.json();
  const username = String(b.username || "").trim();
  const newPassword = String(b.new_password || "").trim();
  if (!username || !newPassword) throw httpError(400, "username and new_password are required");
  if (newPassword.length < 6) throw httpError(400, "New password must be at least 6 characters");
  const existing = await env.DB.prepare("SELECT username FROM credentials WHERE username = ?").bind(username).first();
  if (!existing) throw httpError(404, "User not found");
  await env.DB.prepare("UPDATE credentials SET password = ? WHERE username = ?")
    .bind(await hashPassword(newPassword), username).run();
  await writeActivity(env, session, "password_reset", `Password reset for ${username}`, { username });
  return json({ status: "ok", message: "User password updated" });
}

async function publicStudentIds(env) {
  await ensureCredentials(env);
  const rows = await env.DB.prepare(
    "SELECT username FROM credentials WHERE role = 'student' AND upper(username) LIKE 'AAI%' ORDER BY username DESC"
  ).all();
  return json((rows.results || []).map((r) => r.username));
}

async function publicAlumni(env) {
  const selectedRows = await env.DB.prepare(
    `SELECT student_id, student_name, MAX(date) AS last_selected_date
     FROM attendance
     WHERE remarks IS NOT NULL
       AND trim(remarks) <> ''
       AND lower(remarks) LIKE '%selected%'
     GROUP BY student_id, student_name`
  ).all();
  const alumniRows = await env.DB.prepare(
    `SELECT student_id, student_name, NULL AS last_selected_date
     FROM students
     WHERE lower(COALESCE(status, 'active')) = 'alumni'`
  ).all();
  const byId = new Map();
  for (const row of [...(selectedRows.results || []), ...(alumniRows.results || [])]) {
    byId.set(String(row.student_id), row);
  }
  const rows = Array.from(byId.values()).sort((a, b) => {
    const aDate = String(a.last_selected_date || "");
    const bDate = String(b.last_selected_date || "");
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return String(a.student_name || "").localeCompare(String(b.student_name || ""));
  });
  return json(rows);
}

async function ensureAdmissionsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS admissions (
      admission_id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL,
      middle_name TEXT,
      last_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      blood_group TEXT,
      age INTEGER,
      dob TEXT,
      aadhaar_number TEXT,
      nationality TEXT,
      father_name TEXT,
      father_phone TEXT,
      father_occupation TEXT,
      father_email TEXT,
      mother_name TEXT,
      mother_phone TEXT,
      mother_occupation TEXT,
      mother_email TEXT,
      correspondence_address TEXT,
      permanent_address TEXT,
      course TEXT NOT NULL,
      academic_details_json TEXT NOT NULL DEFAULT '[]',
      admission_pdf_r2_key TEXT,
      admission_pdf_bytes INTEGER,
      admission_photo_r2_key TEXT,
      admission_photo_bytes INTEGER,
      admission_photo_type TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
  const cols = await env.DB.prepare("PRAGMA table_info(admissions)").all();
  const existing = new Set((cols.results || []).map((c) => c.name));
  const expected = {
    full_name: "TEXT NOT NULL DEFAULT ''",
    first_name: "TEXT",
    middle_name: "TEXT",
    last_name: "TEXT",
    phone: "TEXT",
    email: "TEXT",
    blood_group: "TEXT",
    age: "INTEGER",
    dob: "TEXT",
    aadhaar_number: "TEXT",
    nationality: "TEXT",
    father_name: "TEXT",
    father_phone: "TEXT",
    father_occupation: "TEXT",
    father_email: "TEXT",
    mother_name: "TEXT",
    mother_phone: "TEXT",
    mother_occupation: "TEXT",
    mother_email: "TEXT",
    correspondence_address: "TEXT",
    permanent_address: "TEXT",
    course: "TEXT",
    academic_details_json: "TEXT NOT NULL DEFAULT '[]'",
    admission_pdf_r2_key: "TEXT",
    admission_pdf_bytes: "INTEGER",
    admission_photo_r2_key: "TEXT",
    admission_photo_bytes: "INTEGER",
    admission_photo_type: "TEXT",
    status: "TEXT",
    created_at: "TEXT",
  };
  for (const [col, typeSql] of Object.entries(expected)) {
    if (!existing.has(col)) {
      await env.DB.prepare(`ALTER TABLE admissions ADD COLUMN ${col} ${typeSql}`).run();
    }
  }
}

function decodeBase64ToBytes(base64) {
  const clean = String(base64 || "").replace(/\s+/g, "");
  if (!clean) return new Uint8Array(0);
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function sanitizePdfFilename(name) {
  const raw = String(name || "").trim();
  const base = raw ? raw.replace(/[^a-zA-Z0-9._-]/g, "_") : `admission_${Date.now()}.pdf`;
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

async function uploadAdmissionPdfToR2(env, pdfBytes, originalFilename) {
  if (!pdfBytes || !pdfBytes.length) return { stored: false, key: null };
  if (!env.ERP_FILES || typeof env.ERP_FILES.put !== "function") {
    return { stored: false, key: null };
  }
  const filename = sanitizePdfFilename(originalFilename);
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `admissions/${yyyy}/${mm}/${crypto.randomUUID()}_${filename}`;
  await env.ERP_FILES.put(key, pdfBytes, {
    httpMetadata: {
      contentType: "application/pdf",
      contentDisposition: `inline; filename="${filename}"`,
    },
  });
  return { stored: true, key };
}

function sanitizePhotoFilename(name) {
  const raw = String(name || "").trim();
  const base = raw ? raw.replace(/[^a-zA-Z0-9._-]/g, "_") : `photo_${Date.now()}.jpg`;
  return base;
}

async function uploadAdmissionPhotoToR2(env, photoBytes, originalFilename, contentType) {
  if (!photoBytes || !photoBytes.length) return { stored: false, key: null };
  if (!env.ERP_FILES || typeof env.ERP_FILES.put !== "function") {
    return { stored: false, key: null };
  }
  const filename = sanitizePhotoFilename(originalFilename);
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `admissions/photos/${yyyy}/${mm}/${crypto.randomUUID()}_${filename}`;
  await env.ERP_FILES.put(key, photoBytes, {
    httpMetadata: {
      contentType: contentType || "image/jpeg",
      contentDisposition: `inline; filename="${filename}"`,
    },
  });
  return { stored: true, key };
}

async function sendAdmissionEmail(env, payload, pdfBase64, pdfFileName) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey || !pdfBase64) return { attempted: false, sent: false };
  const toEmail = String(env.ADMISSIONS_TO_EMAIL || "thedanielraj@outlook.com").trim();
  const fromEmail = String(env.ADMISSIONS_FROM_EMAIL || "Arunands ERP <onboarding@resend.dev>").trim();
  const fullName = [payload.firstName, payload.middleName, payload.lastName].filter(Boolean).join(" ");
  const text = [
    "New admission form submitted.",
    `Name: ${fullName}`,
    `Course: ${payload.course}`,
    `Phone: ${payload.phone}`,
    `Email: ${payload.email}`,
  ].join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `New Admission - ${fullName || "Applicant"}`,
      text,
      attachments: [
        {
          filename: pdfFileName || `admission_${Date.now()}.pdf`,
          content: pdfBase64,
        },
      ],
    }),
  });
  if (!res.ok) {
    return { attempted: true, sent: false, detail: await res.text() };
  }
  return { attempted: true, sent: true };
}

async function admissionsApply(request, env) {
  await ensureAdmissionsTable(env);
  const b = await request.json();
  const firstName = String(b.first_name || "").trim();
  const middleName = String(b.middle_name || "").trim();
  const lastName = String(b.last_name || "").trim();
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ").trim();
  const phone = String(b.phone || "").trim();
  const email = String(b.email || "").trim();
  const bloodGroup = String(b.blood_group || "").trim();
  const age = Number(b.age || 0);
  const dob = String(b.dob || "").trim();
  const aadhaarNumber = String(b.aadhaar_number || "").trim();
  const nationality = String(b.nationality || "").trim();
  const fatherName = String(b.father_name || "").trim();
  const fatherPhone = String(b.father_phone || "").trim();
  const fatherOccupation = String(b.father_occupation || "").trim();
  const fatherEmail = String(b.father_email || "").trim();
  const motherName = String(b.mother_name || "").trim();
  const motherPhone = String(b.mother_phone || "").trim();
  const motherOccupation = String(b.mother_occupation || "").trim();
  const motherEmail = String(b.mother_email || "").trim();
  const correspondenceAddress = String(b.correspondence_address || "").trim();
  const permanentAddress = String(b.permanent_address || "").trim();
  const course = String(b.course || "").trim();
  const admissionPdfBase64 = String(b.admission_pdf_base64 || "").trim();
  const admissionPdfFilename = String(b.admission_pdf_filename || "").trim();
  const maxPdfBytes = 1024 * 1024;
  let admissionPdfBytes = new Uint8Array(0);
  if (admissionPdfBase64) {
    try {
      admissionPdfBytes = decodeBase64ToBytes(admissionPdfBase64);
    } catch (_) {
      throw httpError(400, "Invalid admission PDF");
    }
    if (admissionPdfBytes.length > maxPdfBytes) {
      throw httpError(413, "Admission PDF must be less than 1 MB");
    }
  }
  const admissionPhotoBase64 = String(b.admission_photo_base64 || "").trim();
  const admissionPhotoFilename = String(b.admission_photo_filename || "").trim();
  const admissionPhotoType = String(b.admission_photo_type || "").trim();
  const maxPhotoBytes = 1024 * 1024;
  let admissionPhotoBytes = new Uint8Array(0);
  if (admissionPhotoBase64) {
    try {
      admissionPhotoBytes = decodeBase64ToBytes(admissionPhotoBase64);
    } catch (_) {
      throw httpError(400, "Invalid admission photo");
    }
    if (admissionPhotoBytes.length > maxPhotoBytes) {
      throw httpError(413, "Admission photo must be less than 1 MB");
    }
  }
  const storedPdf = await uploadAdmissionPdfToR2(env, admissionPdfBytes, admissionPdfFilename);
  const storedPhoto = await uploadAdmissionPhotoToR2(env, admissionPhotoBytes, admissionPhotoFilename, admissionPhotoType);
  const academicDetails = Array.isArray(b.academic_details) ? b.academic_details : [];
  const academicDetailsJson = JSON.stringify(academicDetails);
  if (!firstName || !lastName || !phone || !email || !course) throw httpError(400, "Missing required fields");
  const ins = await env.DB.prepare(
    `INSERT INTO admissions (
      full_name,
      first_name, middle_name, last_name, phone, email, blood_group, age, dob, aadhaar_number, nationality,
      father_name, father_phone, father_occupation, father_email, mother_name, mother_phone, mother_occupation, mother_email,
      correspondence_address, permanent_address, course, academic_details_json, admission_pdf_r2_key, admission_pdf_bytes,
      admission_photo_r2_key, admission_photo_bytes, admission_photo_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    fullName,
    firstName, middleName, lastName, phone, email, bloodGroup, age, dob, aadhaarNumber, nationality,
    fatherName, fatherPhone, fatherOccupation, fatherEmail, motherName, motherPhone, motherOccupation, motherEmail,
    correspondenceAddress, permanentAddress, course, academicDetailsJson,
    storedPdf.key,
    Number(admissionPdfBytes.length || 0),
    storedPhoto.key,
    Number(admissionPhotoBytes.length || 0),
    admissionPhotoType || null
  ).run();
  const admissionId = Number(ins.meta?.last_row_id || 0);
  await writeActivity(
    env,
    { user_id: "public_admission_form" },
    "admission_submitted",
    `Admission submitted: ${firstName} ${lastName} (${course})`,
    {
      admission_id: admissionId,
      first_name: firstName,
      last_name: lastName,
      course,
      phone,
      email,
      admission_pdf_r2_key: storedPdf.key,
      admission_pdf_bytes: Number(admissionPdfBytes.length || 0),
      admission_photo_r2_key: storedPhoto.key,
      admission_photo_bytes: Number(admissionPhotoBytes.length || 0),
      admission_photo_type: admissionPhotoType || "",
    }
  );
  const emailResult = await sendAdmissionEmail(
    env,
    { firstName, middleName, lastName, phone, email, course },
    admissionPdfBase64,
    admissionPdfFilename
  );
  return json({
    status: "ok",
    message: "Admission form submitted",
    email_sent: emailResult.sent,
    pdf_stored: storedPdf.stored,
    pdf_bytes: Number(admissionPdfBytes.length || 0),
  });
}

async function admissionsList(session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureAdmissionsTable(env);
  const rows = await env.DB.prepare(
    `SELECT
      admission_id,
      first_name,
      middle_name,
      last_name,
      phone,
      email,
      blood_group,
      age,
      dob,
      aadhaar_number,
      nationality,
      father_name,
      father_phone,
      father_occupation,
      father_email,
      mother_name,
      mother_phone,
      mother_occupation,
      mother_email,
      correspondence_address,
      permanent_address,
      course,
      academic_details_json,
      created_at,
      admission_pdf_r2_key,
      admission_pdf_bytes,
      admission_photo_r2_key,
      admission_photo_bytes,
      admission_photo_type
    FROM admissions
    ORDER BY admission_id DESC
    LIMIT 500`
  ).all();
  const data = (rows.results || []).map((r) => {
    const fullName = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return {
      admission_id: r.admission_id,
      full_name: fullName,
      first_name: r.first_name || "",
      middle_name: r.middle_name || "",
      last_name: r.last_name || "",
      course: r.course || "",
      phone: r.phone || "",
      email: r.email || "",
      blood_group: r.blood_group || "",
      age: Number(r.age || 0),
      dob: r.dob || "",
      aadhaar_number: r.aadhaar_number || "",
      nationality: r.nationality || "",
      father_name: r.father_name || "",
      father_phone: r.father_phone || "",
      father_occupation: r.father_occupation || "",
      father_email: r.father_email || "",
      mother_name: r.mother_name || "",
      mother_phone: r.mother_phone || "",
      mother_occupation: r.mother_occupation || "",
      mother_email: r.mother_email || "",
      correspondence_address: r.correspondence_address || "",
      permanent_address: r.permanent_address || "",
      academic_details_json: r.academic_details_json || "[]",
      created_at: r.created_at || "",
      pdf_available: Boolean(r.admission_pdf_r2_key),
      pdf_bytes: Number(r.admission_pdf_bytes || 0),
      photo_available: Boolean(r.admission_photo_r2_key),
      photo_bytes: Number(r.admission_photo_bytes || 0),
      photo_type: r.admission_photo_type || "",
    };
  });
  return json(data);
}

async function admissionsPdf(admissionId, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  if (!admissionId) throw httpError(400, "Invalid admission id");
  await ensureAdmissionsTable(env);
  const row = await env.DB.prepare(
    "SELECT admission_pdf_r2_key, first_name, last_name FROM admissions WHERE admission_id = ?"
  ).bind(admissionId).first();
  if (!row) throw httpError(404, "Admission not found");
  const key = String(row.admission_pdf_r2_key || "").trim();
  if (!key) throw httpError(404, "Admission PDF not found");
  if (!env.ERP_FILES || typeof env.ERP_FILES.get !== "function") {
    throw httpError(503, "R2 is not configured");
  }
  const object = await env.ERP_FILES.get(key);
  if (!object || !object.body) throw httpError(404, "Admission PDF not found in storage");
  const safeFirst = String(row.first_name || "admission").replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeLast = String(row.last_name || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${safeFirst}${safeLast ? "_" + safeLast : ""}_${admissionId}.pdf`;
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, max-age=60",
    },
  });
}

async function admissionsPhoto(admissionId, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  if (!admissionId) throw httpError(400, "Invalid admission id");
  await ensureAdmissionsTable(env);
  const row = await env.DB.prepare(
    "SELECT admission_photo_r2_key, admission_photo_type, first_name, last_name FROM admissions WHERE admission_id = ?"
  ).bind(admissionId).first();
  if (!row) throw httpError(404, "Admission not found");
  const key = String(row.admission_photo_r2_key || "").trim();
  if (!key) throw httpError(404, "Admission photo not found");
  if (!env.ERP_FILES || typeof env.ERP_FILES.get !== "function") {
    throw httpError(503, "R2 is not configured");
  }
  const object = await env.ERP_FILES.get(key);
  if (!object || !object.body) throw httpError(404, "Admission photo not found in storage");
  const safeFirst = String(row.first_name || "admission").replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeLast = String(row.last_name || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = String(row.admission_photo_type || "image/jpeg").includes("png") ? "png" : "jpg";
  const filename = `${safeFirst}${safeLast ? "_" + safeLast : ""}_${admissionId}.${ext}`;
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": row.admission_photo_type || "image/jpeg",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, max-age=60",
    },
  });
}

async function admissionsPdfReplace(admissionId, request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  if (!admissionId) throw httpError(400, "Invalid admission id");
  await ensureAdmissionsTable(env);
  const row = await env.DB.prepare(
    "SELECT admission_id, first_name, last_name FROM admissions WHERE admission_id = ?"
  ).bind(admissionId).first();
  if (!row) throw httpError(404, "Admission not found");
  const body = await request.json().catch(() => ({}));
  const admissionPdfBase64 = String(body.admission_pdf_base64 || "").trim();
  const admissionPdfFilename = String(body.admission_pdf_filename || "").trim();
  if (!admissionPdfBase64) throw httpError(400, "Admission PDF payload missing");
  const maxPdfBytes = 1024 * 1024;
  let admissionPdfBytes = new Uint8Array(0);
  try {
    admissionPdfBytes = decodeBase64ToBytes(admissionPdfBase64);
  } catch (_) {
    throw httpError(400, "Invalid admission PDF");
  }
  if (admissionPdfBytes.length > maxPdfBytes) {
    throw httpError(413, "Admission PDF must be less than 1 MB.");
  }
  const storedPdf = await uploadAdmissionPdfToR2(env, admissionPdfBytes, admissionPdfFilename);
  if (!storedPdf.stored) throw httpError(503, "Unable to store admission PDF");
  await env.DB.prepare(
    "UPDATE admissions SET admission_pdf_r2_key = ?, admission_pdf_bytes = ? WHERE admission_id = ?"
  ).bind(storedPdf.key, Number(admissionPdfBytes.length || 0), admissionId).run();
  const safeFirst = String(row.first_name || "admission").replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeLast = String(row.last_name || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${safeFirst}${safeLast ? "_" + safeLast : ""}_${admissionId}.pdf`;
  return json({
    status: "ok",
    admission_id: admissionId,
    pdf_bytes: Number(admissionPdfBytes.length || 0),
    filename,
  });
}

async function admissionsDelete(admissionId, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  if (!admissionId) throw httpError(400, "Invalid admission id");
  await ensureAdmissionsTable(env);
  const row = await env.DB.prepare("SELECT * FROM admissions WHERE admission_id = ?").bind(admissionId).first();
  if (!row) throw httpError(404, "Admission not found");
  await env.DB.prepare("DELETE FROM admissions WHERE admission_id = ?").bind(admissionId).run();
  const fullName = String(row.full_name || [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "));
  await writeActivity(
    env,
    session,
    "admission_deleted",
    `Deleted admission #${admissionId}${fullName ? ` (${fullName})` : ""}`,
    { admission: row }
  );
  return json({ status: "ok", message: "Admission deleted" });
}

async function studentFinancials(env, studentId) {
  await ensureFeePoliciesTable(env);
  await ensureTrainingCategoriesTable(env);
  const student = await env.DB.prepare(
    "SELECT student_id, student_name, course, batch FROM students WHERE student_id = ?"
  ).bind(studentId).first();
  if (!student) return null;
  const fee = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount_paid),0) AS paid, COALESCE(MAX(amount_total),0) AS max_total, COUNT(*) AS transactions FROM fees WHERE student_id = ?"
  ).bind(studentId).first();
  const policy = await env.DB.prepare(
    "SELECT concession_amount, due_date FROM fee_policies WHERE student_id = ?"
  ).bind(studentId).first();
  const planned = await courseFeeInr(env, student.course);
  const baseTotal = Number(planned ?? fee.max_total ?? 0);
  const concessionAmount = Math.min(Math.max(Number(policy?.concession_amount || 0), 0), Math.max(baseTotal, 0));
  const total = Math.max(baseTotal - concessionAmount, 0);
  const paid = Number(fee.paid || 0);
  const due = Math.max(total - paid, 0);
  return {
    student,
    base_total: baseTotal,
    concession_amount: concessionAmount,
    due_date: policy?.due_date || null,
    total,
    paid,
    due,
    transactions: Number(fee.transactions || 0),
  };
}

async function ensureFeePoliciesTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS fee_policies (
      student_id TEXT PRIMARY KEY,
      concession_amount REAL NOT NULL DEFAULT 0,
      due_date TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
}

async function ensureTrainingCategoriesTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS training_categories (
      category_key TEXT PRIMARY KEY,
      category_name TEXT NOT NULL,
      fee_amount REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
}

async function listTrainingCategories(env) {
  await ensureTrainingCategoriesTable(env);
  const rows = await env.DB.prepare(
    "SELECT category_key, category_name, fee_amount, updated_at FROM training_categories ORDER BY category_name ASC"
  ).all();
  const byKey = new Map((rows.results || []).map((row) => [String(row.category_key || ""), row]));
  const students = await env.DB.prepare(
    "SELECT DISTINCT course FROM students WHERE TRIM(COALESCE(course, '')) <> ''"
  ).all();
  const categories = [];
  const seen = new Set();
  const candidateNames = [
    ...DEFAULT_TRAINING_CATEGORIES,
    ...(students.results || []).map((row) => String(row.course || "").trim()),
  ];
  for (const name of candidateNames) {
    const categoryName = String(name || "").trim();
    if (!categoryName) continue;
    const key = normalizeTrainingCategory(categoryName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const stored = byKey.get(key);
    const defaultFee = COURSE_FEES_INR[key];
    categories.push({
      category_key: key,
      category_name: stored?.category_name || categoryName,
      fee_amount: Number(stored?.fee_amount ?? defaultFee ?? 0),
      updated_at: stored?.updated_at || null,
      is_custom: Boolean(stored),
    });
  }
  for (const [key, stored] of byKey.entries()) {
    if (seen.has(key)) continue;
    categories.push({
      category_key: key,
      category_name: String(stored.category_name || "").trim() || key,
      fee_amount: Number(stored.fee_amount || 0),
      updated_at: stored.updated_at || null,
      is_custom: true,
    });
  }
  categories.sort((a, b) => String(a.category_name || "").localeCompare(String(b.category_name || "")));
  return categories;
}

async function courseFeeInr(env, course) {
  const key = normalizeTrainingCategory(course);
  if (!key) return null;
  await ensureTrainingCategoriesTable(env);
  const row = await env.DB.prepare(
    "SELECT fee_amount FROM training_categories WHERE category_key = ?"
  ).bind(key).first();
  if (row) return Number(row.fee_amount || 0);
  return COURSE_FEES_INR[key] ?? null;
}

async function ensureFeeReceiptColumns(env) {
  const info = await env.DB.prepare("PRAGMA table_info(fees)").all();
  const existing = new Set((info.results || []).map((r) => r.name));
  const additions = [
    ["payment_mode", "TEXT"],
    ["bank_name", "TEXT"],
    ["txn_utr_no", "TEXT"],
    ["bank_ref_no", "TEXT"],
    ["transaction_type", "TEXT"],
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      await env.DB.prepare(`ALTER TABLE fees ADD COLUMN ${name} ${type}`).run();
    }
  }
}

async function ensureTestsTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tests (
      test_id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS test_questions (
      question_id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      question_order INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'mcq',
      option_a TEXT,
      option_b TEXT,
      option_c TEXT,
      option_d TEXT,
      correct_answer TEXT,
      points INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (test_id) REFERENCES tests(test_id) ON DELETE CASCADE
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS test_assignments (
      test_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (test_id, student_id)
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS test_attempts (
      attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress',
      score REAL NOT NULL DEFAULT 0,
      total_points REAL NOT NULL DEFAULT 0,
      malpractice_count INTEGER NOT NULL DEFAULT 0,
      malpractice_flag INTEGER NOT NULL DEFAULT 0,
      question_order_json TEXT NOT NULL DEFAULT '[]',
      option_order_json TEXT NOT NULL DEFAULT '{}'
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS test_attempt_answers (
      answer_id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      answer_text TEXT,
      is_correct INTEGER NOT NULL DEFAULT 0,
      points_awarded REAL NOT NULL DEFAULT 0
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS test_malpractice_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
  const attemptCols = await env.DB.prepare("PRAGMA table_info(test_attempts)").all();
  const attemptExisting = new Set((attemptCols.results || []).map((c) => c.name));
  if (!attemptExisting.has("question_order_json")) {
    await env.DB.prepare("ALTER TABLE test_attempts ADD COLUMN question_order_json TEXT NOT NULL DEFAULT '[]'").run();
  }
  if (!attemptExisting.has("option_order_json")) {
    await env.DB.prepare("ALTER TABLE test_attempts ADD COLUMN option_order_json TEXT NOT NULL DEFAULT '{}'").run();
  }
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildAttemptQuestionPayload(questions, qOrder, oOrder, includeCorrect = false) {
  const byId = new Map();
  questions.forEach((q) => byId.set(Number(q.question_id), q));
  const orderedIds = Array.isArray(qOrder) && qOrder.length
    ? qOrder.map((x) => Number(x)).filter((x) => byId.has(x))
    : Array.from(byId.keys());
  return orderedIds.map((qid, idx) => {
    const q = byId.get(qid);
    const optionOrder = Array.isArray(oOrder?.[String(qid)]) && oOrder[String(qid)].length
      ? oOrder[String(qid)]
      : ["A", "B", "C", "D"];
    const optionText = {
      A: String(q.option_a || ""),
      B: String(q.option_b || ""),
      C: String(q.option_c || ""),
      D: String(q.option_d || ""),
    };
    const options = optionOrder
      .filter((k) => ["A", "B", "C", "D"].includes(String(k)))
      .map((k) => ({ key: String(k), text: optionText[String(k)] }));
    return {
      question_id: qid,
      question_order: idx + 1,
      question_text: q.question_text,
      options,
      correct_answer: includeCorrect ? q.correct_answer : undefined,
    };
  });
}

async function testsCreate(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureTestsTables(env);
  const body = await request.json();
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const durationMinutes = Math.max(5, Number(body.duration_minutes || 30));
  const questions = Array.isArray(body.questions) ? body.questions : [];
  const assignedStudents = Array.isArray(body.assigned_students) ? body.assigned_students : [];
  if (!title || !questions.length) throw httpError(400, "Invalid payload");
  const testRes = await env.DB.prepare(
    "INSERT INTO tests (title, description, duration_minutes, created_by) VALUES (?, ?, ?, ?)"
  ).bind(title, description, durationMinutes, session.user_id).run();
  const testId = Number(testRes.meta?.last_row_id || 0);
  let order = 1;
  for (const q of questions) {
    const qText = String(q.question_text || "").trim();
    const a = String(q.option_a || "").trim();
    const b = String(q.option_b || "").trim();
    const c = String(q.option_c || "").trim();
    const d = String(q.option_d || "").trim();
    const correct = String(q.correct_answer || "").trim().toUpperCase();
    if (!qText || !a || !b || !c || !d || !["A", "B", "C", "D"].includes(correct)) continue;
    await env.DB.prepare(
      `INSERT INTO test_questions
       (test_id, question_order, question_text, option_a, option_b, option_c, option_d, correct_answer, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(testId, order++, qText, a, b, c, d, correct, 1).run();
  }
  const finalIds = new Set();
  for (const s of assignedStudents) {
    const sid = String(s || "").trim();
    if (sid) finalIds.add(sid);
  }
  for (const sid of finalIds) {
    await env.DB.prepare("INSERT OR IGNORE INTO test_assignments (test_id, student_id) VALUES (?, ?)")
      .bind(testId, sid).run();
  }
  await writeActivity(
    env,
    session,
    "test_created",
    `Created test #${testId} (${title})`,
    { test_id: testId, title, question_count: order - 1, assigned_count: finalIds.size }
  );
  return json({ status: "ok", test_id: testId });
}

async function testsList(session, env) {
  await ensureTestsTables(env);
  if (isSuperuser(session)) {
    const rows = await env.DB.prepare(
      `SELECT
        t.test_id,
        t.title,
        t.duration_minutes,
        t.created_at,
        (SELECT COUNT(*) FROM test_questions q WHERE q.test_id = t.test_id) AS question_count,
        (SELECT COUNT(*) FROM test_assignments a WHERE a.test_id = t.test_id) AS assignment_count,
        (SELECT COUNT(*) FROM test_attempts x WHERE x.test_id = t.test_id) AS attempt_count,
        (SELECT COUNT(*) FROM test_attempts x WHERE x.test_id = t.test_id AND x.malpractice_flag = 1) AS malpractice_count
       FROM tests t
       WHERE t.is_active = 1
       ORDER BY t.test_id DESC`
    ).all();
    return json(rows.results || []);
  }
  const rows = await env.DB.prepare(
    `SELECT
      t.test_id,
      t.title,
      t.duration_minutes,
      (
        SELECT status FROM test_attempts x
        WHERE x.test_id = t.test_id AND x.student_id = ?
        ORDER BY x.attempt_id DESC LIMIT 1
      ) AS attempt_status
     FROM tests t
     WHERE t.is_active = 1
       AND (
         NOT EXISTS (SELECT 1 FROM test_assignments a WHERE a.test_id = t.test_id)
         OR EXISTS (SELECT 1 FROM test_assignments a WHERE a.test_id = t.test_id AND a.student_id = ?)
       )
     ORDER BY t.test_id DESC`
  ).bind(session.user_id, session.user_id).all();
  return json(rows.results || []);
}

async function testDetail(testId, session, env) {
  await ensureTestsTables(env);
  const test = await env.DB.prepare(
    "SELECT test_id, title, description, duration_minutes FROM tests WHERE test_id = ? AND is_active = 1"
  ).bind(testId).first();
  if (!test) throw httpError(404, "Test not found");
  if (!isSuperuser(session)) {
    const assigned = await env.DB.prepare(
      `SELECT 1 AS ok WHERE
         NOT EXISTS (SELECT 1 FROM test_assignments a WHERE a.test_id = ?)
         OR EXISTS (SELECT 1 FROM test_assignments a WHERE a.test_id = ? AND a.student_id = ?)`
    ).bind(testId, testId, session.user_id).first();
    if (!assigned) throw httpError(403, "Forbidden");
  }
  const qRows = await env.DB.prepare(
    `SELECT question_id, question_order, question_text, option_a, option_b, option_c, option_d, correct_answer
     FROM test_questions WHERE test_id = ? ORDER BY question_order ASC`
  ).bind(testId).all();
  const rows = qRows.results || [];
  const qOrder = rows.map((q) => Number(q.question_id));
  const oOrder = {};
  qOrder.forEach((qid) => { oOrder[String(qid)] = ["A", "B", "C", "D"]; });
  const questions = buildAttemptQuestionPayload(rows, qOrder, oOrder, isSuperuser(session));
  return json({ ...test, questions });
}

async function testStart(testId, session, env) {
  if (isSuperuser(session)) throw httpError(403, "Staff cannot take tests");
  await ensureTestsTables(env);
  const test = await env.DB.prepare(
    "SELECT test_id, title, duration_minutes FROM tests WHERE test_id = ? AND is_active = 1"
  ).bind(testId).first();
  if (!test) throw httpError(404, "Test not found");
  const assigned = await env.DB.prepare(
    `SELECT 1 AS ok WHERE
       NOT EXISTS (SELECT 1 FROM test_assignments a WHERE a.test_id = ?)
       OR EXISTS (SELECT 1 FROM test_assignments a WHERE a.test_id = ? AND a.student_id = ?)`
  ).bind(testId, testId, session.user_id).first();
  if (!assigned) throw httpError(403, "Forbidden");
  let attempt = await env.DB.prepare(
    `SELECT attempt_id, start_time, status, question_order_json, option_order_json
     FROM test_attempts WHERE test_id = ? AND student_id = ? AND status = 'in_progress'
     ORDER BY attempt_id DESC LIMIT 1`
  ).bind(testId, session.user_id).first();
  if (!attempt) {
    const ins = await env.DB.prepare(
      "INSERT INTO test_attempts (test_id, student_id, status) VALUES (?, ?, 'in_progress')"
    ).bind(testId, session.user_id).run();
    attempt = await env.DB.prepare(
      "SELECT attempt_id, start_time, status, question_order_json, option_order_json FROM test_attempts WHERE attempt_id = ?"
    ).bind(Number(ins.meta?.last_row_id || 0)).first();
    await writeActivity(
      env,
      session,
      "test_started",
      `Test attempt started (test #${testId})`,
      { test_id: testId, attempt_id: attempt?.attempt_id || 0, student_id: session.user_id }
    );
  }
  const qRows = await env.DB.prepare(
    `SELECT question_id, question_order, question_text, option_a, option_b, option_c, option_d, correct_answer
     FROM test_questions WHERE test_id = ? ORDER BY question_order ASC`
  ).bind(testId).all();
  const questions = qRows.results || [];
  let qOrder = [];
  let oOrder = {};
  try { qOrder = JSON.parse(String(attempt.question_order_json || "[]")); } catch (_) { qOrder = []; }
  try { oOrder = JSON.parse(String(attempt.option_order_json || "{}")); } catch (_) { oOrder = {}; }
  if (!Array.isArray(qOrder) || !qOrder.length) {
    qOrder = shuffleArray(questions.map((q) => Number(q.question_id)));
  }
  const qSet = new Set(questions.map((q) => Number(q.question_id)));
  const normalizedQOrder = qOrder.map((x) => Number(x)).filter((x) => qSet.has(x));
  questions.forEach((q) => {
    const qid = Number(q.question_id);
    if (!normalizedQOrder.includes(qid)) normalizedQOrder.push(qid);
    const existing = Array.isArray(oOrder[String(qid)]) ? oOrder[String(qid)] : [];
    const cleanExisting = existing.map((k) => String(k)).filter((k) => ["A", "B", "C", "D"].includes(k));
    oOrder[String(qid)] = cleanExisting.length === 4 ? cleanExisting : shuffleArray(["A", "B", "C", "D"]);
  });
  await env.DB.prepare(
    "UPDATE test_attempts SET question_order_json = ?, option_order_json = ? WHERE attempt_id = ?"
  ).bind(JSON.stringify(normalizedQOrder), JSON.stringify(oOrder), attempt.attempt_id).run();
  const ansRows = await env.DB.prepare(
    "SELECT question_id, answer_text FROM test_attempt_answers WHERE attempt_id = ?"
  ).bind(attempt.attempt_id).all();
  const answers = {};
  (ansRows.results || []).forEach((r) => {
    answers[r.question_id] = r.answer_text || "";
  });
  const startEpoch = Math.floor(new Date(`${String(attempt.start_time).replace(" ", "T")}Z`).getTime() / 1000);
  const endsAtEpoch = startEpoch + Number(test.duration_minutes || 30) * 60;
  const questionPayload = buildAttemptQuestionPayload(questions, normalizedQOrder, oOrder, false);
  return json({
    attempt_id: attempt.attempt_id,
    test_id: testId,
    title: test.title || "Test",
    status: attempt.status,
    ends_at_epoch: endsAtEpoch,
    answers,
    questions: questionPayload,
  });
}

async function testSubmit(attemptId, request, session, env) {
  if (isSuperuser(session)) throw httpError(403, "Staff cannot submit tests");
  await ensureTestsTables(env);
  const attempt = await env.DB.prepare(
    "SELECT attempt_id, test_id, student_id, status FROM test_attempts WHERE attempt_id = ?"
  ).bind(attemptId).first();
  if (!attempt) throw httpError(404, "Attempt not found");
  if (attempt.student_id !== session.user_id) throw httpError(403, "Forbidden");
  if (attempt.status === "submitted") throw httpError(400, "Already submitted");
  const body = await request.json();
  const answers = Array.isArray(body.answers) ? body.answers : [];
  await env.DB.prepare("DELETE FROM test_attempt_answers WHERE attempt_id = ?").bind(attemptId).run();
  const qRows = await env.DB.prepare(
    "SELECT question_id, correct_answer, points FROM test_questions WHERE test_id = ?"
  ).bind(attempt.test_id).all();
  const byId = new Map();
  (qRows.results || []).forEach((q) => byId.set(Number(q.question_id), q));
  let score = 0;
  let total = 0;
  for (const q of byId.values()) total += Number(q.points || 1);
  for (const item of answers) {
    const qid = Number(item.question_id || 0);
    if (!byId.has(qid)) continue;
    const q = byId.get(qid);
    const given = String(item.answer || "").trim().toUpperCase();
    const correct = String(q.correct_answer || "").trim().toUpperCase();
    const ok = given && given === correct;
    const points = ok ? Number(q.points || 1) : 0;
    score += points;
    await env.DB.prepare(
      "INSERT INTO test_attempt_answers (attempt_id, question_id, answer_text, is_correct, points_awarded) VALUES (?, ?, ?, ?, ?)"
    ).bind(attemptId, qid, given, ok ? 1 : 0, points).run();
  }
  await env.DB.prepare(
    "UPDATE test_attempts SET status = 'submitted', submitted_at = datetime('now'), score = ?, total_points = ? WHERE attempt_id = ?"
  ).bind(score, total, attemptId).run();
  await writeActivity(
    env,
    session,
    "test_submitted",
    `Test attempt submitted (attempt #${attemptId})`,
    { attempt_id: attemptId, test_id: attempt.test_id, score, total_points: total, student_id: session.user_id }
  );
  return json({ status: "ok", score, total_points: total });
}

async function testMalpractice(attemptId, request, session, env) {
  if (isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureTestsTables(env);
  const attempt = await env.DB.prepare(
    "SELECT attempt_id, student_id, malpractice_count, status FROM test_attempts WHERE attempt_id = ?"
  ).bind(attemptId).first();
  if (!attempt) throw httpError(404, "Attempt not found");
  if (attempt.student_id !== session.user_id) throw httpError(403, "Forbidden");
  if (attempt.status === "submitted") return json({ status: "ok", malpractice_count: Number(attempt.malpractice_count || 0), flagged: true });
  const body = await request.json();
  const eventType = String(body.event_type || "").trim() || "unknown";
  const details = String(body.details || "").trim();
  await env.DB.prepare(
    "INSERT INTO test_malpractice_events (attempt_id, event_type, details) VALUES (?, ?, ?)"
  ).bind(attemptId, eventType, details).run();
  const newCount = Number(attempt.malpractice_count || 0) + 1;
  await env.DB.prepare(
    "UPDATE test_attempts SET malpractice_count = ?, malpractice_flag = 1 WHERE attempt_id = ?"
  ).bind(newCount, attemptId).run();
  await writeActivity(
    env,
    session,
    "test_malpractice",
    `Malpractice flagged on attempt #${attemptId}`,
    { attempt_id: attemptId, event_type: eventType, details, student_id: session.user_id, count: newCount }
  );
  return json({ status: "ok", malpractice_count: newCount, flagged: true });
}

async function testAttemptsByTest(testId, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureTestsTables(env);
  const attempts = await env.DB.prepare(
    `SELECT
      attempt_id,
      test_id,
      student_id,
      start_time,
      submitted_at,
      status,
      score,
      total_points,
      malpractice_count,
      malpractice_flag
     FROM test_attempts
     WHERE test_id = ?
     ORDER BY attempt_id DESC`
  ).bind(testId).all();
  const rows = attempts.results || [];
  const out = [];
  for (const row of rows) {
    const events = await env.DB.prepare(
      `SELECT event_id, event_type, details, created_at
       FROM test_malpractice_events
       WHERE attempt_id = ?
       ORDER BY event_id ASC`
    ).bind(row.attempt_id).all();
    out.push({
      attempt_id: row.attempt_id,
      test_id: row.test_id,
      student_id: row.student_id,
      start_time: row.start_time,
      submitted_at: row.submitted_at,
      status: row.status,
      score: Number(row.score || 0),
      total_points: Number(row.total_points || 0),
      malpractice_count: Number(row.malpractice_count || 0),
      malpractice_flag: Number(row.malpractice_flag || 0) === 1,
      malpractice_events: events.results || [],
    });
  }
  return json(out);
}

async function listStudents(session, env) {
  let rows;
  if (isSuperuser(session)) {
    rows = await env.DB.prepare("SELECT * FROM students ORDER BY student_id DESC").all();
  } else {
    rows = await env.DB.prepare("SELECT * FROM students WHERE student_id = ? ORDER BY student_id DESC").bind(session.user_id).all();
  }
  const results = rows.results || [];
  const withFinancials = [];
  for (const row of results) {
    const sid = String(row.student_id || "");
    const info = sid ? await studentFinancials(env, sid) : null;
    if (!info) {
      withFinancials.push(row);
      continue;
    }
    withFinancials.push({
      ...row,
      fee_total: info.total,
      fee_paid: info.paid,
      fee_due: info.due,
      fee_concession: info.concession_amount,
      fee_due_date: info.due_date,
    });
  }
  return json(withFinancials);
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
  await writeActivity(
    env,
    session,
    "student_added",
    `Student added: ${studentName} (${sid})`,
    { student_id: sid, student_name: studentName, course, batch }
  );
  await ensureCredentials(env);
  return json({ status: "ok", message: "Student added", student_id: sid });
}

function normalizeStudentIds(rawIds) {
  if (!Array.isArray(rawIds)) return [];
  const unique = new Set();
  for (const value of rawIds) {
    const sid = String(value || "").trim();
    if (sid) unique.add(sid);
  }
  return Array.from(unique);
}

async function studentsBulkBatch(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const body = await request.json();
  const studentIds = normalizeStudentIds(body.student_ids);
  const batch = String(body.batch || "").trim();
  if (!studentIds.length || !batch) throw httpError(400, "Invalid payload");
  const previousBatches = {};
  for (const sid of studentIds) {
    const existing = await env.DB.prepare("SELECT batch FROM students WHERE student_id = ?")
      .bind(sid).first();
    if (existing && existing.batch) {
      previousBatches[sid] = String(existing.batch);
    }
    await env.DB.prepare("UPDATE students SET batch = ? WHERE student_id = ?")
      .bind(batch, sid).run();
    await env.DB.prepare("UPDATE attendance SET batch = ? WHERE student_id = ?")
      .bind(batch, sid).run();
  }
  await writeActivity(
    env,
    session,
    "students_batch_updated",
    `Moved ${studentIds.length} student(s) to batch ${batch}`,
    { student_ids: studentIds, batch, previous_batches: previousBatches }
  );
  return json({ status: "ok", updated: studentIds.length });
}

async function studentsMarkAlumni(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const body = await request.json();
  const studentIds = normalizeStudentIds(body.student_ids);
  if (!studentIds.length) throw httpError(400, "Invalid payload");
  const previousStatus = {};
  const updatedIds = [];
  const missingIds = [];
  for (const sid of studentIds) {
    const existing = await env.DB.prepare("SELECT status FROM students WHERE student_id = ?")
      .bind(sid).first();
    if (!existing) {
      missingIds.push(sid);
      continue;
    }
    previousStatus[sid] = String(existing?.status || "Active");
    await env.DB.prepare("UPDATE students SET status = 'Alumni' WHERE student_id = ?")
      .bind(sid).run();
    updatedIds.push(sid);
  }
  await writeActivity(
    env,
    session,
    "students_marked_alumni",
    `Marked ${updatedIds.length} student(s) as alumni`,
    { student_ids: updatedIds, previous_status: previousStatus, missing_ids: missingIds }
  );
  return json({ status: "ok", updated: updatedIds.length, updated_ids: updatedIds, missing_ids: missingIds });
}

async function studentsDelete(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const body = await request.json();
  const studentIds = normalizeStudentIds(body.student_ids);
  if (!studentIds.length) throw httpError(400, "Invalid payload");
  await ensureStudentPasswordsTable(env);
  const deletedSnapshots = [];
  for (const sid of studentIds) {
    const student = await env.DB.prepare(
      "SELECT student_id, student_name, course, batch, status FROM students WHERE student_id = ?"
    ).bind(sid).first();
    if (!student) continue;
    const attendanceRows = await env.DB.prepare(
      "SELECT student_name, course, batch, date, attendance_status, remarks, created_at FROM attendance WHERE student_id = ?"
    ).bind(sid).all();
    const feeRows = await env.DB.prepare(
      "SELECT amount_total, amount_paid, due_date, remarks, receipt_path, created_at FROM fees WHERE student_id = ?"
    ).bind(sid).all();
    deletedSnapshots.push({
      student,
      attendance: attendanceRows.results || [],
      fees: feeRows.results || [],
    });
    await env.DB.prepare("DELETE FROM attendance WHERE student_id = ?").bind(sid).run();
    await env.DB.prepare("DELETE FROM fees WHERE student_id = ?").bind(sid).run();
    await env.DB.prepare("DELETE FROM students WHERE student_id = ?").bind(sid).run();
    await env.DB.prepare("DELETE FROM credentials WHERE username = ?").bind(sid).run();
    await env.DB.prepare("DELETE FROM student_passwords WHERE student_id = ?").bind(sid).run();
  }
  await writeActivity(
    env,
    session,
    "students_deleted",
    `Deleted ${deletedSnapshots.length} student(s)`,
    { students: deletedSnapshots }
  );
  return json({ status: "ok", deleted: deletedSnapshots.length });
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
    concession_amount: info.concession_amount,
    due_date: info.due_date,
    gst_percent: 18,
  });
}

async function studentPassword(studentId, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const student = await env.DB.prepare("SELECT student_id FROM students WHERE student_id = ?")
    .bind(studentId).first();
  if (!student) throw httpError(404, "Student not found");
  const pwd = await ensureStudentPassword(env, String(studentId));
  await env.DB.prepare(
    "INSERT INTO credentials (username, password, role) VALUES (?, ?, 'student') ON CONFLICT(username) DO UPDATE SET password = excluded.password, role = 'student'"
  ).bind(studentId, await hashPassword(pwd)).run();
  return json({ student_id: studentId, password: pwd });
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
    "SELECT fee_id, amount_total, amount_paid, due_date, remarks, created_at FROM fees WHERE student_id = ? ORDER BY fee_id DESC"
  ).bind(studentId).all();
  return json(rows.results || []);
}

async function studentProfileGet(studentId, session, env) {
  ensureSelfOrSuperuser(session, studentId);
  await ensureProfileTables(env);
  
  // Get profile data
  const profileRow = await env.DB.prepare(`
    SELECT student_phone, student_email, aadhaar_number, pan_number, blood_group, religion, mother_tongue, address_details,
           parent_name, parent_occupation, parent_aadhaar, parent_qualification, parent_office_address, parent_office_phone, parent_email, parent_address,
           guardian_name, guardian_relation, guardian_phone, guardian_aadhaar, guardian_email, guardian_address
    FROM student_profiles
    WHERE student_id = ?
  `).bind(studentId).first();
  
  const profileData = profileRow || {};
  
  // Get files
  const filesRows = await env.DB.prepare(`
    SELECT file_type, file_name, mime_type, length(file_data) as file_size
    FROM profile_files
    WHERE student_id = ?
    ORDER BY uploaded_at DESC
  `).bind(studentId).all();
  
  const files = {};
  for (const row of filesRows.results || []) {
    files[row.file_type] = {
      available: true,
      bytes: row.file_size,
      filename: row.file_name,
      mime_type: row.mime_type
    };
  }
  
  return json({ ...profileData, files });
}

async function studentProfileSave(studentId, request, session, env) {
  ensureSelfOrSuperuser(session, studentId);
  await ensureProfileTables(env);
  
  const formData = await request.formData();
  const payload = {};
  
  // Extract text fields
  const textFields = [
    'student_phone', 'student_email', 'aadhaar_number', 'pan_number', 'blood_group', 'religion', 'mother_tongue', 'address_details',
    'parent_name', 'parent_occupation', 'parent_aadhaar', 'parent_qualification', 'parent_office_address', 'parent_office_phone', 'parent_email', 'parent_address',
    'guardian_name', 'guardian_relation', 'guardian_phone', 'guardian_aadhaar', 'guardian_email', 'guardian_address'
  ];
  
  for (const field of textFields) {
    payload[field] = formData.get(field) || null;
  }
  
  // Upsert profile data
  await env.DB.prepare(`
    INSERT OR REPLACE INTO student_profiles 
    (student_id, student_phone, student_email, aadhaar_number, pan_number, blood_group, religion, mother_tongue, address_details,
     parent_name, parent_occupation, parent_aadhaar, parent_qualification, parent_office_address, parent_office_phone, parent_email, parent_address,
     guardian_name, guardian_relation, guardian_phone, guardian_aadhaar, guardian_email, guardian_address, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    studentId,
    payload.student_phone, payload.student_email, payload.aadhaar_number, payload.pan_number, payload.blood_group, payload.religion, payload.mother_tongue, payload.address_details,
    payload.parent_name, payload.parent_occupation, payload.parent_aadhaar, payload.parent_qualification, payload.parent_office_address, payload.parent_office_phone, payload.parent_email, payload.parent_address,
    payload.guardian_name, payload.guardian_relation, payload.guardian_phone, payload.guardian_aadhaar, payload.guardian_email, payload.guardian_address
  ).run();
  
  // Handle file uploads
  const fileFields = [
    'student_photo', 'parent_photo', 'guardian_photo', 'admission_form', 'pan_card', 'aadhaar_card'
  ];
  
  for (const fileType of fileFields) {
    const file = formData.get(`${fileType}_base64`);
    const filename = formData.get(`${fileType}_filename`);
    const mimeType = formData.get(`${fileType}_type`);
    
    if (file) {
      const fileData = decodeBase64ToBytes(file);
      
      // Delete existing file of this type
      await env.DB.prepare("DELETE FROM profile_files WHERE student_id = ? AND file_type = ?").bind(studentId, fileType).run();
      
      // Insert new file
      await env.DB.prepare(`
        INSERT INTO profile_files (student_id, file_type, file_name, file_data, mime_type)
        VALUES (?, ?, ?, ?, ?)
      `).bind(studentId, fileType, filename, fileData, mimeType).run();
    }
  }
  
  return json({ status: "ok", message: "Profile updated successfully" });
}

async function studentProfileFile(studentId, fileType, session, env) {
  ensureSelfOrSuperuser(session, studentId);
  await ensureProfileTables(env);
  
  const row = await env.DB.prepare(`
    SELECT file_name, file_data, mime_type
    FROM profile_files
    WHERE student_id = ? AND file_type = ?
    ORDER BY uploaded_at DESC
    LIMIT 1
  `).bind(studentId, fileType).first();
  
  if (!row) {
    throw httpError(404, "File not found");
  }
  
  return new Response(row.file_data, {
    headers: {
      "Content-Type": row.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${row.file_name || `${fileType}.bin`}"`,
    },
  });
}

function parseRazorpayRemarks(remarks) {
  const text = String(remarks || "");
  const paymentMatch = text.match(/payment_id=([A-Za-z0-9_]+)/i);
  const orderMatch = text.match(/order_id=([A-Za-z0-9_]+)/i);
  return {
    payment_id: paymentMatch ? paymentMatch[1] : "",
    order_id: orderMatch ? orderMatch[1] : "",
  };
}

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(`${normalized}${normalized.endsWith("Z") ? "" : "Z"}`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function feeInvoice(feeId, session, env) {
  await ensureFeeReceiptColumns(env);
  const row = await env.DB.prepare(
    `SELECT
      f.fee_id,
      f.student_id,
      f.amount_total,
      f.amount_paid,
      f.remarks,
      f.payment_mode,
      f.bank_name,
      f.txn_utr_no,
      f.bank_ref_no,
      f.transaction_type,
      f.created_at,
      s.student_name,
      s.course
    FROM fees f
    LEFT JOIN students s ON s.student_id = f.student_id
    WHERE f.fee_id = ?`
  ).bind(feeId).first();
  if (!row) throw httpError(404, "Fee entry not found");
  ensureSelfOrSuperuser(session, String(row.student_id || ""));
  const refs = parseRazorpayRemarks(row.remarks);
  const financials = await studentFinancials(env, String(row.student_id || ""));
  const defaultDue = Math.max(Number(row.amount_total || 0) - Number(row.amount_paid || 0), 0);
  return json({
    invoice: {
      invoice_no: `AAI-INV-${Number(row.fee_id || feeId)}`,
      date: toIsoDate(row.created_at),
      student_id: row.student_id || "",
      student_name: row.student_name || "",
      course: row.course || "",
      payment_id: refs.payment_id,
      order_id: refs.order_id,
      payment_mode: row.payment_mode || "",
      bank_name: row.bank_name || "",
      txn_utr_no: row.txn_utr_no || "",
      bank_ref_no: row.bank_ref_no || "",
      transaction_type: row.transaction_type || "",
      amount_paid: Number(row.amount_paid || 0),
      amount_total: Number(row.amount_total || 0),
      balance_due: financials ? Number(financials.due || 0) : defaultDue,
      concession_amount: financials ? Number(financials.concession_amount || 0) : 0,
    },
  });
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

async function attendanceMonth(url, session, env) {
  const month = String(url.searchParams.get("month") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw httpError(400, "Invalid month");
  const [year, mon] = month.split("-").map(Number);
  const start = `${year}-${String(mon).padStart(2, "0")}-01`;
  const next = mon === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
  if (isSuperuser(session)) {
    const rows = await env.DB.prepare(
      `SELECT date,
        SUM(CASE WHEN attendance_status = 'Present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN attendance_status = 'Absent' THEN 1 ELSE 0 END) AS absent
       FROM attendance
       WHERE date >= ? AND date < ?
       GROUP BY date`
    ).bind(start, next).all();
    return json({ mode: "staff", month, days: rows.results || [] });
  }
  const rows = await env.DB.prepare(
    `SELECT date, attendance_status AS status
     FROM attendance
     WHERE student_id = ? AND date >= ? AND date < ?`
  ).bind(session.user_id, start, next).all();
  return json({ mode: "student", month, days: rows.results || [] });
}

async function parentLinkCreate(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureParentLinksTable(env);
  const b = await request.json().catch(() => ({}));
  const studentId = String(b.student_id || "").trim();
  const days = Math.max(1, Math.min(Number(b.days || 30), 365));
  if (!studentId) throw httpError(400, "student_id is required");
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  })();
  await env.DB.prepare(
    "INSERT INTO parent_links (token, student_id, expires_at, created_by) VALUES (?, ?, ?, ?)"
  ).bind(token, studentId, expiresAt, session.user_id).run();
  return json({ status: "ok", token, student_id: studentId, expires_at: expiresAt });
}

async function parentSummary(url, env) {
  await ensureParentLinksTable(env);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!token) throw httpError(400, "token is required");
  const link = await env.DB.prepare(
    "SELECT student_id, expires_at FROM parent_links WHERE token = ?"
  ).bind(token).first();
  if (!link) throw httpError(404, "Link not found");
  if (link.expires_at && String(link.expires_at) < new Date().toISOString().slice(0, 10)) {
    throw httpError(410, "Link expired");
  }
  const studentId = String(link.student_id || "");
  const student = await env.DB.prepare(
    "SELECT student_id, student_name, course, batch FROM students WHERE student_id = ?"
  ).bind(studentId).first();
  if (!student) throw httpError(404, "Student not found");
  const financials = await studentFinancials(env, studentId);
  const attendance = await env.DB.prepare(
    "SELECT date, attendance_status, remarks FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 10"
  ).bind(studentId).all();
  return json({
    student,
    fees: financials ? { total: financials.total, paid: financials.paid, due: financials.due, due_date: financials.due_date } : null,
    attendance: attendance.results || [],
  });
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
  const todayIso = new Date().toISOString().slice(0, 10);
  if (date > todayIso) throw httpError(400, "Future attendance dates are not allowed");
  const stmt = env.DB.prepare(
    "INSERT OR REPLACE INTO attendance (student_id, student_name, course, batch, date, attendance_status, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertedStudentIds = [];
  for (const r of records) {
    const normalizedStatus = normalizeAttendanceStatus(String(r.attendance_status || "A"));
    const result = await stmt.bind(
      String(r.student_id || ""),
      String(r.student_name || ""),
      String(r.course || ""),
      String(r.batch || ""),
      date,
      normalizedStatus,
      String(r.remarks || "")
    ).run();
    if (result.success && Number(result.meta?.changes || 0) > 0) {
      insertedStudentIds.push(String(r.student_id || ""));
    }
  }
  await writeActivity(
    env,
    session,
    "attendance_recorded",
    `Attendance recorded for ${date} (${insertedStudentIds.length} entries)`,
    { date, student_ids: insertedStudentIds }
  );
  return json({ status: "ok", message: "Attendance recorded", count: records.length });
}

async function attendanceUpdate(request, session, env) {
  if (!isSuperuser(session) && session.role !== "staff") throw httpError(403, "Forbidden");
  const body = await request.json();
  const studentId = String(body.student_id || "").trim();
  const date = String(body.date || "").trim();
  const status = String(body.attendance_status || "").trim();
  const remarks = String(body.remarks || "").trim();

  if (!studentId || !date || !status) {
    throw httpError(400, "student_id, date, and attendance_status are required");
  }

  const normalizedStatus = normalizeAttendanceStatus(status);

  // Check if record exists
  const existing = await env.DB.prepare("SELECT student_name FROM attendance WHERE student_id = ? AND date = ?")
    .bind(studentId, date).first();

  if (!existing) {
    throw httpError(404, "Attendance record not found for this date");
  }

  const result = await env.DB.prepare(
    "UPDATE attendance SET attendance_status = ?, remarks = ? WHERE student_id = ? AND date = ?"
  ).bind(normalizedStatus, remarks, studentId, date).run();

  await writeActivity(
    env,
    session,
    "attendance_updated",
    `Attendance updated for ${existing.student_name} (${studentId}) on ${date}`,
    { student_id: studentId, date, status: normalizedStatus }
  );

  return json({ status: "ok", message: "Attendance updated" });
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

  await writeActivity(
    env,
    session,
    "attendance_synced_csv",
    `Attendance synced from CSV (${inserted} inserted, ${skipped} skipped)`,
    { inserted, skipped, source_key: key }
  );

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
    rows = await env.DB.prepare("SELECT fee_id, student_id, amount_total, amount_paid, due_date, remarks, created_at FROM fees ORDER BY fee_id DESC LIMIT 20").all();
  } else {
    rows = await env.DB.prepare("SELECT fee_id, student_id, amount_total, amount_paid, due_date, remarks, created_at FROM fees WHERE student_id = ? ORDER BY fee_id DESC LIMIT 20").bind(session.user_id).all();
  }
  return json(rows.results || []);
}

async function feesSummary(session, env) {
  if (isSuperuser(session)) {
    const students = await env.DB.prepare("SELECT student_id FROM students").all();
    let total = 0;
    let paid = 0;
    for (const row of students.results || []) {
      const info = await studentFinancials(env, String(row.student_id || ""));
      if (!info) continue;
      total += Number(info.total || 0);
      paid += Number(info.paid || 0);
    }
    const txRow = await env.DB.prepare("SELECT COUNT(*) AS transactions FROM fees").first();
    return json({ total, paid, due: total - paid, transactions: Number(txRow.transactions || 0) });
  }
  const info = await studentFinancials(env, session.user_id);
  if (!info) return json({ total: 0, paid: 0, due: 0, transactions: 0 });
  return json({
    total: info.total,
    paid: info.paid,
    due: info.due,
    transactions: info.transactions,
    course: info.student.course,
    concession_amount: info.concession_amount,
    due_date: info.due_date,
    gst_percent: 18,
  });
}

async function feesRecord(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const form = await request.formData();
  const studentId = String(form.get("student_id") || "");
  const amountPaid = Number(form.get("amount_paid") || 0);
  const paymentMode = String(form.get("payment_mode") || "").trim().toUpperCase();
  let bankName = String(form.get("bank_name") || "").trim();
  let txnUtrNo = String(form.get("txn_utr_no") || "").trim();
  let bankRefNo = String(form.get("bank_ref_no") || "").trim();
  let transactionType = String(form.get("transaction_type") || "").trim().toUpperCase();
  const info = await studentFinancials(env, studentId);
  if (!info) throw httpError(404, "Student not found");
  const amountTotal = Number(form.get("amount_total") || info.total || amountPaid);
  const dueDate = String(form.get("due_date") || "");
  const remarks = String(form.get("remarks") || "");
  if (!studentId || amountPaid <= 0) throw httpError(400, "Invalid fee payload");
  await ensureFeeReceiptColumns(env);
  const mode = paymentMode || "OFFLINE";
  if (!transactionType) transactionType = mode;
  if (!bankName) bankName = mode === "CASH" ? "Cash" : (mode === "ONLINE" ? "Razorpay" : "NA");
  if (!txnUtrNo) txnUtrNo = "NA";
  if (!bankRefNo) bankRefNo = "NA";
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
  const result = await env.DB.prepare(
    "INSERT INTO fees (student_id, amount_total, amount_paid, due_date, remarks, receipt_path, payment_mode, bank_name, txn_utr_no, bank_ref_no, transaction_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(studentId, amountTotal, amountPaid, dueDate || null, remarks, receiptPath, mode, bankName, txnUtrNo, bankRefNo, transactionType).run();
  const feeId = Number(result.meta?.last_row_id || 0);
  await writeActivity(
    env,
    session,
    "fee_recorded",
    `Fee recorded for ${studentId} (INR ${amountPaid})`,
    { fee_id: feeId, student_id: studentId, amount_paid: amountPaid }
  );
  return json({ status: "ok", message: "Fee recorded", fee_id: feeId });
}

async function feesReminders(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const body = await request.json().catch(() => ({}));
  const days = Math.max(1, Math.min(Number(body.days || 7), 30));
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  })();
  const students = await env.DB.prepare("SELECT student_id FROM students").all();
  let sent = 0;
  for (const row of students.results || []) {
    const sid = String(row.student_id || "");
    if (!sid) continue;
    const info = await studentFinancials(env, sid);
    if (!info) continue;
    const due = Number(info.due || 0);
    const dueDate = String(info.due_date || "").trim();
    if (!dueDate || due <= 0) continue;
    if (dueDate < today || dueDate > maxDate) continue;
    const title = "Fee Reminder";
    const message = `Your fee balance is INR ${due}. Due date: ${dueDate}.`;
    await env.DB.prepare(
      "INSERT INTO notifications (title, message, level, target_user) VALUES (?, ?, ?, ?)"
    ).bind(title, message, "info", sid).run();
    sent += 1;
  }
  await writeActivity(env, session, "fee_reminders_sent", `Sent ${sent} fee reminders`, { days, sent });
  return json({ status: "ok", sent, days });
}

async function feesPoliciesList(session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureFeePoliciesTable(env);
  const rows = await env.DB.prepare(
    "SELECT student_id, concession_amount, due_date, updated_at FROM fee_policies ORDER BY student_id ASC"
  ).all();
  return json(rows.results || []);
}

async function feesCategoriesList(session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  return json(await listTrainingCategories(env));
}

async function feesCategoryUpsert(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureTrainingCategoriesTable(env);
  const b = await request.json().catch(() => ({}));
  const categoryName = String(b.category_name || "").trim();
  if (!categoryName) throw httpError(400, "category_name is required");
  const feeAmount = Math.max(Number(b.fee_amount || 0), 0);
  const categoryKey = normalizeTrainingCategory(categoryName);
  await env.DB.prepare(
    `INSERT INTO training_categories (category_key, category_name, fee_amount, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(category_key) DO UPDATE SET
       category_name = excluded.category_name,
       fee_amount = excluded.fee_amount,
       updated_at = datetime('now')`
  ).bind(categoryKey, categoryName, feeAmount).run();
  const row = await env.DB.prepare(
    "SELECT category_key, category_name, fee_amount, updated_at FROM training_categories WHERE category_key = ?"
  ).bind(categoryKey).first();
  await writeActivity(
    env,
    session,
    "training_category_fee_updated",
    `Updated training category fee for ${categoryName}`,
    { category_key: categoryKey, category_name: categoryName, fee_amount: feeAmount }
  );
  return json(row || {
    category_key: categoryKey,
    category_name: categoryName,
    fee_amount: feeAmount,
    updated_at: null,
  });
}

async function feesPolicyUpsert(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureFeePoliciesTable(env);
  const b = await request.json();
  const studentId = String(b.student_id || "").trim();
  if (!studentId) throw httpError(400, "student_id is required");
  const infoBefore = await studentFinancials(env, studentId);
  if (!infoBefore) throw httpError(404, "Student not found");
  const rawDiscount = b.discount_amount ?? b.concession_amount ?? 0;
  let concessionAmount = Math.max(Number(rawDiscount || 0), 0);
  concessionAmount = Math.min(concessionAmount, Math.max(Number(infoBefore.base_total || 0), 0));
  let dueDate = String(b.due_date || "").trim();
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw httpError(400, "due_date must be YYYY-MM-DD");
  if (!dueDate) dueDate = null;
  await env.DB.prepare(
    `INSERT INTO fee_policies (student_id, concession_amount, due_date, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(student_id) DO UPDATE SET
       concession_amount = excluded.concession_amount,
       due_date = excluded.due_date,
       updated_at = datetime('now')`
  ).bind(studentId, concessionAmount, dueDate).run();
  const infoAfter = await studentFinancials(env, studentId);
  await writeActivity(
    env,
    session,
    "fee_policy_updated",
    `Updated fee policy for ${studentId}`,
    { student_id: studentId, concession_amount: concessionAmount, discount_amount: concessionAmount, due_date: dueDate }
  );
  return json({
    status: "ok",
    student_id: studentId,
    concession_amount: infoAfter?.concession_amount || 0,
    discount_amount: infoAfter?.concession_amount || 0,
    due_date: infoAfter?.due_date || null,
    total: infoAfter?.total || 0,
    due: infoAfter?.due || 0,
  });
}

async function feesResetUnpaid(session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureFeePoliciesTable(env);
  const students = await env.DB.prepare("SELECT student_id, course FROM students ORDER BY student_id ASC").all();
  const feeMax = await env.DB.prepare(
    "SELECT student_id, COALESCE(MAX(amount_total),0) AS max_total FROM fees GROUP BY student_id"
  ).all();
  const maxByStudent = new Map((feeMax.results || []).map((r) => [String(r.student_id), Number(r.max_total || 0)]));
  const policies = await env.DB.prepare(
    "SELECT student_id, concession_amount, due_date FROM fee_policies"
  ).all();
  const policyByStudent = new Map((policies.results || []).map((r) => [String(r.student_id), r]));

  await env.DB.prepare("DELETE FROM fees").run();

  let inserted = 0;
  for (const s of students.results || []) {
    const sid = String(s.student_id || "");
    const planned = await courseFeeInr(env, s.course);
    const baseTotal = Number(planned ?? maxByStudent.get(sid) ?? 0);
    const policy = policyByStudent.get(sid);
    const concession = Math.min(Math.max(Number(policy?.concession_amount || 0), 0), Math.max(baseTotal, 0));
    const effectiveTotal = Math.max(baseTotal - concession, 0);
    const dueDate = policy?.due_date || null;
    await env.DB.prepare(
      "INSERT INTO fees (student_id, amount_total, amount_paid, due_date, remarks) VALUES (?, ?, 0, ?, ?)"
    ).bind(sid, effectiveTotal, dueDate, "Fee reset to unpaid by staff").run();
    inserted += 1;
  }

  await writeActivity(
    env,
    session,
    "fees_reset_unpaid",
    `Reset fees to 100% unpaid for ${inserted} students`,
    { students_count: inserted }
  );
  return json({ status: "ok", message: `Reset to unpaid for ${inserted} students`, students_count: inserted });
}

async function reportsSummary(session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const students = await env.DB.prepare("SELECT COUNT(*) AS c FROM students").first();
  const allStudents = await env.DB.prepare("SELECT student_id FROM students").all();
  let total = 0;
  let paid = 0;
  for (const row of allStudents.results || []) {
    const info = await studentFinancials(env, String(row.student_id || ""));
    if (!info) continue;
    total += Number(info.total || 0);
    paid += Number(info.paid || 0);
  }
  const attendance = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN lower(attendance_status) IN ('present','p') THEN 1 ELSE 0 END),0) AS present, COALESCE(SUM(CASE WHEN lower(attendance_status) IN ('absent','a') THEN 1 ELSE 0 END),0) AS absent FROM attendance").first();
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
  const result = await env.DB.prepare("INSERT INTO timetable (title, day_of_week, start_time, end_time, course, batch, location, instructor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(b.title || "", b.day_of_week || "", b.start_time || "", b.end_time || "", b.course || "", b.batch || "", b.location || "", b.instructor || "").run();
  await writeActivity(
    env,
    session,
    "timetable_created",
    `Timetable entry added: ${String(b.title || "").trim() || "Untitled"} (${String(b.day_of_week || "").trim()})`,
    { timetable_id: Number(result.meta?.last_row_id || 0), ...b }
  );
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
  const result = await env.DB.prepare("INSERT INTO interview_stats (airline_name, interview_date, notes) VALUES (?, ?, ?)")
    .bind(b.airline_name || "", b.interview_date || "", b.notes || "").run();
  await writeActivity(
    env,
    session,
    "interview_created",
    `Interview record added: ${String(b.airline_name || "").trim()} (${String(b.interview_date || "").trim()})`,
    { interview_id: Number(result.meta?.last_row_id || 0), ...b }
  );
  return json({ status: "ok", message: "Interview stat created" });
}

async function announcementsList(env) {
  const rows = await env.DB.prepare("SELECT * FROM announcements ORDER BY announcement_id DESC LIMIT 20").all();
  return json(rows.results || []);
}

async function announcementsCreate(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  const b = await request.json();
  const result = await env.DB.prepare("INSERT INTO announcements (title, message, created_by) VALUES (?, ?, ?)")
    .bind(b.title || "", b.message || "", session.user_id).run();
  await writeActivity(
    env,
    session,
    "announcement_created",
    `Announcement posted: ${String(b.title || "").trim()}`,
    { announcement_id: Number(result.meta?.last_row_id || 0), title: b.title || "" }
  );
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
  const result = await env.DB.prepare("INSERT INTO notifications (title, message, level, target_user) VALUES (?, ?, ?, ?)")
    .bind(b.title || "", b.message || "", b.level || "info", b.target_user || null).run();
  await writeActivity(
    env,
    session,
    "notification_created",
    `Notification created: ${String(b.title || "").trim()}`,
    {
      notification_id: Number(result.meta?.last_row_id || 0),
      title: b.title || "",
      target_user: b.target_user || null,
      level: b.level || "info",
    }
  );
  return json({ status: "ok", message: "Notification created" });
}

async function notificationsRead(notificationId, session, env) {
  await env.DB.prepare("INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)")
    .bind(notificationId, session.user_id).run();
  return json({ status: "ok" });
}

async function activityLogs(session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureActivityTable(env);
  const rows = await env.DB.prepare(
    "SELECT activity_id, action_type, description, payload_json, created_by, created_at, undone, undone_at FROM activity_log ORDER BY activity_id DESC LIMIT 200"
  ).all();
  const data = (rows.results || []).map((r) => {
    let payload = {};
    try { payload = JSON.parse(r.payload_json || "{}"); } catch (_) {}
    return {
      activity_id: r.activity_id,
      action_type: r.action_type,
      description: r.description,
      payload,
      created_by: r.created_by,
      created_at: r.created_at,
      undone: Boolean(r.undone),
      undone_at: r.undone_at,
      undoable: !r.undone && [
        "student_added",
        "students_batch_updated",
        "students_marked_alumni",
        "students_deleted",
        "admission_deleted",
        "attendance_recorded",
        "fee_recorded",
        "timetable_created",
        "interview_created",
        "announcement_created",
        "notification_created",
        "admission_submitted",
      ].includes(r.action_type),
    };
  });
  return json(data);
}

async function activityUndo(request, session, env) {
  if (!isSuperuser(session)) throw httpError(403, "Forbidden");
  await ensureActivityTable(env);
  const body = await request.json();
  const logId = Number(body.activity_id || 0);
  if (!logId) throw httpError(400, "activity_id is required");

  const row = await env.DB.prepare(
    "SELECT activity_id, action_type, payload_json, undone FROM activity_log WHERE activity_id = ?"
  ).bind(logId).first();
  if (!row) throw httpError(404, "Activity not found");
  if (Number(row.undone || 0) === 1) throw httpError(400, "Already undone");
  let payload = {};
  try { payload = JSON.parse(row.payload_json || "{}"); } catch (_) {}

  if (row.action_type === "student_added") {
    const sid = String(payload.student_id || "");
    if (!sid) throw httpError(400, "Undo payload missing student_id");
    await env.DB.prepare("DELETE FROM students WHERE student_id = ?").bind(sid).run();
    await env.DB.prepare("DELETE FROM credentials WHERE username = ?").bind(sid).run();
  } else if (row.action_type === "students_batch_updated") {
    const ids = Array.isArray(payload.student_ids) ? payload.student_ids : [];
    const previous = payload.previous_batches && typeof payload.previous_batches === "object"
      ? payload.previous_batches
      : {};
    if (!ids.length) throw httpError(400, "Undo payload missing student_ids");
    for (const sid of ids) {
      const prev = String(previous[String(sid)] || "").trim();
      if (!prev) continue;
      await env.DB.prepare("UPDATE students SET batch = ? WHERE student_id = ?")
        .bind(prev, String(sid)).run();
      await env.DB.prepare("UPDATE attendance SET batch = ? WHERE student_id = ?")
        .bind(prev, String(sid)).run();
    }
  } else if (row.action_type === "students_marked_alumni") {
    const ids = Array.isArray(payload.student_ids) ? payload.student_ids : [];
    const previous = payload.previous_status && typeof payload.previous_status === "object"
      ? payload.previous_status
      : {};
    if (!ids.length) throw httpError(400, "Undo payload missing student_ids");
    for (const sid of ids) {
      const status = String(previous[String(sid)] || "Active").trim() || "Active";
      await env.DB.prepare("UPDATE students SET status = ? WHERE student_id = ?")
        .bind(status, String(sid)).run();
    }
  } else if (row.action_type === "students_deleted") {
    const snapshots = Array.isArray(payload.students) ? payload.students : [];
    if (!snapshots.length) throw httpError(400, "Undo payload missing students");
    for (const snap of snapshots) {
      const student = snap && snap.student ? snap.student : null;
      if (!student || !student.student_id) continue;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO students (student_id, student_name, course, batch, status)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        String(student.student_id || ""),
        String(student.student_name || ""),
        String(student.course || ""),
        String(student.batch || ""),
        String(student.status || "Active")
      ).run();
      const attendanceRows = Array.isArray(snap.attendance) ? snap.attendance : [];
      for (const rowAttendance of attendanceRows) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO attendance
           (student_id, student_name, course, batch, date, attendance_status, remarks, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          String(student.student_id || ""),
          String(rowAttendance.student_name || student.student_name || ""),
          String(rowAttendance.course || student.course || ""),
          String(rowAttendance.batch || student.batch || ""),
          String(rowAttendance.date || ""),
          String(rowAttendance.attendance_status || "A"),
          String(rowAttendance.remarks || ""),
          String(rowAttendance.created_at || "")
        ).run();
      }
      const feeRows = Array.isArray(snap.fees) ? snap.fees : [];
      for (const rowFee of feeRows) {
        await env.DB.prepare(
          `INSERT INTO fees (student_id, amount_total, amount_paid, due_date, remarks, receipt_path, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          String(student.student_id || ""),
          Number(rowFee.amount_total || 0),
          Number(rowFee.amount_paid || 0),
          String(rowFee.due_date || ""),
          String(rowFee.remarks || ""),
          String(rowFee.receipt_path || ""),
          String(rowFee.created_at || "")
        ).run();
      }
    }
    await ensureCredentials(env);
  } else if (row.action_type === "attendance_recorded") {
    const date = String(payload.date || "");
    const ids = Array.isArray(payload.student_ids) ? payload.student_ids : [];
    if (!date || !ids.length) throw httpError(400, "Undo payload missing attendance details");
    for (const sid of ids) {
      await env.DB.prepare("DELETE FROM attendance WHERE student_id = ? AND date = ?").bind(String(sid), date).run();
    }
  } else if (row.action_type === "fee_recorded") {
    const feeId = Number(payload.fee_id || 0);
    if (!feeId) throw httpError(400, "Undo payload missing fee_id");
    await env.DB.prepare("DELETE FROM fees WHERE fee_id = ?").bind(feeId).run();
  } else if (row.action_type === "timetable_created") {
    const timetableId = Number(payload.timetable_id || 0);
    if (!timetableId) throw httpError(400, "Undo payload missing timetable_id");
    await env.DB.prepare("DELETE FROM timetable WHERE timetable_id = ?").bind(timetableId).run();
  } else if (row.action_type === "interview_created") {
    const interviewId = Number(payload.interview_id || 0);
    if (!interviewId) throw httpError(400, "Undo payload missing interview_id");
    await env.DB.prepare("DELETE FROM interview_stats WHERE interview_id = ?").bind(interviewId).run();
  } else if (row.action_type === "announcement_created") {
    const announcementId = Number(payload.announcement_id || 0);
    if (!announcementId) throw httpError(400, "Undo payload missing announcement_id");
    await env.DB.prepare("DELETE FROM announcements WHERE announcement_id = ?").bind(announcementId).run();
  } else if (row.action_type === "notification_created") {
    const notificationId = Number(payload.notification_id || 0);
    if (!notificationId) throw httpError(400, "Undo payload missing notification_id");
    await env.DB.prepare("DELETE FROM notifications WHERE notification_id = ?").bind(notificationId).run();
  } else if (row.action_type === "admission_submitted") {
    const admissionId = Number(payload.admission_id || 0);
    if (!admissionId) throw httpError(400, "Undo payload missing admission_id");
    await ensureAdmissionsTable(env);
    await env.DB.prepare("DELETE FROM admissions WHERE admission_id = ?").bind(admissionId).run();
  } else if (row.action_type === "admission_deleted") {
    const admission = payload && typeof payload.admission === "object" ? payload.admission : null;
    if (!admission || !admission.admission_id) throw httpError(400, "Undo payload missing admission");
    await ensureAdmissionsTable(env);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO admissions (
        admission_id, full_name, first_name, middle_name, last_name, phone, email, blood_group, age, dob,
        aadhaar_number, nationality, father_name, father_phone, father_occupation, father_email,
        mother_name, mother_phone, mother_occupation, mother_email, correspondence_address,
        permanent_address, course, academic_details_json, admission_pdf_r2_key, admission_pdf_bytes,
        admission_photo_r2_key, admission_photo_bytes, admission_photo_type, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      Number(admission.admission_id || 0),
      String(admission.full_name || ""),
      String(admission.first_name || ""),
      String(admission.middle_name || ""),
      String(admission.last_name || ""),
      String(admission.phone || ""),
      String(admission.email || ""),
      String(admission.blood_group || ""),
      Number(admission.age || 0),
      String(admission.dob || ""),
      String(admission.aadhaar_number || ""),
      String(admission.nationality || ""),
      String(admission.father_name || ""),
      String(admission.father_phone || ""),
      String(admission.father_occupation || ""),
      String(admission.father_email || ""),
      String(admission.mother_name || ""),
      String(admission.mother_phone || ""),
      String(admission.mother_occupation || ""),
      String(admission.mother_email || ""),
      String(admission.correspondence_address || ""),
      String(admission.permanent_address || ""),
      String(admission.course || ""),
      String(admission.academic_details_json || "[]"),
      String(admission.admission_pdf_r2_key || ""),
      Number(admission.admission_pdf_bytes || 0),
      String(admission.admission_photo_r2_key || ""),
      Number(admission.admission_photo_bytes || 0),
      String(admission.admission_photo_type || ""),
      String(admission.status || "new"),
      String(admission.created_at || "")
    ).run();
  } else {
    throw httpError(400, "This action is not undoable");
  }

  await env.DB.prepare(
    "UPDATE activity_log SET undone = 1, undone_at = datetime('now') WHERE activity_id = ?"
  ).bind(logId).run();
  await writeActivity(env, session, "undo_action", `Undid activity #${logId}`, { target_activity_id: logId });
  return json({ status: "ok", message: "Undo successful" });
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
  await ensureFeeReceiptColumns(env);
  const amountPaid = Math.min(Math.max(Number(b.amount_paid_inr || 0), 0), info.due);
  const remarks = `Razorpay payment_id=${b.razorpay_payment_id}, order_id=${b.razorpay_order_id}`;
  const ins = await env.DB.prepare("INSERT INTO fees (student_id, amount_total, amount_paid, remarks, payment_mode, bank_name, txn_utr_no, bank_ref_no, transaction_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(b.student_id, info.total, amountPaid, remarks, "ONLINE", "Razorpay", b.razorpay_payment_id, b.razorpay_order_id, "ONLINE").run();
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
      payment_mode: "ONLINE",
      bank_name: "Razorpay",
      txn_utr_no: b.razorpay_payment_id || "",
      bank_ref_no: b.razorpay_order_id || "",
      transaction_type: "ONLINE",
      amount_paid: amountPaid,
      amount_total: info.total,
      balance_due: balanceDue,
      concession_amount: Number(info.concession_amount || 0),
    },
  });
}

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
from uuid import uuid4
import time
import random
import re
import os
import json
import hmac
import hashlib
import base64
import csv
from urllib import request as urlrequest, error as urlerror
from openpyxl import load_workbook
from backend.import_attendance_excel import import_attendance
from fastapi.middleware.cors import CORSMiddleware
from backend.db import get_connection, init_db

app = FastAPI(title="Aviation ERP Lite")

# Allow frontend (local HTML/JS) to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
EXCEL_PATH = BASE_DIR.parent / "attendance_master.xlsm"
SHEET_NAME = "attendance_log"
RECEIPTS_DIR = BASE_DIR / "receipts"
PASSWORDS_PATH = BASE_DIR.parent / "passwords.txt"
SESSION_TIMEOUT_SECONDS = 300
SESSIONS = {}
COURSE_FEES_INR = {
    "ground operations": 150000.0,
    "cabin crew": 250000.0,
}
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()

init_db()

def _load_passwords():
    passwords = {}
    if PASSWORDS_PATH.exists():
        for line in PASSWORDS_PATH.read_text(encoding="utf-8").splitlines():
            if ":" in line:
                user, pwd = line.split(":", 1)
                passwords[user.strip()] = pwd.strip()
    return passwords

def _save_passwords(passwords: dict):
    lines = [f"{user}:{pwd}" for user, pwd in passwords.items()]
    PASSWORDS_PATH.write_text("\n".join(lines), encoding="utf-8")

def _generate_password():
    rng = random.SystemRandom()
    return "".join(str(rng.randint(0, 9)) for _ in range(8))

def _ensure_passwords_for_students():
    conn = get_connection()
    student_ids = [row["student_id"] for row in conn.execute("SELECT student_id FROM students").fetchall()]
    conn.close()

    passwords = _load_passwords()
    if "superuser" not in passwords:
        passwords["superuser"] = "qwerty"

    updated = False
    valid_ids = set()
    for sid in student_ids:
        if re.search(r"\d", str(sid)):
            valid_ids.add(sid)
            if sid not in passwords:
                passwords[sid] = _generate_password()
                updated = True

    # Remove invalid student ids (no digits) from passwords
    to_remove = [u for u in passwords.keys() if u != "superuser" and u not in valid_ids]
    if to_remove:
        for u in to_remove:
            passwords.pop(u, None)
        updated = True

    if updated or not PASSWORDS_PATH.exists():
        _save_passwords(passwords)

_ensure_passwords_for_students()

class LoginRequest(BaseModel):
    username: str
    password: str


class TimetableEntryRequest(BaseModel):
    title: str
    day_of_week: str
    start_time: str
    end_time: str
    course: Optional[str] = ""
    batch: Optional[str] = ""
    location: Optional[str] = ""
    instructor: Optional[str] = ""


class InterviewStatRequest(BaseModel):
    airline_name: str
    interview_date: str
    notes: Optional[str] = ""


class AnnouncementRequest(BaseModel):
    title: str
    message: str


class NotificationRequest(BaseModel):
    title: str
    message: str
    level: Optional[str] = "info"
    target_user: Optional[str] = None


class RazorpayOrderRequest(BaseModel):
    student_id: Optional[str] = None
    amount_inr: Optional[float] = None


class RazorpayVerifyRequest(BaseModel):
    student_id: str
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    amount_paid_inr: float


class AdmissionRequest(BaseModel):
    first_name: str
    middle_name: str = ""
    last_name: str
    phone: str
    email: str
    blood_group: str = ""
    age: int = 0
    dob: str = ""
    aadhaar_number: str = ""
    nationality: str = ""
    father_name: str = ""
    father_phone: str = ""
    father_occupation: str = ""
    father_email: str = ""
    mother_name: str = ""
    mother_phone: str = ""
    mother_occupation: str = ""
    mother_email: str = ""
    correspondence_address: str = ""
    permanent_address: str = ""
    course: str
    academic_details: List[dict] = []

def _create_session(username: str) -> str:
    token = uuid4().hex
    SESSIONS[token] = {"user": username, "last_activity": time.time()}
    return token

def _get_session(token: str):
    session = SESSIONS.get(token)
    if not session:
        return None
    if time.time() - session["last_activity"] > SESSION_TIMEOUT_SECONDS:
        SESSIONS.pop(token, None)
        return None
    session["last_activity"] = time.time()
    return session

def _get_current_user(request: Request):
    return getattr(request.state, "user", None)

def _is_superuser(user: dict) -> bool:
    return user and user.get("user") == "superuser"

def _require_superuser(user: dict):
    if not _is_superuser(user):
        raise HTTPException(status_code=403, detail="Forbidden")


def _require_self_or_superuser(user: dict, student_id: str):
    if user and not _is_superuser(user) and user["user"] != student_id:
        raise HTTPException(status_code=403, detail="Forbidden")


def _extract_airline_from_interview_remark(remark: str) -> str:
    text = (remark or "").strip()
    # Examples handled:
    # "Interview: Indigo", "Interview - Air India", "Indigo interview done"
    m = re.search(r"interview\s*[:\-]\s*([A-Za-z0-9 .&-]+)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    m = re.search(r"([A-Za-z][A-Za-z .&-]{2,})\s+interview", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return "Interview"


def _course_fee_inr(course: str) -> Optional[float]:
    if not course:
        return None
    return COURSE_FEES_INR.get(str(course).strip().lower())


def _student_financials(conn, student_id: str):
    student = conn.execute(
        "SELECT student_id, student_name, course, batch FROM students WHERE student_id = ?",
        (student_id,),
    ).fetchone()
    if not student:
        return None

    fee = conn.execute(
        """
        SELECT
            COALESCE(SUM(amount_paid), 0) AS paid,
            COALESCE(MAX(amount_total), 0) AS max_total,
            COUNT(*) AS transactions
        FROM fees
        WHERE student_id = ?
        """,
        (student_id,),
    ).fetchone()

    planned = _course_fee_inr(student["course"])
    total = float(planned if planned is not None else fee["max_total"])
    paid = float(fee["paid"])
    due = max(total - paid, 0.0)
    return {
        "student": dict(student),
        "total": total,
        "paid": paid,
        "due": due,
        "transactions": int(fee["transactions"]),
    }


def _razorpay_auth_header() -> str:
    token = f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode("utf-8")
    return "Basic " + base64.b64encode(token).decode("utf-8")


def _create_razorpay_order(amount_paise: int, receipt: str, notes: dict):
    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "notes": notes,
        "payment_capture": 1,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        "https://api.razorpay.com/v1/orders",
        data=data,
        headers={
            "Authorization": _razorpay_auth_header(),
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
    if path in ["/", "/login", "/auth/me", "/public/student-ids", "/admissions/apply", "/docs", "/openapi.json", "/style.css", "/app.js"] or path.startswith("/static"):
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    token = auth.replace("Bearer ", "").strip()
    session = _get_session(token)
    if not session:
        return JSONResponse(status_code=401, content={"detail": "Session expired"})
    request.state.user = session
    return await call_next(request)

class AttendanceRecord(BaseModel):
    student_id: str
    student_name: str
    course: str
    batch: str
    attendance_status: str
    remarks: str = ""

class AttendanceSubmission(BaseModel):
    date: str
    records: List[AttendanceRecord]

def format_date_ddmmyyyy(date_str: str) -> str:
    # Expecting YYYY-MM-DD from the UI
    parts = date_str.split("-")
    if len(parts) == 3:
        yyyy, mm, dd = parts
        return f"{dd}-{mm}-{yyyy}"
    return date_str

def to_excel_status(status: str) -> str:
    return "P" if status.strip().lower() == "present" else "A"


def normalize_date_to_iso(raw: str) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    if re.match(r"^\d{2}-\d{2}-\d{4}$", s):
        d, m, y = s.split("-")
        return f"{y}-{m}-{d}"
    if re.match(r"^\d{8}$", s):
        d, m, y = s[0:2], s[2:4], s[4:8]
        return f"{y}-{m}-{d}"
    return s


def normalize_attendance_status(raw: str) -> str:
    s = str(raw or "").strip().lower()
    if s in ("p", "present"):
        return "Present"
    if s in ("a", "absent"):
        return "Absent"
    if not s:
        return "Absent"
    return s[0].upper() + s[1:]

@app.get("/")
def home():
    return FileResponse(FRONTEND_DIR / "index.html")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/style.css")
def style_file():
    return FileResponse(FRONTEND_DIR / "style.css")


@app.get("/app.js")
def app_file():
    return FileResponse(FRONTEND_DIR / "app.js")

@app.get("/public/student-ids")
def public_student_ids():
    _ensure_passwords_for_students()
    passwords = _load_passwords()
    ids = [u for u in passwords.keys() if u != "superuser" and str(u).upper().startswith("AAI")]
    ids.sort(reverse=True)
    return ids


def _ensure_admissions_table():
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS admissions (
            admission_id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            status TEXT NOT NULL DEFAULT 'new',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(admissions)").fetchall()}
    expected = {
        "first_name": "TEXT",
        "middle_name": "TEXT",
        "last_name": "TEXT",
        "phone": "TEXT",
        "email": "TEXT",
        "blood_group": "TEXT",
        "age": "INTEGER",
        "dob": "TEXT",
        "aadhaar_number": "TEXT",
        "nationality": "TEXT",
        "father_name": "TEXT",
        "father_phone": "TEXT",
        "father_occupation": "TEXT",
        "father_email": "TEXT",
        "mother_name": "TEXT",
        "mother_phone": "TEXT",
        "mother_occupation": "TEXT",
        "mother_email": "TEXT",
        "correspondence_address": "TEXT",
        "permanent_address": "TEXT",
        "course": "TEXT",
        "academic_details_json": "TEXT NOT NULL DEFAULT '[]'",
        "status": "TEXT",
        "created_at": "TEXT",
    }
    for col, typ in expected.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE admissions ADD COLUMN {col} {typ}")
    conn.commit()
    conn.close()


@app.post("/admissions/apply")
def admissions_apply(payload: AdmissionRequest):
    first_name = payload.first_name.strip()
    middle_name = payload.middle_name.strip()
    last_name = payload.last_name.strip()
    phone = payload.phone.strip()
    email = payload.email.strip()
    blood_group = payload.blood_group.strip()
    age = int(payload.age or 0)
    dob = payload.dob.strip()
    aadhaar_number = payload.aadhaar_number.strip()
    nationality = payload.nationality.strip()
    father_name = payload.father_name.strip()
    father_phone = payload.father_phone.strip()
    father_occupation = payload.father_occupation.strip()
    father_email = payload.father_email.strip()
    mother_name = payload.mother_name.strip()
    mother_phone = payload.mother_phone.strip()
    mother_occupation = payload.mother_occupation.strip()
    mother_email = payload.mother_email.strip()
    correspondence_address = payload.correspondence_address.strip()
    permanent_address = payload.permanent_address.strip()
    course = payload.course.strip()
    academic_details_json = json.dumps(payload.academic_details or [])
    if not first_name or not last_name or not phone or not email or not course:
        raise HTTPException(status_code=400, detail="Missing required fields")

    _ensure_admissions_table()
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO admissions (
            first_name, middle_name, last_name, phone, email, blood_group, age, dob, aadhaar_number, nationality,
            father_name, father_phone, father_occupation, father_email, mother_name, mother_phone, mother_occupation, mother_email,
            correspondence_address, permanent_address, course, academic_details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            first_name, middle_name, last_name, phone, email, blood_group, age, dob, aadhaar_number, nationality,
            father_name, father_phone, father_occupation, father_email, mother_name, mother_phone, mother_occupation, mother_email,
            correspondence_address, permanent_address, course, academic_details_json,
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Admission form submitted"}

@app.get("/students")
def list_students(request: Request):
    user = _get_current_user(request)
    conn = get_connection()
    if user and not _is_superuser(user):
        rows = conn.execute(
            "SELECT * FROM students WHERE student_id = ? ORDER BY student_id DESC",
            (user["user"],),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM students ORDER BY student_id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/students")
def add_student(student_name: str, course: str, batch: str, request: Request):
    _require_superuser(_get_current_user(request))
    conn = get_connection()
    conn.execute(
        "INSERT INTO students (student_name, course, batch) VALUES (?, ?, ?)",
        (student_name, course, batch),
    )
    conn.commit()
    conn.close()
    _ensure_passwords_for_students()
    return {"status": "ok", "message": "Student added"}

@app.get("/students/{student_id}/balance")
def student_balance(student_id: str, request: Request):
    user = _get_current_user(request)
    _require_self_or_superuser(user, student_id)
    conn = get_connection()
    info = _student_financials(conn, student_id)
    conn.close()
    if not info:
        raise HTTPException(status_code=404, detail="Student not found")

    return {
        "student_id": student_id,
        "student_name": info["student"]["student_name"],
        "course": info["student"]["course"],
        "total": info["total"],
        "paid": info["paid"],
        "balance": info["due"],
        "gst_percent": 18,
    }

@app.get("/students/{student_id}/attendance")
def student_attendance(student_id: str, request: Request):
    user = _get_current_user(request)
    _require_self_or_superuser(user, student_id)
    conn = get_connection()
    rows = conn.execute("""
        SELECT date, attendance_status, remarks
        FROM attendance
        WHERE student_id = ?
        ORDER BY date DESC
    """, (student_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/students/{student_id}/fees")
def student_fees(student_id: str, request: Request):
    user = _get_current_user(request)
    _require_self_or_superuser(user, student_id)
    conn = get_connection()
    rows = conn.execute("""
        SELECT fee_id, amount_total, amount_paid, due_date, remarks
        FROM fees
        WHERE student_id = ?
        ORDER BY fee_id DESC
    """, (student_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/fees/pay")
def add_payment(student_id: str, amount_total: float, amount_paid: float, remarks: str = "", request: Request = None):
    _require_superuser(_get_current_user(request))
    conn = get_connection()
    conn.execute("""
        INSERT INTO fees (student_id, amount_total, amount_paid, remarks)
        VALUES (?, ?, ?, ?)
    """, (student_id, amount_total, amount_paid, remarks))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Fee entry added"}

@app.get("/attendance/recent")
def recent_attendance(request: Request):
    user = _get_current_user(request)
    conn = get_connection()
    if user and not _is_superuser(user):
        rows = conn.execute(
            """
            SELECT student_id, student_name, date, attendance_status
            FROM attendance
            WHERE student_id = ?
            ORDER BY date DESC
            LIMIT 20
            """,
            (user["user"],),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT student_id, student_name, date, attendance_status
            FROM attendance
            ORDER BY date DESC
            LIMIT 20
            """
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/attendance/by-date")
def attendance_by_date(date: str, request: Request):
    user = _get_current_user(request)
    conn = get_connection()
    if user and not _is_superuser(user):
        rows = conn.execute(
            """
            SELECT student_id, student_name, date, attendance_status, remarks
            FROM attendance
            WHERE date = ? AND student_id = ?
            ORDER BY student_name ASC
            """,
            (date, user["user"]),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT student_id, student_name, date, attendance_status, remarks
            FROM attendance
            WHERE date = ?
            ORDER BY student_name ASC
            """,
            (date,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/attendance/record")
def record_attendance(payload: AttendanceSubmission, request: Request):
    _require_superuser(_get_current_user(request))
    if not payload.records:
        raise HTTPException(status_code=400, detail="No attendance records provided")

    # Append to Excel
    if not EXCEL_PATH.exists():
        raise HTTPException(status_code=500, detail="attendance_master.xlsm not found")

    wb = load_workbook(EXCEL_PATH, keep_vba=True)
    if SHEET_NAME in wb.sheetnames:
        ws = wb[SHEET_NAME]
    else:
        ws = wb.active

    if ws.max_row == 1 and ws.max_column == 1 and ws.cell(1, 1).value is None:
        ws.append(["student_id", "student_name", "course", "batch", "date", "attendance_status", "remarks"])

    excel_date = format_date_ddmmyyyy(payload.date)
    for r in payload.records:
        ws.append([
            r.student_id,
            r.student_name,
            r.course,
            r.batch,
            excel_date,
            to_excel_status(r.attendance_status),
            r.remarks
        ])

    wb.save(EXCEL_PATH)

    # Insert into DB (avoid duplicates by UNIQUE constraint)
    conn = get_connection()
    for r in payload.records:
        conn.execute(
            """
            INSERT OR IGNORE INTO students
            (student_id, student_name, course, batch)
            VALUES (?, ?, ?, ?)
            """,
            (r.student_id, r.student_name, r.course, r.batch),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO attendance
            (student_id, student_name, course, batch, date, attendance_status, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (r.student_id, r.student_name, r.course, r.batch, payload.date, r.attendance_status, r.remarks),
        )
    conn.commit()
    conn.close()

    return {"status": "ok", "message": "Attendance recorded", "count": len(payload.records)}

@app.post("/login")
def login(payload: LoginRequest):
    _ensure_passwords_for_students()
    passwords = _load_passwords()
    if passwords.get(payload.username) != payload.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = _create_session(payload.username)
    return {"status": "ok", "token": token}

@app.get("/auth/me")
def auth_me(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth.replace("Bearer ", "").strip()
    session = _get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    user = session["user"]
    if user == "superuser":
        return {"status": "ok", "user": user, "role": "superuser"}

    conn = get_connection()
    student = conn.execute(
        "SELECT student_name, course, batch FROM students WHERE student_id = ?",
        (user,),
    ).fetchone()
    conn.close()

    first_name = ""
    if student and student["student_name"]:
        first_name = str(student["student_name"]).strip().split(" ")[0]

    return {
        "status": "ok",
        "user": user,
        "role": "student",
        "student_name": student["student_name"] if student else "",
        "first_name": first_name,
        "course": student["course"] if student else "",
        "batch": student["batch"] if student else "",
    }

@app.post("/attendance/sync")
def sync_attendance_from_excel(request: Request):
    _require_superuser(_get_current_user(request))
    try:
        result = import_attendance(reset_attendance=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok", "message": "Attendance synced from Excel", "inserted": result["inserted"], "skipped": result["skipped"]}


@app.post("/attendance/sync/upload")
async def sync_attendance_upload(file: UploadFile = File(...), request: Request = None):
    _require_superuser(_get_current_user(request))
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        return {
            "status": "uploaded_only",
            "message": "Please upload CSV for automatic parsing.",
            "supported_parse_format": "csv",
        }

    raw = (await file.read()).decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(raw.splitlines())
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no headers")
    headers = [h.strip().lower() for h in reader.fieldnames if h]
    required = ["student_id", "student_name", "course", "batch", "date", "attendance_status"]
    missing = [c for c in required if c not in headers]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing CSV columns: {', '.join(missing)}")

    conn = get_connection()
    conn.execute("DELETE FROM attendance")
    inserted = 0
    skipped = 0
    for row in reader:
        row_norm = {str(k).strip().lower(): v for k, v in row.items()}
        student_id = str(row_norm.get("student_id", "")).strip()
        student_name = str(row_norm.get("student_name", "")).strip()
        course = str(row_norm.get("course", "")).strip()
        batch = str(row_norm.get("batch", "")).strip()
        date = normalize_date_to_iso(row_norm.get("date", ""))
        status = normalize_attendance_status(row_norm.get("attendance_status", ""))
        remarks = str(row_norm.get("remarks", "")).strip()
        if not student_id or not date:
            skipped += 1
            continue
        conn.execute(
            "INSERT OR IGNORE INTO students (student_id, student_name, course, batch) VALUES (?, ?, ?, ?)",
            (student_id, student_name, course, batch),
        )
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO attendance
            (student_id, student_name, course, batch, date, attendance_status, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (student_id, student_name, course, batch, date, status, remarks),
        )
        if cur.rowcount == 1:
            inserted += 1
        else:
            skipped += 1
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Attendance synced from uploaded CSV", "inserted": inserted, "skipped": skipped}

@app.post("/fees/record")
async def record_fee(
    student_id: str = Form(...),
    amount_paid: float = Form(...),
    amount_total: float = Form(None),
    due_date: str = Form(None),
    remarks: str = Form(""),
    receipt: UploadFile = File(None),
    request: Request = None,
):
    _require_superuser(_get_current_user(request))
    if amount_total is None:
        amount_total = amount_paid

    receipt_path = None
    if receipt is not None:
        RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)
        ext = Path(receipt.filename).suffix
        filename = f"{student_id}_{uuid4().hex}{ext}"
        save_path = RECEIPTS_DIR / filename
        content = await receipt.read()
        save_path.write_bytes(content)
        receipt_path = str(save_path)

    conn = get_connection()
    conn.execute(
        """
        INSERT INTO fees (student_id, amount_total, amount_paid, due_date, remarks, receipt_path)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (student_id, amount_total, amount_paid, due_date, remarks, receipt_path),
    )
    conn.commit()
    conn.close()

    return {"status": "ok", "message": "Fee recorded"}

@app.get("/fees/recent")
def recent_fees(request: Request):
    user = _get_current_user(request)
    conn = get_connection()
    if user and not _is_superuser(user):
        rows = conn.execute(
            """
            SELECT fee_id, student_id, amount_total, amount_paid, due_date, remarks
            FROM fees
            WHERE student_id = ?
            ORDER BY fee_id DESC
            LIMIT 20
            """,
            (user["user"],),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT fee_id, student_id, amount_total, amount_paid, due_date, remarks
            FROM fees
            ORDER BY fee_id DESC
            LIMIT 20
            """
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/fees/summary")
def fees_summary(request: Request):
    user = _get_current_user(request)
    conn = get_connection()
    if user and not _is_superuser(user):
        info = _student_financials(conn, user["user"])
        conn.close()
        if not info:
            return {"total": 0, "paid": 0, "due": 0, "transactions": 0}
        return {
            "total": info["total"],
            "paid": info["paid"],
            "due": info["due"],
            "transactions": info["transactions"],
            "course": info["student"]["course"],
            "gst_percent": 18,
        }
    else:
        row = conn.execute(
            """
            SELECT
              COALESCE(SUM(amount_total), 0) AS total,
              COALESCE(SUM(amount_paid), 0) AS paid,
              COUNT(*) AS transactions
            FROM fees
            """
        ).fetchone()
    conn.close()
    total = float(row["total"])
    paid = float(row["paid"])
    return {
        "total": total,
        "paid": paid,
        "due": total - paid,
        "transactions": int(row["transactions"]),
    }


@app.get("/payments/gateway-status")
def payment_gateway_status(request: Request):
    _ = _get_current_user(request)
    return {
        "enabled": bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET),
        "provider": "razorpay",
        "message": "Razorpay ready" if (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) else "Razorpay keys not configured.",
        "key_id": RAZORPAY_KEY_ID if RAZORPAY_KEY_ID else None,
    }


@app.post("/payments/razorpay/order")
def create_razorpay_order(payload: RazorpayOrderRequest, request: Request):
    user = _get_current_user(request)
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(status_code=503, detail="Razorpay is not configured")

    student_id = payload.student_id or user["user"]
    _require_self_or_superuser(user, student_id)

    conn = get_connection()
    info = _student_financials(conn, student_id)
    conn.close()
    if not info:
        raise HTTPException(status_code=404, detail="Student not found")

    due = float(info["due"])
    if due <= 0:
        raise HTTPException(status_code=400, detail="No due amount")

    amount_inr = float(payload.amount_inr) if payload.amount_inr is not None else due
    amount_inr = max(1.0, min(amount_inr, due))
    amount_paise = int(round(amount_inr * 100))
    receipt = f"fee-{student_id}-{int(time.time())}"

    try:
        order = _create_razorpay_order(
            amount_paise=amount_paise,
            receipt=receipt,
            notes={"student_id": student_id, "course": info["student"]["course"] or ""},
        )
    except urlerror.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Razorpay error: {detail}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to create Razorpay order: {e}")

    return {
        "key_id": RAZORPAY_KEY_ID,
        "order": order,
        "student_id": student_id,
        "amount_inr": amount_inr,
        "due_inr": due,
        "student_name": info["student"]["student_name"],
    }


@app.post("/payments/razorpay/verify")
def verify_razorpay_payment(payload: RazorpayVerifyRequest, request: Request):
    user = _get_current_user(request)
    _require_self_or_superuser(user, payload.student_id)
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(status_code=503, detail="Razorpay is not configured")

    signing_data = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
    generated_signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        signing_data,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(generated_signature, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    conn = get_connection()
    info = _student_financials(conn, payload.student_id)
    if not info:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found")

    amount_paid = max(0.0, float(payload.amount_paid_inr))
    amount_paid = min(amount_paid, float(info["due"]))
    remarks = (
        f"Razorpay payment_id={payload.razorpay_payment_id}, "
        f"order_id={payload.razorpay_order_id}"
    )
    conn.execute(
        """
        INSERT INTO fees (student_id, amount_total, amount_paid, remarks)
        VALUES (?, ?, ?, ?)
        """,
        (payload.student_id, float(info["total"]), amount_paid, remarks),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Payment verified and recorded", "amount_paid_inr": amount_paid}


@app.get("/timetable")
def list_timetable(request: Request, course: str = "", batch: str = ""):
    user = _get_current_user(request)
    conn = get_connection()
    params = []
    where = []

    if user and not _is_superuser(user):
        student = conn.execute(
            "SELECT course, batch FROM students WHERE student_id = ?",
            (user["user"],),
        ).fetchone()
        if student:
            course = student["course"] or ""
            batch = student["batch"] or ""

    if course:
        where.append("(course = ? OR course = '')")
        params.append(course)
    if batch:
        where.append("(batch = ? OR batch = '')")
        params.append(batch)

    query = "SELECT * FROM timetable"
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY day_of_week ASC, start_time ASC, timetable_id DESC"
    rows = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/timetable")
def create_timetable(entry: TimetableEntryRequest, request: Request):
    _require_superuser(_get_current_user(request))
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO timetable
        (title, day_of_week, start_time, end_time, course, batch, location, instructor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            entry.title,
            entry.day_of_week,
            entry.start_time,
            entry.end_time,
            entry.course or "",
            entry.batch or "",
            entry.location or "",
            entry.instructor or "",
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Timetable entry created"}


@app.get("/interviews")
def list_interviews(request: Request):
    user = _get_current_user(request)
    conn = get_connection()
    manual_rows = conn.execute(
        """
        SELECT * FROM interview_stats
        ORDER BY interview_date DESC, interview_id DESC
        """
    ).fetchall()

    if user and not _is_superuser(user):
        attendance_rows = conn.execute(
            """
            SELECT attendance_id, student_id, student_name, date, remarks
            FROM attendance
            WHERE student_id = ?
              AND remarks IS NOT NULL
              AND TRIM(remarks) <> ''
              AND lower(remarks) LIKE '%interview%'
            ORDER BY date DESC, attendance_id DESC
            """,
            (user["user"],),
        ).fetchall()
    else:
        attendance_rows = conn.execute(
            """
            SELECT attendance_id, student_id, student_name, date, remarks
            FROM attendance
            WHERE remarks IS NOT NULL
              AND TRIM(remarks) <> ''
              AND lower(remarks) LIKE '%interview%'
            ORDER BY date DESC, attendance_id DESC
            """
        ).fetchall()
    conn.close()

    interviews = []
    for r in manual_rows:
        item = dict(r)
        item["source"] = "manual"
        interviews.append(item)

    for r in attendance_rows:
        remark = r["remarks"] or ""
        interviews.append(
            {
                "interview_id": f"attendance-{r['attendance_id']}",
                "airline_name": _extract_airline_from_interview_remark(remark),
                "interview_date": r["date"],
                "notes": remark,
                "source": "attendance_remark",
                "student_id": r["student_id"],
                "student_name": r["student_name"],
            }
        )

    interviews.sort(key=lambda x: str(x.get("interview_date", "")), reverse=True)
    return interviews


@app.post("/interviews")
def create_interview(entry: InterviewStatRequest, request: Request):
    _require_superuser(_get_current_user(request))
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO interview_stats (airline_name, interview_date, notes)
        VALUES (?, ?, ?)
        """,
        (entry.airline_name, entry.interview_date, entry.notes or ""),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Interview stat created"}


@app.get("/announcements")
def list_announcements(request: Request, limit: int = 20):
    _ = _get_current_user(request)
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT * FROM announcements
        ORDER BY announcement_id DESC
        LIMIT ?
        """,
        (max(1, min(limit, 100)),),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/announcements")
def create_announcement(payload: AnnouncementRequest, request: Request):
    user = _get_current_user(request)
    _require_superuser(user)
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO announcements (title, message, created_by)
        VALUES (?, ?, ?)
        """,
        (payload.title, payload.message, user["user"]),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Announcement created"}


@app.get("/notifications")
def list_notifications(request: Request, limit: int = 30):
    user = _get_current_user(request)
    conn = get_connection()
    uid = user["user"]
    rows = conn.execute(
        """
        SELECT
          n.notification_id, n.title, n.message, n.level, n.target_user, n.created_at,
          CASE WHEN nr.user_id IS NULL THEN 0 ELSE 1 END AS is_read
        FROM notifications n
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.notification_id AND nr.user_id = ?
        WHERE n.target_user IS NULL OR n.target_user = ?
        ORDER BY n.notification_id DESC
        LIMIT ?
        """,
        (uid, uid, max(1, min(limit, 100))),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/notifications")
def create_notification(payload: NotificationRequest, request: Request):
    _require_superuser(_get_current_user(request))
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO notifications (title, message, level, target_user)
        VALUES (?, ?, ?, ?)
        """,
        (
            payload.title,
            payload.message,
            payload.level or "info",
            payload.target_user,
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Notification created"}


@app.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, request: Request):
    user = _get_current_user(request)
    conn = get_connection()
    conn.execute(
        """
        INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
        VALUES (?, ?)
        """,
        (notification_id, user["user"]),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.get("/feed")
def dashboard_feed(request: Request):
    user = _get_current_user(request)
    conn = get_connection()

    if user and not _is_superuser(user):
        fees = conn.execute(
            """
            SELECT COALESCE(SUM(amount_total),0) AS total,
                   COALESCE(SUM(amount_paid),0) AS paid,
                   COUNT(*) AS transactions
            FROM fees
            WHERE student_id = ?
            """,
            (user["user"],),
        ).fetchone()
    else:
        fees = conn.execute(
            """
            SELECT COALESCE(SUM(amount_total),0) AS total,
                   COALESCE(SUM(amount_paid),0) AS paid,
                   COUNT(*) AS transactions
            FROM fees
            """
        ).fetchone()

    announcements = conn.execute(
        "SELECT announcement_id, title, message, created_at FROM announcements ORDER BY announcement_id DESC LIMIT 5"
    ).fetchall()

    uid = user["user"]
    notifications = conn.execute(
        """
        SELECT notification_id, title, message, level, created_at
        FROM notifications
        WHERE target_user IS NULL OR target_user = ?
        ORDER BY notification_id DESC
        LIMIT 5
        """,
        (uid,),
    ).fetchall()

    interviews = conn.execute(
        "SELECT interview_id, airline_name, interview_date FROM interview_stats ORDER BY interview_date DESC LIMIT 5"
    ).fetchall()

    conn.close()

    total = float(fees["total"])
    paid = float(fees["paid"])
    return {
        "fees": {
            "total": total,
            "due": total - paid,
            "transactions": int(fees["transactions"]),
        },
        "announcements": [dict(r) for r in announcements],
        "notifications": [dict(r) for r in notifications],
        "interviews": [dict(r) for r in interviews],
    }

@app.get("/reports/summary")
def reports_summary(request: Request):
    _require_superuser(_get_current_user(request))
    conn = get_connection()
    student_count = conn.execute("SELECT COUNT(*) AS c FROM students").fetchone()["c"]
    fee_totals = conn.execute("""
        SELECT COALESCE(SUM(amount_total), 0) AS total,
               COALESCE(SUM(amount_paid), 0) AS paid
        FROM fees
    """).fetchone()
    attendance_counts = conn.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN attendance_status = 'Present' THEN 1 ELSE 0 END), 0) AS present,
            COALESCE(SUM(CASE WHEN attendance_status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent
        FROM attendance
    """).fetchone()
    conn.close()
    return {
        "students": student_count,
        "fees_total": fee_totals["total"],
        "fees_paid": fee_totals["paid"],
        "fees_balance": float(fee_totals["total"]) - float(fee_totals["paid"]),
        "attendance_present": attendance_counts["present"],
        "attendance_absent": attendance_counts["absent"],
    }

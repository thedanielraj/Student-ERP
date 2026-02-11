from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
from pathlib import Path
from uuid import uuid4
import time
import random
import re
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

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
    if path in ["/", "/login", "/auth/me", "/docs", "/openapi.json"] or path.startswith("/static"):
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

@app.get("/")
def home():
    return FileResponse(FRONTEND_DIR / "index.html")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

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
    if user and not _is_superuser(user) and user["user"] != student_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    conn = get_connection()

    student = conn.execute(
        "SELECT * FROM students WHERE student_id = ?",
        (student_id,),
    ).fetchone()

    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found")

    fee = conn.execute("""
        SELECT 
            COALESCE(SUM(amount_total), 0) AS total,
            COALESCE(SUM(amount_paid), 0) AS paid
        FROM fees
        WHERE student_id = ?
    """, (student_id,)).fetchone()

    conn.close()

    balance = float(fee["total"]) - float(fee["paid"])

    return {
        "student_id": student_id,
        "student_name": student["student_name"],
        "total": fee["total"],
        "paid": fee["paid"],
        "balance": balance
    }

@app.get("/students/{student_id}/attendance")
def student_attendance(student_id: str, request: Request):
    user = _get_current_user(request)
    if user and not _is_superuser(user) and user["user"] != student_id:
        raise HTTPException(status_code=403, detail="Forbidden")
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
    if user and not _is_superuser(user) and user["user"] != student_id:
        raise HTTPException(status_code=403, detail="Forbidden")
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

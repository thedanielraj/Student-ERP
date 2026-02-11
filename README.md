# Student ERP

<p align="center">
  <b>Aviation-focused Student ERP</b><br/>
  Attendance, fees, role-based login, and Excel sync in one lightweight app.
</p>

<p align="center">
  <img alt="Stack" src="https://img.shields.io/badge/Backend-FastAPI-0f766e">
  <img alt="Database" src="https://img.shields.io/badge/Database-SQLite-1d4ed8">
  <img alt="Frontend" src="https://img.shields.io/badge/Frontend-HTML%2FCSS%2FJS-7c3aed">
  <img alt="Status" src="https://img.shields.io/badge/Status-Local%20Ready-16a34a">
</p>

---

## What This Project Does

`Student ERP` is a local-first ERP for aviation training operations.

It currently provides:
- Login with role-based access (`superuser` + student IDs)
- Attendance recording and date-wise lookup
- Excel sync from `attendance_master.xlsm`
- Fee recording with receipt upload
- Student-only view for personal attendance and fee balance
- Session timeout after 5 minutes of inactivity

---

## Tech Stack

- Backend: `FastAPI`, `SQLite`
- Frontend: `HTML`, `CSS`, `JavaScript` (no framework)
- Excel: `pandas`, `openpyxl`
- Server: `uvicorn`

---

## Folder Structure

```text
aviation_erp/
├── backend/
│   ├── main.py
│   ├── db.py
│   ├── schema.sql
│   ├── import_attendance_excel.py
│   ├── erp.db               # local DB (gitignored)
│   └── receipts/            # uploaded files (gitignored)
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── attendance_master.xlsm
├── passwords.txt            # generated credentials (gitignored)
├── .gitignore
└── README.md
```

---

## Role Model

### Superuser
- Full dashboard access
- Can view all students
- Can record attendance and fees
- Can sync attendance from Excel
- Can view reports

### Student
- Can access only own records
- Sees welcome panel + attendance percentage
- Sees remaining fees
- Payment section is placeholder (`Coming soon`)

---

## Key API Routes

- `POST /login`
- `GET /auth/me`
- `GET /students`
- `POST /students`
- `GET /students/{student_id}/balance`
- `GET /students/{student_id}/attendance`
- `GET /students/{student_id}/fees`
- `GET /attendance/recent`
- `GET /attendance/by-date`
- `POST /attendance/record`
- `POST /attendance/sync`
- `POST /fees/record`
- `GET /fees/recent`
- `GET /reports/summary`

---

## Run Locally

### 1. Install dependencies

```bash
pip install fastapi uvicorn pandas openpyxl python-multipart
```

### 2. Start backend

```bash
uvicorn backend.main:app --reload
```

### 3. Open frontend

Open `frontend/index.html` in your browser.

Frontend expects backend at:
- `http://127.0.0.1:8000`

---

## Credentials

- Superuser:
  - Username: `superuser`
  - Password: `qwerty`
- Students:
  - Username: `student_id`
  - Password: generated in `passwords.txt`

Note:
- IDs without numeric register format are excluded from login generation but still visible in superuser views.

---

## Data and Sync Behavior

- Attendance can be recorded live from UI.
- Attendance writes to:
  - `backend/erp.db`
  - `attendance_master.xlsm` (`dd-mm-yyyy`, status `P`/`A`)
- `Sync From Excel` rebuilds attendance data from Excel into DB.

---

## Screenshots

Create a folder: `docs/screenshots/` and add images there.

Example layout:
- `docs/screenshots/login.png`
- `docs/screenshots/superuser-dashboard.png`
- `docs/screenshots/attendance-tab.png`
- `docs/screenshots/student-view.png`

Then keep or replace this block:

```md
## Screenshots

### Login
![Login](docs/screenshots/login.png)

### Superuser Dashboard
![Superuser Dashboard](docs/screenshots/superuser-dashboard.png)

### Attendance Tab
![Attendance Tab](docs/screenshots/attendance-tab.png)

### Student View
![Student View](docs/screenshots/student-view.png)
```

---

## GitHub Upload Commands

Run from repo root (`d:\aviation_erp`):

```bash
git init
git add .
git commit -m "Initial Student ERP upload"
git branch -M main
git remote add origin https://github.com/thedanielraj/Student-ERP.git
git push -u origin main
```

If remote already exists:

```bash
git remote set-url origin https://github.com/thedanielraj/Student-ERP.git
git push -u origin main
```

---

## Production Notes

Current auth/session model is suitable for internal/local usage. Before public deployment, add:
- password hashing (`bcrypt`)
- persistent session store or JWT strategy
- strict CORS configuration
- HTTPS and secure cookie/session handling

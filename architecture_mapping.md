# Architecture and Endpoint Mapping

## Overview
The Student ERP system uses a dual-backend strategy:
1. **Local Backend**: FastAPI-based (`backend/main.py`), using SQLite (`backend/erp.db`).
2. **Production Backend**: Cloudflare Pages Functions (`functions/api/[[path]].js`), using Cloudflare D1 and R2.

The frontend is a single-page application (SPA) that can communicate with either backend depending on the host.

## Endpoint Mapping Discrepancies

| Feature | FastAPI (`backend/main.py`) | Cloudflare (`functions/api/[[path]].js`) | Status |
| :--- | :--- | :--- | :--- |
| Auth/Login | Yes | Yes | Equivalent |
| Student Management | Yes | Yes | Equivalent |
| Attendance | Yes | Yes + `/attendance/month` | Discrepancy (Month view) |
| Fees | Yes | Yes + Reminders | Discrepancy (Reminders) |
| Profile | Yes | Yes | Equivalent |
| Timetable | Yes | Yes | Equivalent |
| Interviews | Yes | Yes | Equivalent |
| Announcements | Yes | Yes | Equivalent |
| Notifications | Yes | Yes | Equivalent |
| Admissions | Yes | Yes + Photo/PDF Replace | Discrepancy (Photo/PDF) |
| Activity Logs | Yes | Yes | Equivalent |
| **Tests** | **No** | **Yes** | **Missing in FastAPI** |
| **Leads** | **No** | **Yes** | **Missing in FastAPI** |
| **Chatbot** | **No** | **Yes** | **Missing in FastAPI** |
| **Parent Portal** | **No** | **Yes** | **Missing in FastAPI** |

## Frontend Modularization
The frontend was originally in a single `frontend/app.js` file. It has been partially or fully migrated to modular scripts in `frontend/js/`.

- `frontend/index.html` currently loads `/js/main.js` as a module.
- `frontend/js/main.js` imports all other modules and attaches them to the `window` object to maintain compatibility with inline event handlers in `index.html`.


## Frontend Modularization Analysis
The codebase contains both `frontend/app.js` (legacy monolithic) and a modular structure in `frontend/js/`.

- `frontend/js/app-core.js` contains the bulk of the logic, similar in size to `app.js`.
- `frontend/js/attendance.js`, `frontend/js/chatbot.js`, etc., re-export from `app-core.js` or implement specialized logic.
- `frontend/index.html` currently uses modular loading:
  ```html
  <script type="module">
    import(`/js/main.js?v=${Date.now()}`)
      .then(() => { window.__APP_READY__ = true; })
  ```
- Many modular files (`students.js`, `fees.js`, `tests.js`, `pdf.js`, `ui.js`) currently only re-export from `app-core.js`, suggesting that the migration is ongoing or that `app-core.js` acts as a shared library.

**Recommendation**: `frontend/app.js` appears to be redundant and could likely be removed to avoid confusion, provided `app-core.js` fully covers its functionality.

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
| Attendance | Yes | Yes | Equivalent |
| Fees | Yes | Yes | Equivalent |
| Profile | Yes | Yes | Equivalent |
| Timetable | Yes | Yes | Equivalent |
| Interviews | Yes | Yes | Equivalent |
| Announcements | Yes | Yes | Equivalent |
| Notifications | Yes | Yes | Equivalent |
| Admissions | Yes | Yes + Photo/PDF Replace | Discrepancy (Photo/PDF) |
| Activity Logs | Yes | Yes | Equivalent |
| **Tests** | Yes | Yes | Equivalent |
| **Leads** | Yes | Yes | Equivalent |
| **Chatbot** | Yes | Yes | Equivalent |
| **Parent Portal** | Yes | Yes | Equivalent |

## Frontend Modularization
The frontend was originally in a single `frontend/app.js` file. It has been partially or fully migrated to modular scripts in `frontend/js/`.

- `frontend/index.html` currently loads `/js/main.js` as a module.
- `frontend/js/main.js` imports all other modules and attaches them to the `window` object to maintain compatibility with inline event handlers in `index.html`.


## Frontend Modularization Status
The frontend has been fully refactored from legacy monolithic files (`frontend/app.js` and `frontend/js/app-core.js`) into a granular modular structure within `frontend/js/`.

- **Module Structure**: Business logic is decoupled into ~20 specific modules (e.g., `auth.js`, `attendance.js`, `pdf.js`, `chatbot.js`).
- **Global Compatibility**: `frontend/js/main.js` serves as the entry point, aggregating all modules and exposing necessary functions to the `window` object to maintain compatibility with existing inline HTML event handlers.
- **Loading Mechanism**: `frontend/index.html` loads the application via an ES module import:
  ```html
  <script type="module">
    import(`/js/main.js?v=${Date.now()}`)
      .then(() => { window.__APP_READY__ = true; })
  ```

**Outcome**: Monolithic legacy files have been removed. The modular architecture improves maintainability while preserving full feature parity.

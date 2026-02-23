CREATE TABLE IF NOT EXISTS admissions (
    admission_id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    course TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

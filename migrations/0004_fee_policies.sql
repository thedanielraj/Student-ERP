CREATE TABLE IF NOT EXISTS fee_policies (
    student_id TEXT PRIMARY KEY,
    concession_amount REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

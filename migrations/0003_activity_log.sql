CREATE TABLE IF NOT EXISTS activity_log (
    activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    undone INTEGER NOT NULL DEFAULT 0,
    undone_at TEXT
);

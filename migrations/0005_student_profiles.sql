CREATE TABLE IF NOT EXISTS student_profiles (
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
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profile_files (
    file_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_name TEXT,
    file_data BLOB,
    mime_type TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);
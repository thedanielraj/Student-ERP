CREATE TABLE IF NOT EXISTS fee_policies (
  student_id TEXT PRIMARY KEY,
  concession_amount REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO fee_policies (student_id, concession_amount, due_date, updated_at)
SELECT
  s.student_id,
  CASE LOWER(TRIM(COALESCE(s.course, '')))
    WHEN 'ground operations' THEN 0
    WHEN 'cabin crew' THEN 100000
    ELSE 0
  END AS concession_amount,
  fp.due_date,
  datetime('now')
FROM students s
LEFT JOIN fee_policies fp ON fp.student_id = s.student_id
ON CONFLICT(student_id) DO UPDATE SET
  concession_amount = excluded.concession_amount,
  due_date = COALESCE(fee_policies.due_date, excluded.due_date),
  updated_at = datetime('now');

DELETE FROM fees;

INSERT INTO fees (student_id, amount_total, amount_paid, due_date, remarks)
SELECT
  s.student_id,
  150000,
  0,
  fp.due_date,
  'Admin bulk reset: remaining fee fixed at INR 150000'
FROM students s
LEFT JOIN fee_policies fp ON fp.student_id = s.student_id;

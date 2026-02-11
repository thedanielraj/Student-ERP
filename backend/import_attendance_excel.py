import sys
from pathlib import Path

import pandas as pd

# Allow running as a script from repo root or other working dirs
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.db import get_connection, init_db

EXCEL_PATH = ROOT_DIR / "attendance_master.xlsm"
SHEET_NAME = "attendance_log"


def import_attendance(reset_attendance: bool = False):
    init_db()

    if not EXCEL_PATH.exists():
        raise FileNotFoundError(f"Excel file not found: {EXCEL_PATH}")

    df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME)

    # Clean column names (avoid hidden spaces)
    df.columns = [c.strip() for c in df.columns]

    required_cols = [
        "student_id",
        "student_name",
        "course",
        "batch",
        "date",
        "attendance_status",
        "remarks",
    ]

    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in Excel: {missing}. Found: {list(df.columns)}")

    # Drop empty rows
    df = df.dropna(subset=["student_id", "date", "attendance_status"])

    # Convert student_id to int safely
    df["student_id"] = df["student_id"].astype(str).str.strip()


    # Convert date to yyyy-mm-dd string (safe for SQLite)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

    # Convert status to text
    df["attendance_status"] = df["attendance_status"].astype(str).str.strip()

    # Replace NaN remarks with empty string
    df["remarks"] = df["remarks"].fillna("").astype(str)

    conn = get_connection()
    if reset_attendance:
        conn.execute("DELETE FROM attendance")

    # Insert unique students first (avoid duplicates on repeated attendance rows)
    student_rows = (
        df[["student_id", "student_name", "course", "batch"]]
        .dropna(subset=["student_id"])
        .drop_duplicates(subset=["student_id"])
    )

    for _, row in student_rows.iterrows():
        try:
            conn.execute(
                """
                INSERT OR IGNORE INTO students
                (student_id, student_name, course, batch)
                VALUES (?, ?, ?, ?)
                """,
                (
                    str(row["student_id"]).strip(),
                    str(row["student_name"]).strip(),
                    str(row["course"]).strip(),
                    str(row["batch"]).strip(),
                ),
            )
        except Exception:
            pass

    inserted = 0
    skipped = 0

    for _, row in df.iterrows():
        try:
            conn.execute(
                """
                INSERT OR IGNORE INTO attendance
                (student_id, student_name, course, batch, date, attendance_status, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(row["student_id"]),
                    str(row["student_name"]).strip(),
                    str(row["course"]).strip(),
                    str(row["batch"]).strip(),
                    str(row["date"]).strip(),
                    str(row["attendance_status"]).strip(),
                    str(row["remarks"]).strip(),
                ),
            )

            # If row was ignored (duplicate), rowcount will be 0
            if conn.total_changes > inserted:
                inserted += 1
            else:
                skipped += 1

        except Exception:
            pass

    conn.commit()
    conn.close()

    return {"inserted": inserted, "skipped": skipped}


def main():
    try:
        result = import_attendance(reset_attendance=False)
        print(f"Import complete. Inserted: {result['inserted']}, Skipped (duplicates): {result['skipped']}")
    except Exception as e:
        print("ERROR:", e)


if __name__ == "__main__":
    main()

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "erp.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    # Create DB + tables using schema.sql
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"schema.sql not found at: {SCHEMA_PATH}")

    conn = get_connection()
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    ensure_fee_receipt_column(conn)
    conn.commit()
    conn.close()


def ensure_fee_receipt_column(conn):
    cols = [row["name"] for row in conn.execute("PRAGMA table_info(fees)").fetchall()]
    if "receipt_path" not in cols:
        conn.execute("ALTER TABLE fees ADD COLUMN receipt_path TEXT")

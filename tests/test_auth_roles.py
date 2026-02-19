import sqlite3
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    schema_path = Path("backend/schema.sql")
    schema_sql = schema_path.read_text(encoding="utf-8")

    def test_connection():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(main, "get_connection", test_connection)
    main.SESSIONS.clear()

    conn = test_connection()
    conn.executescript(schema_sql)
    conn.execute(
        "INSERT INTO students (student_id, student_name, course, batch) VALUES (?, ?, ?, ?)",
        ("AAI701", "Alpha Student", "Ground", "Mike"),
    )
    conn.execute(
        "INSERT INTO students (student_id, student_name, course, batch) VALUES (?, ?, ?, ?)",
        ("AAI702", "Beta Student", "Cabin Crew", "November"),
    )
    conn.execute(
        """
        INSERT INTO fees (student_id, amount_total, amount_paid, due_date, remarks)
        VALUES (?, ?, ?, ?, ?)
        """,
        ("AAI702", 10000, 3500, "2026-03-01", "first installment"),
    )
    conn.execute(
        """
        INSERT INTO attendance (student_id, student_name, course, batch, date, attendance_status, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        ("AAI702", "Beta Student", "Cabin Crew", "November", "2026-02-10", "Present", ""),
    )
    conn.commit()
    conn.close()

    with TestClient(main.app) as test_client:
        yield test_client


def auth_header(username: str) -> dict:
    token = f"test-token-{username}"
    main.SESSIONS[token] = {"user": username, "last_activity": time.time()}
    return {"Authorization": f"Bearer {token}"}


def test_superuser_can_access_reports(client):
    response = client.get("/reports/summary", headers=auth_header("superuser"))
    assert response.status_code == 200
    payload = response.json()
    assert "students" in payload
    assert "fees_balance" in payload


def test_student_is_forbidden_from_reports(client):
    response = client.get("/reports/summary", headers=auth_header("AAI702"))
    assert response.status_code == 403


def test_student_list_returns_only_self(client):
    response = client.get("/students", headers=auth_header("AAI702"))
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["student_id"] == "AAI702"


def test_student_cannot_view_another_balance(client):
    response = client.get(
        "/students/AAI701/balance",
        headers=auth_header("AAI702"),
    )
    assert response.status_code == 403

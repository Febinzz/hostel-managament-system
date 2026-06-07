import os
import re
import sqlite3
import smtplib
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_FILE = BASE_DIR / "hostel.db"
DUMP_FILE = BASE_DIR / "Dump20250922.sql"

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
CORS(app)

ADMIN_USER = {"username": "admin", "password": "admn@123"}

MAIL_CONFIG = {
    "host": os.getenv("MAIL_HOST"),
    "port": int(os.getenv("MAIL_PORT", "587")) if os.getenv("MAIL_PORT") else None,
    "use_tls": os.getenv("MAIL_USE_TLS", "").lower() == "true",
    "use_ssl": os.getenv("MAIL_USE_SSL", "").lower() == "true",
    "username": os.getenv("MAIL_USERNAME"),
    "password": os.getenv("MAIL_PASSWORD"),
    "from_address": os.getenv("MAIL_FROM") or os.getenv("MAIL_DEFAULT_SENDER") or os.getenv("MAIL_USERNAME"),
}

if MAIL_CONFIG["port"] == 587 and "MAIL_USE_TLS" not in os.environ:
    MAIL_CONFIG["use_tls"] = True
if MAIL_CONFIG["port"] == 465 and "MAIL_USE_SSL" not in os.environ:
    MAIL_CONFIG["use_ssl"] = True


def parse_sql_dump_statements(sql_text):
    sql_text = re.sub(r"--.*?$", "", sql_text, flags=re.MULTILINE)
    sql_text = re.sub(r"/\*![\s\S]*?\*/", "", sql_text)
    sql_text = re.sub(r"/\*[\s\S]*?\*/", "", sql_text)
    statements = [stmt.strip().replace("`", "") for stmt in re.split(r";\s*(?:\r?\n|$)", sql_text)]
    return [stmt for stmt in statements if stmt and stmt.lower().startswith(("insert into students", "insert into rooms", "insert into allocation"))]


def get_db_connection():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def seed_database(conn):
    if not DUMP_FILE.exists():
        app.logger.warning("Dump file not found, skipping auto-seed: %s", DUMP_FILE)
        return

    dump_sql = DUMP_FILE.read_text(encoding="utf-8")
    insert_statements = parse_sql_dump_statements(dump_sql)
    if not insert_statements:
        app.logger.warning("No seed statements found in %s", DUMP_FILE)
        return

    try:
        conn.executescript("PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;")
        for stmt in insert_statements:
            conn.execute(stmt)
        conn.executescript("COMMIT;\nPRAGMA foreign_keys = ON;")
        conn.commit()
        app.logger.info("Local SQLite database seeded from %s", DUMP_FILE)
    except sqlite3.Error as exc:
        app.logger.error("Seed statement failed: %s", exc)
        conn.rollback()


def row_to_dict(row):
    return dict(row) if row is not None else {}


def query_db(conn, query, params=(), single=False):
    cursor = conn.execute(query, params)
    if query.strip().upper().startswith("SELECT") or query.strip().upper().startswith("PRAGMA"):
        rows = [row_to_dict(row) for row in cursor.fetchall()]
        return rows[0] if single and rows else (rows if not single else None)
    conn.commit()
    return {"lastrowid": cursor.lastrowid, "rowcount": cursor.rowcount}


def send_student_id_email(to_email, student):
    if not MAIL_CONFIG["host"] or not MAIL_CONFIG["username"] or not MAIL_CONFIG["password"]:
        raise RuntimeError("SMTP is not configured. Set MAIL_HOST, MAIL_PORT, MAIL_USERNAME, and MAIL_PASSWORD.")

    message = EmailMessage()
    message["Subject"] = "Your Hostel Student ID"
    message["From"] = MAIL_CONFIG["from_address"] or MAIL_CONFIG["username"]
    message["To"] = to_email
    message.set_content(
        f"Hello {student.get('name', 'Student')},\n\nYour registered student ID is: {student.get('student_id')}\n\nUse this ID to view your room allocation.\n\nThank you."
    )

    if MAIL_CONFIG["use_ssl"]:
        smtp = smtplib.SMTP_SSL(MAIL_CONFIG["host"], MAIL_CONFIG["port"] or 465)
    else:
        smtp = smtplib.SMTP(MAIL_CONFIG["host"], MAIL_CONFIG["port"] or 587)

    try:
        smtp.ehlo()
        if MAIL_CONFIG["use_tls"] and not MAIL_CONFIG["use_ssl"]:
            smtp.starttls()
            smtp.ehlo()
        smtp.login(MAIL_CONFIG["username"], MAIL_CONFIG["password"])
        smtp.send_message(message)
    finally:
        smtp.quit()


# Initialize the database and create tables
conn = get_db_connection()
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS students (
        student_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        roll_no TEXT UNIQUE,
        course TEXT,
        email TEXT
    )
    """
)
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS rooms (
        room_id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_number TEXT UNIQUE,
        capacity INTEGER,
        occupied INTEGER DEFAULT 0
    )
    """
)
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS allocation (
        alloc_id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        room_id INTEGER,
        FOREIGN KEY(student_id) REFERENCES students(student_id),
        FOREIGN KEY(room_id) REFERENCES rooms(room_id)
    )
    """
)
conn.commit()

student_count = query_db(conn, "SELECT COUNT(*) AS count FROM students", single=True)
if student_count and student_count.get("count", 0) == 0:
    seed_database(conn)


@app.route("/", methods=["GET"])
def index():
    return send_from_directory(str(BASE_DIR), "index.html")


@app.route("/health", methods=["GET"])
def health_check():
    try:
        query_db(conn, "SELECT 1 AS ok", single=True)
        return jsonify({"status": "ok"})
    except sqlite3.Error as exc:
        return jsonify({"status": "error", "error": str(exc)}), 500


@app.route("/students", methods=["GET"])
def get_students():
    students = query_db(conn, "SELECT * FROM students")
    return jsonify(students)


@app.route("/students", methods=["POST"])
def add_student():
    payload = request.get_json(force=True)
    name = payload.get("name")
    roll_no = payload.get("roll_no")
    course = payload.get("course")
    email = (payload.get("email") or "").strip().lower()

    if not email.endswith("@mgits.ac.in"):
        return jsonify({"error": "Email must end with @mgits.ac.in"}), 400

    existing_email = query_db(conn, "SELECT * FROM students WHERE email = ?", (email,), single=True)
    if existing_email:
        return jsonify({"error": "Email already registered"}), 400

    try:
        result = query_db(conn, "INSERT INTO students (name, roll_no, course, email) VALUES (?, ?, ?, ?)",
                          (name, roll_no, course, email))
        return jsonify({"message": "Student added", "studentId": result["lastrowid"]})
    except sqlite3.IntegrityError as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/students/forgot-id", methods=["POST"])
def forgot_student_id():
    payload = request.get_json(force=True)
    email = (payload.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    students = query_db(conn, "SELECT student_id, name FROM students WHERE email = ?", (email,))
    if not students:
        return jsonify({"error": "No student found with that email"}), 404

    try:
        send_student_id_email(email, students[0])
        return jsonify({"message": "Student ID sent to email"})
    except Exception as exc:
        app.logger.error("Email send failed: %s", exc)
        return jsonify({"error": "Failed to send email. Check server email configuration.", "details": str(exc)}), 500


@app.route("/allocation/<int:student_id>", methods=["GET"])
def get_allocation(student_id):
    allocation = query_db(conn,
                          "SELECT r.room_number FROM allocation a JOIN rooms r ON a.room_id = r.room_id WHERE a.student_id = ?",
                          (student_id,), single=True)
    return jsonify(allocation or {})


@app.route("/rooms", methods=["GET"])
def get_rooms():
    rooms = query_db(conn, "SELECT * FROM rooms")
    return jsonify(rooms)


@app.route("/rooms", methods=["POST"])
def add_room():
    payload = request.get_json(force=True)
    room_number = payload.get("room_number")
    capacity = payload.get("capacity")

    try:
        result = query_db(conn, "INSERT INTO rooms (room_number, capacity) VALUES (?, ?)",
                          (room_number, capacity))
        return jsonify({"message": "Room added", "roomId": result["lastrowid"]})
    except sqlite3.IntegrityError as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/allocation", methods=["POST"])
def allocate_student():
    payload = request.get_json(force=True)
    student_id = payload.get("student_id")
    room_id = payload.get("room_id")

    existing = query_db(conn, "SELECT * FROM allocation WHERE student_id = ?", (student_id,))
    if existing:
        return jsonify({"error": "Student is already allocated a room"}), 400

    room = query_db(conn, "SELECT capacity, occupied FROM rooms WHERE room_id = ?", (room_id,), single=True)
    if not room:
        return jsonify({"error": "Room not found"}), 404
    if room["occupied"] >= room["capacity"]:
        return jsonify({"error": "Room is full"}), 400

    try:
        query_db(conn, "INSERT INTO allocation (student_id, room_id) VALUES (?, ?)", (student_id, room_id))
        query_db(conn, "UPDATE rooms SET occupied = occupied + 1 WHERE room_id = ?", (room_id,))
        return jsonify({"message": "Student allocated successfully"})
    except sqlite3.Error as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/allocation/<int:student_id>", methods=["DELETE"])
def delete_allocation(student_id):
    current = query_db(conn, "SELECT room_id FROM allocation WHERE student_id = ?", (student_id,), single=True)
    if not current:
        return jsonify({"error": "Allocation not found"}), 404

    room_id = current["room_id"]
    try:
        query_db(conn, "DELETE FROM allocation WHERE student_id = ?", (student_id,))
        query_db(conn, "UPDATE rooms SET occupied = occupied - 1 WHERE room_id = ?", (room_id,))
        return jsonify({"message": "Allocation deleted successfully"})
    except sqlite3.Error as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/allocations", methods=["GET"])
def get_allocations():
    query = """
        SELECT a.alloc_id, s.student_id, s.name AS student_name, s.roll_no, r.room_number
        FROM allocation a
        JOIN students s ON a.student_id = s.student_id
        JOIN rooms r ON a.room_id = r.room_id
    """
    allocations = query_db(conn, query)
    return jsonify(allocations)


@app.route("/admin/login", methods=["POST"])
def admin_login():
    # Accept JSON or form POST
    if request.is_json:
        payload = request.get_json(force=True)
        username = payload.get("username")
        password = payload.get("password")
    else:
        username = request.form.get("adminUsername")
        password = request.form.get("adminPassword")

    if username == ADMIN_USER["username"] and password == ADMIN_USER["password"]:
        # If this was a form POST, redirect to admin main page
        if not request.is_json:
            from flask import redirect

            return redirect("/Admin_main.html")
        return jsonify({"message": "Login successful"})
    if not request.is_json:
        # Invalid form login -> redirect back to login with a simple error query
        from flask import redirect

        return redirect("/admin_login.html?error=1")
    return jsonify({"error": "Invalid username or password"}), 401


@app.route("/allocation/name/<student_name>", methods=["GET"])
def get_allocation_by_name(student_name):
    query = """
        SELECT s.name, s.roll_no, r.room_number
        FROM allocation a
        JOIN students s ON a.student_id = s.student_id
        JOIN rooms r ON a.room_id = r.room_id
        WHERE s.name = ?
    """
    allocation = query_db(conn, query, (student_name,), single=True)
    if not allocation:
        return jsonify({"message": "No allocation found"})
    return jsonify(allocation)


@app.route("/report/students", methods=["GET"])
def report_students():
    query = """
        SELECT s.student_id, s.name, s.roll_no, s.course, r.room_number
        FROM students s
        LEFT JOIN allocation a ON s.student_id = a.student_id
        LEFT JOIN rooms r ON a.room_id = r.room_id
    """
    return jsonify(query_db(conn, query))


@app.route("/report/rooms", methods=["GET"])
def report_rooms():
    query = """
        SELECT room_id, room_number, capacity, occupied,
        CASE
            WHEN occupied = 0 THEN 'Vacant'
            WHEN occupied < capacity THEN 'Partially Filled'
            WHEN occupied = capacity THEN 'Full'
        END AS status
        FROM rooms
    """
    return jsonify(query_db(conn, query))


@app.route("/report/unallocated", methods=["GET"])
def report_unallocated():
    query = """
        SELECT s.student_id, s.name, s.roll_no, s.course
        FROM students s
        LEFT JOIN allocation a ON s.student_id = a.student_id
        WHERE a.student_id IS NULL
    """
    return jsonify(query_db(conn, query))


@app.route("/students/<int:student_id>", methods=["DELETE"])
def delete_student(student_id):
    try:
        query_db(conn, "DELETE FROM allocation WHERE student_id = ?", (student_id,))
        query_db(conn, "DELETE FROM students WHERE student_id = ?", (student_id,))
        return jsonify({"message": "Student deleted successfully"})
    except sqlite3.Error as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/<path:path>", methods=["GET"])
def serve_static(path):
    if (BASE_DIR / path).exists():
        return send_from_directory(str(BASE_DIR), path)
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)

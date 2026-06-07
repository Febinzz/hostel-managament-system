const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dumpPath = path.join(__dirname, "Dump20250922.sql");
const dbFile = path.join(__dirname, "hostel.db");

function parseSqlDumpStatements(sql) {
    sql = sql.replace(/--.*$/gm, "");
    sql = sql.replace(/\/\*![\s\S]*?\*\//g, "");
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, "");
    return sql
        .split(/;\s*(?:\r?\n|$)/)
        .map(stmt => stmt.trim())
        .filter(Boolean)
        .map(stmt => stmt.replace(/`/g, ""))
        .filter(stmt => {
            const lower = stmt.toLowerCase();
            return lower.startsWith("insert into students") ||
                lower.startsWith("insert into rooms") ||
                lower.startsWith("insert into allocation");
        });
}

function seedFromDump(db) {
    if (!fs.existsSync(dumpPath)) {
        console.error("❌ Dump file not found:", dumpPath);
        process.exit(1);
    }

    const dumpSql = fs.readFileSync(dumpPath, "utf8");
    const insertStatements = parseSqlDumpStatements(dumpSql);

    if (insertStatements.length === 0) {
        console.error("❌ No insert statements found in Dump20250922.sql");
        process.exit(1);
    }

    db.serialize(() => {
        db.run("PRAGMA foreign_keys = OFF");
        db.run("BEGIN TRANSACTION");
        insertStatements.forEach((stmt) => {
            db.run(stmt, (err) => {
                if (err) {
                    console.error("❌ Seed statement failed:", err.message, stmt);
                }
            });
        });
        db.run("COMMIT");
        db.run("PRAGMA foreign_keys = ON");
    });
}

const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error("❌ Failed to open database:", err.message);
        process.exit(1);
    }
    console.log("✅ Opened local SQLite database:", dbFile);
});

db.serialize(() => {
    db.run("PRAGMA foreign_keys = OFF");

    db.run("DROP TABLE IF EXISTS allocation");
    db.run("DROP TABLE IF EXISTS rooms");
    db.run("DROP TABLE IF EXISTS students");

    db.run("PRAGMA foreign_keys = ON");

    db.run(`CREATE TABLE students (
        student_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        roll_no TEXT UNIQUE,
        course TEXT,
        email TEXT
    )`);

    db.run(`CREATE TABLE rooms (
        room_id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_number TEXT UNIQUE,
        capacity INTEGER,
        occupied INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE allocation (
        alloc_id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        room_id INTEGER,
        FOREIGN KEY(student_id) REFERENCES students(student_id),
        FOREIGN KEY(room_id) REFERENCES rooms(room_id)
    )`);

    seedFromDump(db);
});

db.close((err) => {
    if (err) {
        console.error("❌ Failed to close database:", err.message);
        process.exit(1);
    }
    console.log("✅ Seed complete. Local database is ready.");
});

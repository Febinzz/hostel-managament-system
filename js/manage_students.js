const backend = window.location.origin || "http://localhost:5000";

// ------------------ LOAD ALLOCATIONS ------------------
const allocationsTable = document.querySelector("#allocationsList tbody");
const unallocatedTable = document.querySelector("#unallocatedStudentsList tbody");

async function loadStudents() {
    // Clear tables
    allocationsTable.innerHTML = "";
    unallocatedTable.innerHTML = "";

    try {
        // 1. Allocated Students
        const allocations = await fetch(`${backend}/allocations`).then(r => r.json());
        allocations.forEach(a => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${a.student_name} (${a.roll_no})</td>
                <td>${a.room_number}</td>
                <td><button class="deallocateBtn" data-student="${a.student_id}">Deallocate</button></td>
                <td><button class="deleteStudentBtn" data-student="${a.student_id}">Delete</button></td>
            `;
            allocationsTable.appendChild(tr);
        });

        // 2. Unallocated Students
        const unallocated = await fetch(`${backend}/report/unallocated`).then(r => r.json());
        unallocated.forEach(s => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${s.name}</td>
                <td>${s.roll_no}</td>
                <td>${s.course}</td>
                <td><button class="deleteStudentBtn" data-student="${s.student_id}">Delete</button></td>
            `;
            unallocatedTable.appendChild(tr);
        });

        addActionButtons();
    } catch (err) {
        console.error("Error loading students:", err);
    }
}

// ------------------ ADD BUTTON EVENTS ------------------
function addActionButtons() {
    // Deallocate
    document.querySelectorAll(".deallocateBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const studentId = btn.dataset.student;
            if (!confirm("Deallocate this student from room?")) return;
            try {
                const res = await fetch(`${backend}/allocation/${studentId}`, { method: "DELETE" });
                const data = await res.json();
                alert(data.message || data.error);
                loadStudents();
            } catch (err) { console.error(err); alert("Error deallocating student"); }
        });
    });

    // Delete student
    document.querySelectorAll(".deleteStudentBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const studentId = btn.dataset.student;
            if (!confirm("Delete this student completely?")) return;
            try {
                const res = await fetch(`${backend}/students/${studentId}`, { method: "DELETE" });
                const data = await res.json();
                alert(data.message || data.error);
                loadStudents();
            } catch (err) { console.error(err); alert("Error deleting student"); }
        });
    });
}

// ------------------ INIT ------------------
window.addEventListener("DOMContentLoaded", loadStudents);


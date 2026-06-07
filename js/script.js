const backend = window.location.origin || "http://localhost:5000";


// ---------------- Load Reports ----------------
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Student Report
    const studentTable = document.querySelector("#studentReport tbody");
    const students = await fetch(`${backend}/report/students`).then(r => r.json());
    students.forEach(s => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${s.name}</td><td>${s.roll_no}</td><td>${s.course}</td><td>${s.room_number || "Not Allocated"}</td>`;
        studentTable.appendChild(tr);
    });

    // 2. Unallocated Students
    const unallocatedTable = document.querySelector("#unallocatedReport tbody");
    const unallocated = await fetch(`${backend}/report/unallocated`).then(r => r.json());
    unallocated.forEach(s => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${s.name}</td><td>${s.roll_no}</td><td>${s.course}</td>`;
        unallocatedTable.appendChild(tr);
    });

    // 3. Rooms Report
    const roomTable = document.querySelector("#roomReport tbody");
    const rooms = await fetch(`${backend}/report/rooms`).then(r => r.json());
    rooms.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.room_number}</td><td>${r.capacity}</td><td>${r.occupied}</td><td>${r.status}</td>`;
        roomTable.appendChild(tr);
    });
});


// ------------------ FADE-IN EFFECT ------------------
document.addEventListener("DOMContentLoaded", () => {
    const containers = document.querySelectorAll(".container");
    containers.forEach(container => {
        container.style.opacity = 0;
        container.style.transform = "translateY(20px)";
        setTimeout(() => {
            container.style.transition = "all 0.7s ease";
            container.style.opacity = 1;
            container.style.transform = "translateY(0)";
        }, 100);
    });
});

// ------------------ STUDENT REGISTRATION ------------------
const registerForm = document.getElementById("registerForm");
if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("studentName").value.trim();
        const roll_no = document.getElementById("studentRoll").value.trim();
        const course = document.getElementById("studentCourse").value.trim();
        const email = document.getElementById("studentEmail").value.trim().toLowerCase();

        if (!email.endsWith("@mgits.ac.in")) {
            alert("Email must end with @mgits.ac.in");
            return;
        }

        try {
            const res = await fetch(`${backend}/students`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, roll_no, course, email })
            });
            const data = await res.json();
            if (res.ok) alert(`Student registered! Your ID: ${data.studentId}`);
            else alert(data.error);
            registerForm.reset();
        } catch (err) { console.error(err); alert("Error adding student"); }
    });
}

// ------------------ VIEW STUDENT ALLOCATION ------------------
const studentIdInput = document.getElementById("studentIdInput");
const allocationEl = document.getElementById("allocation");
const viewAllocationBtn = document.getElementById("viewAllocationBtn");

if (viewAllocationBtn && allocationEl && studentIdInput) {
    viewAllocationBtn.addEventListener("click", async () => {
        const studentId = studentIdInput.value.trim();
        if (!studentId) return alert("Please enter your Student ID");

        try {
            // 1. Fetch student info
            const studentRes = await fetch(`${backend}/students`);
            const students = await studentRes.json();
            const student = students.find(s => s.student_id == studentId);

            if (!student) {
                allocationEl.textContent = "❌ Student not found!";
                return;
            }

            // 2. Fetch allocation info
            const res = await fetch(`${backend}/allocation/${studentId}`);
            const data = await res.json();

            allocationEl.textContent = data.room_number
                ? `${student.name} → Room: ${data.room_number}`
                : `${student.name} → Not allocated yet`;
        } catch (err) {
            console.error(err);
            allocationEl.textContent = "⚠️ Error fetching allocation";
        }
    });
}


// Admin login: form now submits to backend; no client-side bypass.
const adminLoginForm = document.getElementById("adminLoginForm");
if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = document.getElementById("adminUsername").value.trim();
        const password = document.getElementById("adminPassword").value;

        try {
            const res = await fetch(`${backend}/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (res.ok) {
                window.location.href = "Admin_main.html";
            } else {
                alert(data.error || "Incorrect username or password");
            }
        } catch (err) {
            console.error(err);
            alert("Login failed. Please try again.");
        }
    });
}


// ------------------ ADD ROOM ------------------
const addRoomForm = document.getElementById("addRoomForm");
if (addRoomForm) {
    addRoomForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const room_number = document.getElementById("roomNumber").value;
        const capacity = Number(document.getElementById("roomCapacity").value);

        try {
            const res = await fetch(`${backend}/rooms`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_number, capacity })
            });
            const data = await res.json();
            if (res.ok) alert("Room added!");
            else alert(data.error);
            addRoomForm.reset();
        } catch (err) { console.error(err); alert("Error adding room"); }
    });
}

// ------------------ VIEW ROOMS ------------------
const roomsTable = document.getElementById("roomsList");

if (roomsTable) {
    fetch(`${backend}/report/rooms`)
        .then(res => res.json())
        .then(rooms => {
            rooms.forEach(room => {
                // Determine status class for coloring
                let statusClass = "status-empty"; // default
                if (room.status === "Full") statusClass = "status-full";
                else if (room.status === "Partially Filled") statusClass = "status-partial";
                else if (room.status === "Vacant") statusClass = "status-available";

                // Create table row
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td data-label="Room Number">${room.room_number}</td>
                    <td data-label="Capacity">${room.capacity}</td>
                    <td data-label="Occupied">${room.occupied}</td>
                    <td data-label="Status" class="${statusClass}">${room.status}</td>
                `;
                roomsTable.appendChild(tr);
            });
        })
        .catch(err => console.error("Error fetching rooms:", err));
}


// ------------------ ALLOCATE ROOM ------------------
const allocateForm = document.getElementById("allocateForm");
if (allocateForm) {
    async function loadStudentsAndRooms() {
        const studentSelect = document.getElementById("allocateStudent");
        const roomSelect = document.getElementById("allocateRoom");

        // Clear previous options
        studentSelect.innerHTML = '<option value="">Select Student</option>';
        roomSelect.innerHTML = '<option value="">Select Room</option>';

        // Load students
        const students = await fetch(`${backend}/students`).then(res => res.json());
        const allocations = await fetch(`${backend}/allocations`).then(res => res.json());
        const allocatedIds = allocations.map(a => a.student_id);

        students.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.student_id;
            opt.textContent = `${s.name} (${s.roll_no})`;
            if (allocatedIds.includes(s.student_id)) {
    opt.disabled = true;
    opt.textContent += " (Already Allocated)";
    opt.style.color = "gray";
}

            studentSelect.appendChild(opt);
        });

        // Load rooms
        const rooms = await fetch(`${backend}/rooms`).then(res => res.json());
        rooms.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r.room_id;
            opt.textContent = `${r.room_number} (Cap: ${r.capacity}, Occupied: ${r.occupied})`;
            roomSelect.appendChild(opt);
        });
    }

    allocateForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const student_id = Number(document.getElementById("allocateStudent").value);
        const room_id = Number(document.getElementById("allocateRoom").value);

        try {
            const res = await fetch(`${backend}/allocation`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id, room_id })
            });
            const data = await res.json();
            if (res.ok) alert("Student allocated!");
            else alert(data.error);
            allocateForm.reset();
            loadStudentsAndRooms(); // refresh options
        } catch (err) { console.error(err); alert("Error allocating room"); }
    });

    loadStudentsAndRooms();
}

// ------------------ VIEW AND DELETE ALLOCATIONS ------------------

const allocationsTable = document.getElementById("allocationsList");

if (allocationsTable) {
    async function loadAllocations() {
        allocationsTable.innerHTML = "";
        const allocations = await fetch(`${backend}/allocations`).then(res => res.json());
        allocations.forEach(a => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td data-label="Student">${a.student_name} (${a.roll_no})</td>
                <td data-label="Room">${a.room_number}</td>
                <td data-label="Action"><button class="deleteBtn" data-student="${a.student_id}">Delete</button></td>
            `;
            allocationsTable.appendChild(tr);
        });

        // Add delete event
        const deleteBtns = document.querySelectorAll(".deleteBtn");
        deleteBtns.forEach(btn => {
            btn.addEventListener("click", async () => {
                const studentId = btn.dataset.student;
                if (!confirm("Are you sure you want to delete this allocation?")) return;
                try {
                    const res = await fetch(`${backend}/allocation/${studentId}`, { method: "DELETE" });
                    const data = await res.json();
                    if (res.ok) alert(data.message);
                    else alert(data.error);
                    loadAllocations();
                } catch (err) { console.error(err); alert("Error deleting allocation"); }
            });
        });
    }

    loadAllocations();
}





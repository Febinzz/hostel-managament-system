const backend = window.location.origin || "http://localhost:5000";
const sendIdBtn = document.getElementById("sendIdBtn");
const forgotEmailInput = document.getElementById("forgotEmailInput");
const forgotStatus = document.getElementById("forgotStatus");

if (sendIdBtn && forgotEmailInput) {
    sendIdBtn.addEventListener("click", async () => {
        const email = forgotEmailInput.value.trim().toLowerCase();
        if (!email) {
            forgotStatus.textContent = "Please enter your registered email.";
            forgotStatus.style.color = "#ffb747";
            return;
        }

        sendIdBtn.disabled = true;
        forgotStatus.textContent = "Sending your student ID...";
        forgotStatus.style.color = "#ffffff";

        try {
            const res = await fetch(`${backend}/students/forgot-id`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (res.ok) {
                forgotStatus.textContent = data.message || "Student ID email sent.";
                forgotStatus.style.color = "#66bb6a";
            } else {
                forgotStatus.textContent = data.error || "Failed to send student ID.";
                forgotStatus.style.color = "#f44336";
            }
        } catch (err) {
            console.error(err);
            forgotStatus.textContent = "Unable to send email right now.";
            forgotStatus.style.color = "#f44336";
        } finally {
            sendIdBtn.disabled = false;
        }
    });
}

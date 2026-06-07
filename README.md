# Hostel Management

This project now uses a Flask backend.

## Run the app

1. Install Python dependencies:

   ```bash
   python3 -m pip install -r requirements.txt
   ```

2. Start the Flask server:

   ```bash
   python3 app.py
   ```

3. Open the app in a browser at:

   - `http://127.0.0.1:5000`

## Notes

- The Flask app serves the existing HTML, CSS, and JS frontend files.
- The Node/Express backend files have been removed.
- The database file is `hostel.db`.
- Email sending requires SMTP settings in `.env`.

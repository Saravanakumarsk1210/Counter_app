# ⚡ Smart Counter & Activity Tracker

A full-stack, production-grade counter web application designed with a **mobile-first** experience, powered by **Tailwind CSS**, a lightweight **Node.js/Express** backend, and **Neon Serverless PostgreSQL**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
![PostgreSQL](https://img.shields.io/badge/Database-Neon%20Postgres-00E599?style=flat&logo=postgresql&logoColor=white)
![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2F%20Express-339933?style=flat&logo=node.js&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Frontend-Tailwind%20CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)

---

## 📱 Highlights & Features

### 1. Interactive Counter
- **Large Touch Steppers**: Large, touch-friendly `+` and `−` buttons with tactile scale animations.
- **Click-to-Edit**: Tap or click directly on the counter number to type any custom value. Press <kbd>Enter</kbd> or click away to save.
- **Quick Reset**: Reset to 0 in one tap with confirmation.
- **Live Sync Indicator**: Visual header badge displaying connection status (`🟢 Connected to Neon PostgreSQL (Live DB)` vs `🟡 Standby Mode`).

### 2. Comprehensive Audit History
- **Main Screen Live Feed**: The latest 3 records are prominently displayed directly beneath the counter in real time.
- **Full History Drawer**: Tap **"History"** or **"View All"** to view the complete history modal.
- **12-Hour Timestamps**: All logs are recorded in strict 12-hour format with AM/PM (e.g., `Nov 1, 2026 at 05:33:15 PM`).
- **Action Tags & Value Deltas**: Clearly flags `+ Increment`, `− Decrement`, `✏️ Edit`, `🔄 Reset`, and `🛠️ Admin Force`, with exact numerical difference tags (e.g. `10 → 11 (+1)`).
- **CSV Data Export**: Download your entire history log to an Excel-friendly CSV file with one click.
- **Purge Logs**: Clear history records when needed (synced across client and database).

### 3. Admin & Maintenance Mode
- **Passkey Protection**: Secured with a 4-digit maintenance passkey.
- **System Maintenance Lock**:
  - Admin can toggle **Maintenance Mode ON** to temporarily restrict standard user edits and stepper buttons.
  - Displays a high-visibility animated "Under Maintenance" badge to visitors while Admin retains full modification access.
- **Administrative Stepper**: Force-set custom counter baselines or reset to zero with audit tags.
- **Custom Parameters**:
  - Configure Step Size (`1`, `5`, `10`, `50`, `100`).
  - Toggle negative number restrictions.
  - Factory reset to restore initial state and clean audit trails.

### 4. Production-Grade Architecture
- **Zero Exposed Credentials**: Direct browser-to-database connections are avoided; all database queries run through a secure backend layer with connection pooling.
- **Offline Fallback Resilience**: If network connectivity drops or the database is unconfigured, the app seamlessly falls back to cached browser storage (`localStorage`) without breaking.
- **PWA Ready**: Includes [`manifest.json`](manifest.json) for full-screen standalone installation on Android and iOS devices.

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────┐
│         Client (Mobile / Desktop)        │
│    • Tailwind CSS + Vanilla JavaScript   │
│    • Real-time Optimistic UI & Sync      │
│    • Local Storage Offline Cache         │
└────────────────────┬─────────────────────┘
                     │ HTTP / JSON REST API
┌────────────────────▼─────────────────────┐
│       Vercel Serverless / Express API    │
│    • Parameterized SQL queries           │
│    • State validation & maintenance lock │
│    • Connection pooling via @neondatabase│
└────────────────────┬─────────────────────┘
                     │ Secure SSL / TLS
┌────────────────────▼─────────────────────┐
│          Neon Serverless PostgreSQL      │
│    • counter_state (Live parameters)     │
│    • counter_history (Indexed logs)      │
└──────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

The database uses two normalized tables in Neon PostgreSQL:

### `counter_state`
| Column | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INT PRIMARY KEY` | `1` | Singleton row identifier |
| `count` | `INT NOT NULL` | `0` | Current aggregate count |
| `maintenance_mode` | `BOOLEAN NOT NULL` | `FALSE` | Maintenance lock state |
| `step` | `INT NOT NULL` | `1` | Increment/decrement step |
| `allow_negative` | `BOOLEAN NOT NULL` | `TRUE` | Whether count can go below 0 |
| `updated_at` | `TIMESTAMPTZ NOT NULL`| `NOW()` | Timestamp of last modification |

### `counter_history`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `VARCHAR(64) PRIMARY KEY` | Unique log entry identifier |
| `timestamp` | `TIMESTAMPTZ NOT NULL` | Timestamp of change event |
| `action` | `VARCHAR(32) NOT NULL` | Action type (`increment`, `decrement`, `direct_edit`, etc.) |
| `prev_value` | `INT NOT NULL` | Count before change |
| `new_value` | `INT NOT NULL` | Count after change |
| `difference` | `INT NOT NULL` | Delta (`new_value - prev_value`) |
| `source` | `VARCHAR(64) NOT NULL` | Trigger source (`User` or `Admin`) |

*An index (`idx_counter_history_timestamp`) is created on `counter_history (timestamp DESC)` for fast retrieval.*

---

## 🛠️ Project Structure

```
├── api/
│   └── index.js         # Vercel Serverless function entrypoint
├── index.html           # Single-page application UI (Tailwind CSS)
├── manifest.json        # Web app manifest for mobile PWA installation
├── migrate.js           # Database migration and verification utility
├── package.json         # Node.js dependencies and scripts
├── server.js            # Express backend & Neon PostgreSQL API
├── vercel.json          # Vercel deployment routing configuration
├── .env.example         # Template for environment variables
└── README.md            # Project documentation
```

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A [Neon PostgreSQL](https://neon.tech/) account (Free tier available)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Saravanakumarsk1210/Counter_app.git
   cd Counter_app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=require
   NEON_API_URL=https://<endpoint>.apirest.<region>.aws.neon.tech/<dbname>/rest/v1
   PORT=3000
   ```

4. **Initialize Database Tables:**
   ```bash
   node migrate.js
   ```

5. **Start the local server:**
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Vercel

This repository is pre-configured for zero-configuration Vercel deployment via [`vercel.json`](vercel.json):

1. Push your repository to GitHub.
2. Go to **[Vercel Dashboard](https://vercel.com/new)** and import your `Counter_app` repository.
3. Under **Environment Variables**, add:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string.
   - `NEON_API_URL`: Your Neon API URL.
4. Click **Deploy**. Vercel will build and provide a live production HTTPS domain in seconds.

---

## 🔐 Security & Best Practices

- **Credentials Safety**: `.env` is listed in `.gitignore` to prevent database secrets from ever reaching public source control.
- **SQL Injection Prevention**: All SQL statements use tagged template literals (`sql\`...\``) for automated query parameterization.
- **CORS & Headers**: API routes enforce JSON request validation and appropriate HTTP status codes (`400`, `403`, `500`).

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).

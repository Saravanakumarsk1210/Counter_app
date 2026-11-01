# Smart Counter Web App (Tailwind CSS + JS)

A clean, modern, and mobile-friendly counter web application built with **HTML5**, **Tailwind CSS**, and **Vanilla JavaScript**.

---

## 📱 Features

### 1. Interactive Counter
- **Large Display**: Crisp numeric display with smooth scale animation feedback.
- **Click to Edit**: Tap or click directly on the count number to type any custom value. Press <kbd>Enter</kbd> or click outside to confirm.
- **Touch-Friendly Buttons**: Large, responsive `+` and `−` buttons with visual tap feedback designed for mobile thumbs.
- **Quick Reset**: Reset count to 0 in one tap.

### 2. History Tracker
- **Main Screen Live Feed ("Latest Records")**: View the latest 3 activities directly below the counter with date, time, and values without opening a modal.
- **"View All" & Top-Right Button**: Opens the full comprehensive drawer modal with every entry recorded.
- **Persistent Storage**: All actions are automatically saved to browser `localStorage` and persist through page reloads.
- **Detailed Timestamps**: Records exact **Date** and **Time** in 12-hour format with **AM/PM** (e.g. `Nov 1, 2026 at 05:33:15 PM`).
- **Action Tags**: Distinguishes between `+ Increment`, `− Decrement`, `✏️ Direct Edit`, `🔄 Reset`, and `🛠️ Admin Override`.
- **Value Deltas**: Shows previous value, new value, and difference (e.g. `10 → 11 (+1)`).
- **Export CSV**: One-click download of all history records to an Excel-friendly CSV file.
- **Clear History**: Clear old audit logs whenever needed.

### 3. Admin & Maintenance Panel (Top-Right Icon)
- **Security PIN Gate**: Protected by 4-digit maintenance passkey.
- **Same Counter Scenario**: Admin has full access to adjust count (`+`, `−`, direct numeric override, force reset).
- **Maintenance Mode Switch**:
  - Turn **Maintenance Mode ON** to lock public user edits.
  - Standard users see an animated "Under Maintenance" badge and cannot increment, decrement, or edit the number until Admin turns it off.
- **Maintenance Parameters**:
  - Configure Step Size (`1`, `5`, `10`, `50`, `100`).
  - Allow or prevent negative numbers.
  - Purge audit logs or perform a full factory reset.

---

## ☁️ Deploying to Vercel

The project is fully configured for Vercel with serverless functions and CDN edge hosting via [`vercel.json`](file:///e:/MAnna/vercel.json) and [`api/index.js`](file:///e:/MAnna/api/index.js).

### Method A: Deploy via GitHub & Vercel Dashboard (Recommended)

1. Push this project to GitHub:
   ```bash
   git add .
   git commit -m "Ready for Vercel deployment"
   git branch -M main
   git remote add origin https://github.com/<username>/<repo-name>.git
   git push -u origin main
   ```
2. Open **[vercel.com/new](https://vercel.com/new)** and click **Import** next to your repository.
3. In the **Environment Variables** section, add:
   - **Key**: `DATABASE_URL`
   - **Value**: `postgresql://neondb_owner:npg_cfpPUEd8oHh1@ep-ancient-forest-b5cn5fwc-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
   - **Key**: `NEON_API_URL`
   - **Value**: `https://ep-ancient-forest-b5cn5fwc.apirest.c-7.us-east-2.aws.neon.tech/neondb/rest/v1`
4. Click **Deploy**. Your app will be live with a production HTTPS URL in ~30 seconds!

### Method B: Deploy from Terminal (Vercel CLI)

```bash
npx vercel
```
Follow the short on-screen prompts, add your `DATABASE_URL` under project settings in Vercel, and run `npx vercel --prod`.

The application is connected to **Neon Serverless PostgreSQL**:
- **Tables**:
  - `counter_state`: Stores persistent count, step size, allow-negative rule, and maintenance state.
  - `counter_history`: Stores full audit records with indexed timestamps.
- **Auto-Sync**: Every `+`, `−`, direct edit, or admin action writes directly to Neon PostgreSQL.
- **Offline Fallback**: Seamless fallback to local storage if network is disconnected.

---

## 🚀 How to Run

### Option 1: Full Production Server (Connected to Neon DB)
```bash
npm start
```
Open **`http://localhost:3000`** in your browser. The top header will display `🟢 Connected to Neon PostgreSQL (Live DB)`.

### Option 2: Standalone Static File
Double-click **`index.html`** to run in offline/local cache mode.


require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { neon, neonConfig } = require('@neondatabase/serverless');

// WebSocket setup for serverless driver if needed in Node.js
try {
  const ws = require('ws');
  neonConfig.webSocketConstructor = ws;
} catch (e) {
  // Optional in standard HTTP fetch environments
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Pre-load index.html for instant Vercel serverless response
let indexHtml = '';
try {
  indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
} catch (e) {
  console.warn('Could not pre-read index.html:', e.message);
}

// Explicit Root Routes (Prevents "Cannot GET /" error on Vercel)
app.get(['/', '/index.html'], (req, res) => {
  if (indexHtml) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(indexHtml);
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/manifest.json', (req, res) => {
  const manifestPath = path.join(__dirname, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    res.setHeader('Content-Type', 'application/json');
    return res.sendFile(manifestPath);
  }
  res.status(404).json({ error: 'Not found' });
});

// PWA Service Worker & Icons
app.get('/sw.js', (req, res) => {
  const swPath = path.join(__dirname, 'sw.js');
  if (fs.existsSync(swPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    return res.sendFile(swPath);
  }
  res.status(404).send('Service worker not found');
});

app.get('/icon-192.png', (req, res) => {
  const p = path.join(__dirname, 'icon-192.png');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.status(404).send('Icon not found');
});

app.get('/icon-512.png', (req, res) => {
  const p = path.join(__dirname, 'icon-512.png');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.status(404).send('Icon not found');
});

// Brand Logo Route
app.get(['/logo.png', '/Saravana Stores.png', '/Saravana%20Stores.png'], (req, res) => {
  const logoP = path.join(__dirname, 'logo.png');
  if (fs.existsSync(logoP)) {
    res.setHeader('Content-Type', 'image/png');
    return res.sendFile(logoP);
  }
  const altP = path.join(__dirname, 'Saravana Stores.png');
  if (fs.existsSync(altP)) {
    res.setHeader('Content-Type', 'image/png');
    return res.sendFile(altP);
  }
  res.status(404).send('Logo not found');
});

// -------------------------------------------------------------
// NEON DATABASE CONNECTION
// -------------------------------------------------------------
const DEFAULT_DATABASE_URL = "postgresql://neondb_owner:npg_cfpPUEd8oHh1@ep-ancient-forest-b5cn5fwc-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
let sql = null;
let isDbConnected = false;

try {
  sql = neon(databaseUrl);
  isDbConnected = true;
  console.log('[Neon DB] Initialized Neon Serverless client.');
} catch (err) {
  console.error('[Neon DB] Connection error:', err.message);
}

let isDbInitialized = false;

// Auto-migration & Schema Initialization
async function initializeDatabase() {
  if (!sql || isDbInitialized) return;
  try {
    // Test connection
    await sql`SELECT 1`;
    isDbConnected = true;

    // 1. Counter State Table
    await sql`
      CREATE TABLE IF NOT EXISTS counter_state (
        id INT PRIMARY KEY DEFAULT 1,
        count INT NOT NULL DEFAULT 0,
        maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
        step INT NOT NULL DEFAULT 1,
        allow_negative BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // Ensure initial row exists
    await sql`
      INSERT INTO counter_state (id, count, maintenance_mode, step, allow_negative)
      VALUES (1, 0, FALSE, 1, TRUE)
      ON CONFLICT (id) DO NOTHING;
    `;

    // 2. Counter History Table with Index
    await sql`
      CREATE TABLE IF NOT EXISTS counter_history (
        id VARCHAR(64) PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        action VARCHAR(32) NOT NULL,
        prev_value INT NOT NULL,
        new_value INT NOT NULL,
        difference INT NOT NULL,
        source VARCHAR(64) NOT NULL
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_counter_history_timestamp 
      ON counter_history (timestamp DESC);
    `;

    isDbInitialized = true;
    console.log('[Neon DB] ✅ Production schema initialized successfully.');
  } catch (err) {
    console.error('[Neon DB] ❌ Migration failed:', err.message);
    isDbConnected = false;
  }
}

// Ensure DB is initialized before API requests (supports serverless warm-up on Vercel)
app.use(async (req, res, next) => {
  if (sql && !isDbInitialized) {
    await initializeDatabase();
  }
  next();
});

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// Disable any caching on API routes so all devices get real-time state
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// DB Health Check
app.get('/api/status', async (req, res) => {
  if (!sql) {
    return res.json({
      connected: false,
      mode: 'standalone',
      message: 'DATABASE_URL is not configured in .env. Using client local storage.'
    });
  }
  try {
    await sql`SELECT 1`;
    res.json({
      connected: true,
      mode: 'neon_postgres',
      message: 'Connected to Neon PostgreSQL'
    });
  } catch (err) {
    res.json({
      connected: false,
      mode: 'error',
      message: err.message
    });
  }
});

// GET State from Neon DB
app.get('/api/state', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const rows = await sql`SELECT count, maintenance_mode, step, allow_negative, updated_at FROM counter_state WHERE id = 1`;
    if (rows.length === 0) {
      return res.json({ count: 0, maintenanceMode: false, step: 1, allowNegative: true, updatedAt: new Date().toISOString() });
    }
    const state = rows[0];
    res.json({
      count: state.count,
      maintenanceMode: state.maintenance_mode,
      step: state.step,
      allowNegative: state.allow_negative,
      updatedAt: state.updated_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET History from Neon DB
app.get('/api/history', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const rows = await sql`
      SELECT id, timestamp, action, prev_value AS "prevValue", new_value AS "newValue", difference, source
      FROM counter_history 
      ORDER BY timestamp DESC 
      LIMIT 100
    `;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE Count & Record History in Neon DB
app.post('/api/count', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  const { newValue, action, source } = req.body;
  if (typeof newValue !== 'number') {
    return res.status(400).json({ error: 'newValue must be a number' });
  }

  try {
    // 1. Get current count
    const currentRows = await sql`SELECT count, maintenance_mode FROM counter_state WHERE id = 1 FOR UPDATE`;
    const prevValue = currentRows[0]?.count ?? 0;
    const maintenanceMode = currentRows[0]?.maintenance_mode ?? false;

    // Check maintenance restriction if source is not Admin
    if (maintenanceMode && source !== 'Admin') {
      return res.status(403).json({ error: 'System is in maintenance mode. Only Admin can modify count.' });
    }

    const difference = newValue - prevValue;
    const id = 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const now = new Date();

    // 2. Update state & insert history
    await sql`
      UPDATE counter_state 
      SET count = ${newValue}, updated_at = ${now} 
      WHERE id = 1
    `;

    await sql`
      INSERT INTO counter_history (id, timestamp, action, prev_value, new_value, difference, source)
      VALUES (${id}, ${now}, ${action || 'modify'}, ${prevValue}, ${newValue}, ${difference}, ${source || 'User'})
    `;

    res.json({
      success: true,
      count: newValue,
      record: {
        id,
        timestamp: now.toISOString(),
        action: action || 'modify',
        prevValue,
        newValue,
        difference,
        source: source || 'User'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE Settings in Neon DB
app.post('/api/settings', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  const { maintenanceMode, step, allowNegative } = req.body;
  try {
    const currentRows = await sql`SELECT maintenance_mode, step, allow_negative FROM counter_state WHERE id = 1`;
    const current = currentRows[0] || {};
    
    const nextMaintenance = typeof maintenanceMode === 'boolean' ? maintenanceMode : current.maintenance_mode;
    const nextStep = typeof step === 'number' ? step : current.step;
    const nextAllowNegative = typeof allowNegative === 'boolean' ? allowNegative : current.allow_negative;

    await sql`
      UPDATE counter_state 
      SET 
        maintenance_mode = ${nextMaintenance},
        step = ${nextStep},
        allow_negative = ${nextAllowNegative},
        updated_at = NOW()
      WHERE id = 1
    `;
    res.json({ 
      success: true, 
      maintenanceMode: nextMaintenance, 
      step: nextStep, 
      allowNegative: nextAllowNegative 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CLEAR History in Neon DB (Admin)
app.delete('/api/history', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    await sql`TRUNCATE TABLE counter_history`;
    res.json({ success: true, message: 'History cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback route for SPA pages
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  if (indexHtml) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(indexHtml);
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;


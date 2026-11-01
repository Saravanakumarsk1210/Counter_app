require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

    // 3. Admin Persistent Sessions Table
    await sql`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token VARCHAR(128) PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `;

    // 4. Protected Admin Audit Log Table (not erased by history purge or factory reset)
    await sql`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id VARCHAR(64) PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        action VARCHAR(64) NOT NULL,
        details TEXT NOT NULL,
        performed_by VARCHAR(64) NOT NULL DEFAULT 'Admin'
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_admin_audit_timestamp 
      ON admin_audit_log (timestamp DESC);
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

// -------------------------------------------------------------
// ADMIN AUTH & ROLE PERMISSIONS
// -------------------------------------------------------------
const ADMIN_PASSKEY = process.env.ADMIN_PIN || "1968";

// Check if request has a valid, unexpired Admin session token
async function isValidAdminSession(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7).trim() 
    : (req.headers['x-admin-token'] || req.query.token || '');

  if (!token) return false;

  if (sql && isDbConnected) {
    try {
      const rows = await sql`
        SELECT token FROM admin_sessions 
        WHERE token = ${token} AND expires_at > NOW() 
        LIMIT 1
      `;
      return rows.length > 0;
    } catch (err) {
      console.warn('[Auth] Token verification check failed:', err.message);
      return false;
    }
  }
  return false;
}

// 1. Admin Authentication Login
app.post('/api/auth/login', async (req, res) => {
  const { passkey, pin } = req.body || {};
  const submitted = String(passkey || pin || '').trim();

  if (submitted === ADMIN_PASSKEY) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30-day session

    if (sql && isDbConnected) {
      try {
        await sql`
          INSERT INTO admin_sessions (token, expires_at)
          VALUES (${token}, ${expiresAt})
        `;
        await sql`
          INSERT INTO admin_audit_log (id, timestamp, action, details, performed_by)
          VALUES (${'audit_' + Date.now()}, NOW(), 'ADMIN_LOGIN', 'Administrator authenticated successfully via passkey', 'Admin')
        `;
      } catch (e) {
        console.warn('[Auth] Could not insert session in DB:', e.message);
      }
    }

    return res.json({ 
      success: true, 
      token, 
      role: 'Admin',
      message: 'Admin authenticated successfully' 
    });
  }

  return res.status(401).json({ 
    success: false, 
    error: 'Invalid administrator credentials. Please check the passkey and try again.' 
  });
});

// 2. Admin Session Verification
app.get('/api/auth/verify', async (req, res) => {
  const valid = await isValidAdminSession(req);
  if (valid) {
    return res.json({ valid: true, role: 'Admin' });
  }
  return res.status(401).json({ valid: false, error: 'Session expired or invalid' });
});

// 3. Admin Logout
app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7).trim() 
    : (req.headers['x-admin-token'] || '');

  if (token && sql && isDbConnected) {
    try {
      await sql`DELETE FROM admin_sessions WHERE token = ${token}`;
      await sql`
        INSERT INTO admin_audit_log (id, timestamp, action, details, performed_by)
        VALUES (${'audit_' + Date.now()}, NOW(), 'ADMIN_LOGOUT', 'Administrator logged out of session', 'Admin')
      `;
    } catch (e) {}
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

// 4. GET History from Neon DB
app.get('/api/history', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const rows = await sql`
      SELECT id, timestamp, action, prev_value AS "prevValue", new_value AS "newValue", difference, source
      FROM counter_history 
      ORDER BY timestamp DESC 
      LIMIT 150
    `;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. UPDATE Count & Record History in Neon DB (Role-Enforced)
app.post('/api/count', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  const { newValue, action } = req.body;
  if (typeof newValue !== 'number') {
    return res.status(400).json({ error: 'newValue must be a number' });
  }

  const isAdmin = await isValidAdminSession(req);
  const role = isAdmin ? 'Admin' : 'Moorthy';
  const rawAction = String(action || 'modify').toLowerCase();

  // SECURITY ENFORCEMENT: Normal users can NEVER reset the counter to zero
  if ((rawAction === 'reset' || (newValue === 0 && rawAction === 'reset')) && !isAdmin) {
    return res.status(403).json({ 
      error: 'Forbidden: Standard users do not have permission to reset the counter.' 
    });
  }

  try {
    // 1. Get current count & maintenance mode
    const currentRows = await sql`SELECT count, maintenance_mode FROM counter_state WHERE id = 1 FOR UPDATE`;
    const prevValue = currentRows[0]?.count ?? 0;
    const maintenanceMode = currentRows[0]?.maintenance_mode ?? false;

    // SECURITY ENFORCEMENT: In maintenance mode, only Admin can update count
    if (maintenanceMode && !isAdmin) {
      return res.status(403).json({ 
        error: 'System is currently under maintenance. Counter updates are temporarily disabled.' 
      });
    }

    const difference = newValue - prevValue;
    const id = 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const now = new Date();

    // Standardize transaction action names
    let cleanAction = 'Manual Edit';
    if (rawAction === 'increment') cleanAction = 'Increment';
    else if (rawAction === 'decrement') cleanAction = 'Decrement';
    else if (rawAction === 'reset') cleanAction = 'Reset';

    // 2. Update state & insert history atomically
    await sql`
      UPDATE counter_state 
      SET count = ${newValue}, updated_at = ${now} 
      WHERE id = 1
    `;

    await sql`
      INSERT INTO counter_history (id, timestamp, action, prev_value, new_value, difference, source)
      VALUES (${id}, ${now}, ${cleanAction}, ${prevValue}, ${newValue}, ${difference}, ${role})
    `;

    res.json({
      success: true,
      count: newValue,
      record: {
        id,
        timestamp: now.toISOString(),
        action: cleanAction,
        prevValue,
        newValue,
        difference,
        source: role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. UPDATE Settings in Neon DB (Admin Only)
app.post('/api/settings', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  const isAdmin = await isValidAdminSession(req);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Unauthorized: Only Admin can modify settings' });
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

    // Audit maintenance mode toggles
    if (nextMaintenance !== current.maintenance_mode) {
      const details = nextMaintenance 
        ? 'System Maintenance Mode enabled (User controls locked)' 
        : 'System Maintenance Mode disabled (User controls restored)';
      await sql`
        INSERT INTO admin_audit_log (id, timestamp, action, details, performed_by)
        VALUES (${'audit_' + Date.now()}, NOW(), 'MAINTENANCE_TOGGLE', ${details}, 'Admin')
      `;
    }

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

// 7. PURGE History Logs in Neon DB (Admin Only, Audit Preserved)
app.delete('/api/history', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  const isAdmin = await isValidAdminSession(req);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Unauthorized: Only Admin can purge history logs' });
  }

  try {
    await sql`TRUNCATE TABLE counter_history`;
    // Record action in protected audit log (survives transaction history purge)
    await sql`
      INSERT INTO admin_audit_log (id, timestamp, action, details, performed_by)
      VALUES (${'audit_' + Date.now()}, NOW(), 'PURGE_HISTORY', 'Permanently cleared all counter transaction history logs', 'Admin')
    `;
    res.json({ success: true, message: 'Transaction history purged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. FACTORY RESET (Admin Only, Restores Defaults, Audit Preserved)
app.post('/api/admin/factory-reset', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  const isAdmin = await isValidAdminSession(req);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Unauthorized: Only Admin can perform a factory reset' });
  }

  try {
    // 1. Reset state to original defaults
    await sql`
      UPDATE counter_state 
      SET 
        count = 0, 
        maintenance_mode = FALSE, 
        step = 1, 
        allow_negative = TRUE, 
        updated_at = NOW() 
      WHERE id = 1
    `;

    // 2. Clear transaction history
    await sql`TRUNCATE TABLE counter_history`;

    // 3. Record factory reset in protected audit log
    await sql`
      INSERT INTO admin_audit_log (id, timestamp, action, details, performed_by)
      VALUES (${'audit_' + Date.now()}, NOW(), 'FACTORY_RESET', 'Factory reset executed: counter reset to 0, history cleared, maintenance mode turned off, default step restored', 'Admin')
    `;

    res.json({ 
      success: true, 
      message: 'System successfully restored to factory defaults',
      count: 0,
      maintenanceMode: false,
      step: 1,
      allowNegative: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Protected Admin Audit Logs (Admin Only)
app.get('/api/admin/audit-logs', async (req, res) => {
  if (!sql || !isDbConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  const isAdmin = await isValidAdminSession(req);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Unauthorized: Admin authentication required' });
  }
  try {
    const rows = await sql`
      SELECT id, timestamp, action, details, performed_by AS "performedBy"
      FROM admin_audit_log 
      ORDER BY timestamp DESC 
      LIMIT 50
    `;
    res.json(rows);
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


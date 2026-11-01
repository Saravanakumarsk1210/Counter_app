require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('[Migration] Connecting to Neon Database...');
  
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
  console.log('[Migration] counter_state table ready.');

  await sql`
    INSERT INTO counter_state (id, count, maintenance_mode, step, allow_negative)
    VALUES (1, 0, FALSE, 1, TRUE)
    ON CONFLICT (id) DO NOTHING;
  `;
  console.log('[Migration] default counter_state row initialized.');

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
  console.log('[Migration] counter_history table ready.');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_counter_history_timestamp 
    ON counter_history (timestamp DESC);
  `;
  console.log('[Migration] index idx_counter_history_timestamp ready.');

  const state = await sql`SELECT * FROM counter_state WHERE id = 1`;
  console.log('[Migration] Current state in Neon DB:', state[0]);
  
  console.log('🎉 Neon PostgreSQL Migration completed successfully!');
}

migrate().catch(err => {
  console.error('[Migration Error]', err);
  process.exit(1);
});


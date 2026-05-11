import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function listTablesAndCleanup() {
  // List tables
  console.log('--- TABLES ---');
  const res = await db.run(sql`SELECT name FROM sqlite_master WHERE type='table'`);
  res.rows.forEach(row => console.log(`- ${row.name}`));

  // Cleanup logs
  console.log('\n--- CLEANUP ---');
  await db.run(sql`DELETE FROM tracking_logs`);
  console.log('Cleared all logs from tracking_logs');
}

listTablesAndCleanup().catch(console.error);

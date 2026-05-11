import { sharedClient } from '../src/lib/db';

async function listSharedTables() {
  console.log('--- SHARED DB TABLES ---');
  const res = await sharedClient.execute("SELECT name FROM sqlite_master WHERE type='table'");
  res.rows.forEach(row => console.log(`- ${row.name}`));
}

listSharedTables().catch(console.error);

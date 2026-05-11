import { db } from '../src/lib/db';

async function listTables() {
  const res = await db.run({sql: "SELECT name FROM sqlite_master WHERE type='table'"});
  console.log('Tables in database:');
  res.rows.forEach(row => console.log(`- ${row.name}`));
}

listTables().catch(console.error);

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const c = createClient({ url: process.env.TURSO_SHARED_URL!, authToken: process.env.TURSO_SHARED_TOKEN! });
  const res = await c.execute('SELECT * FROM OVN_DATA LIMIT 1');
  console.log(res.columns);
}
run().catch(console.error);

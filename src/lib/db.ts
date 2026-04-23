import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./dummy.db',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

export const db = drizzle(client);

const sharedClient = createClient({
  url: process.env.TURSO_SHARED_URL || '',
  authToken: process.env.TURSO_SHARED_TOKEN || '',
});

export const sharedDb = drizzle(sharedClient);

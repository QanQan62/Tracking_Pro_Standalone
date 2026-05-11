import { db } from './src/lib/db';
import { trackingOrders, trackingLogs } from './src/db/schema';
import { like, or } from 'drizzle-orm';

async function main() {
  const resultLogs = await db.delete(trackingLogs).where(
    or(
      like(trackingLogs.orderCode, 'Xe-%'),
      like(trackingLogs.orderCode, 'XE-%'),
      like(trackingLogs.orderCode, 'xe-%')
    )
  ).execute();
  console.log('Deleted bad logs');

  const resultOrders = await db.delete(trackingOrders).where(
    or(
      like(trackingOrders.orderCode, 'Xe-%'),
      like(trackingOrders.orderCode, 'XE-%'),
      like(trackingOrders.orderCode, 'xe-%')
    )
  ).execute();
  console.log('Deleted bad orders');
}

main().catch(console.error);

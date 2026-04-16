import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const trackingCarts = sqliteTable('tracking_carts', {
  code: text('code').primaryKey(),
  location: text('location'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at'),
});

export const trackingOrders = sqliteTable('tracking_orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderCode: text('order_code').notNull().unique(),
  category: text('category'),
  msnv: text('msnv'),
  station: text('station'),
  location: text('location'),
  updatedAt: text('updated_at'),
});

export const trackingLogs = sqliteTable('tracking_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull(),
  orderCode: text('order_code').notNull(),
  action: text('action'),
  fromStation: text('from_station'),
  toStation: text('to_station'),
  note: text('note'),
});

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const posStoreData = sqliteTable("pos_store_data", {
  storeId: text("store_id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

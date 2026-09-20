import * as SQLite from "expo-sqlite";
import { initialize } from "./queue.mjs";
import type { Product } from "../../lib/types";
let promise: Promise<SQLite.SQLiteDatabase> | null = null;
export function database() {
  if (!promise)
    promise = SQLite.openDatabaseAsync("perpetual-pos.db").then(async (db) => {
      await initialize(db);
      return db;
    });
  return promise;
}
export async function cacheProducts(scope: string, products: Product[]) {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM product_cache WHERE scope=?", scope);
    for (const p of products)
      await tx.runAsync(
        "INSERT INTO product_cache(scope,id,data) VALUES(?,?,?)",
        scope,
        p.id,
        JSON.stringify(p),
      );
  });
}
export async function cachedProducts(scope: string) {
  const db = await database();
  const result = await db.getAllAsync<{ data: string }>(
    "SELECT data FROM product_cache WHERE scope=?",
    scope,
  );
  return result.map((p) => JSON.parse(p.data) as Product);
}

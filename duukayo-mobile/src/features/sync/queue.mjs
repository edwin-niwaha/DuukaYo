export const schema = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS product_cache(scope TEXT NOT NULL,id INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(scope,id));
CREATE TABLE IF NOT EXISTS sale_queue(scope TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',error TEXT NOT NULL DEFAULT '',response TEXT,created_at TEXT NOT NULL,PRIMARY KEY(scope,id));
CREATE INDEX IF NOT EXISTS queue_scope_state ON sale_queue(scope,state);
`;
export async function initialize(db) {
  await db.execAsync(schema);
}
export async function enqueue(db, scope, payload) {
  await db.runAsync(
    "INSERT INTO sale_queue(scope,id,payload,created_at) VALUES(?,?,?,?)",
    scope,
    payload.client_id,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}
export async function rows(db, scope) {
  return db.getAllAsync(
    "SELECT * FROM sale_queue WHERE scope=? ORDER BY created_at DESC",
    scope,
  );
}
const syncing = new Set();
export async function synchronize(db, scope, upload) {
  if (syncing.has(scope)) return;
  syncing.add(scope);
  try {
    const pending = await db.getAllAsync(
      "SELECT * FROM sale_queue WHERE scope=? AND state='pending' ORDER BY created_at",
      scope,
    );
    for (const row of pending) {
      try {
        const result = await upload(JSON.parse(row.payload));
        const review = result.review_reasons?.length > 0;
        await db.runAsync(
          "UPDATE sale_queue SET state=?,response=?,error=? WHERE scope=? AND id=?",
          review ? "needs-review" : "synchronized",
          JSON.stringify(result),
          review ? result.review_reasons.join("; ") : "",
          scope,
          row.id,
        );
      } catch (e) {
        const permanent =
          e.status >= 400 &&
          e.status < 500 &&
          ![401, 403, 408, 429].includes(e.status);
        await db.runAsync(
          "UPDATE sale_queue SET state=?,error=? WHERE scope=? AND id=?",
          permanent ? "needs-review" : "pending",
          String(e.message || e),
          scope,
          row.id,
        );
        if (!permanent) throw e;
      }
    }
  } finally {
    syncing.delete(scope);
  }
}
export async function retry(db, scope, id) {
  await db.runAsync(
    "UPDATE sale_queue SET state='pending',error='' WHERE scope=? AND id=? AND response IS NULL",
    scope,
    id,
  );
}

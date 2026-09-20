const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
function adapter(path) {
  const db = new DatabaseSync(path);
  return {
    db,
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
  };
}
test("sale persists across restart and sync recovers after a lost response", async () => {
  const q = await import("../src/features/sync/queue.mjs");
  const dir = mkdtempSync(join(tmpdir(), "pos-queue-"));
  const path = join(dir, "test.db");
  let db = adapter(path);
  try {
    await q.initialize(db);
    await q.enqueue(db, "user:business:branch", {
      client_id: "one",
      tendered: 5000,
    });
    db.db.close();
    db = adapter(path);
    await q.initialize(db);
    assert.equal((await q.rows(db, "user:business:branch")).length, 1);
    const server = new Map();
    let calls = 0;
    const upload = async (payload) => {
      calls++;
      server.set(payload.client_id, { id: 1, review_reasons: [] });
      if (calls === 1) throw new Error("Response lost");
      return server.get(payload.client_id);
    };
    await assert.rejects(q.synchronize(db, "user:business:branch", upload));
    assert.equal(
      (await q.rows(db, "user:business:branch"))[0].state,
      "pending",
    );
    await q.synchronize(db, "user:business:branch", upload);
    assert.equal(server.size, 1);
    assert.equal(
      (await q.rows(db, "user:business:branch"))[0].state,
      "synchronized",
    );
    await q.synchronize(db, "user:business:branch", upload);
    assert.equal(calls, 2);
  } finally {
    db.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("queue is scoped, conflicts retained, revoked access never discards sales", async () => {
  const q = await import("../src/features/sync/queue.mjs");
  const db = adapter(":memory:");
  await q.initialize(db);
  try {
    await q.enqueue(db, "a", { client_id: "one" });
    await q.enqueue(db, "b", { client_id: "one" });
    assert.equal((await q.rows(db, "a")).length, 1);
    await assert.rejects(
      q.synchronize(db, "a", async () => {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }),
    );
    assert.equal((await q.rows(db, "a"))[0].state, "pending");
    await q.synchronize(db, "a", async () => ({
      review_reasons: ["Stale price"],
    }));
    assert.equal((await q.rows(db, "a"))[0].state, "needs-review");
    assert.equal((await q.rows(db, "b"))[0].state, "pending");
    await q.retry(db, "a", "one");
    assert.equal((await q.rows(db, "a"))[0].state, "needs-review");
    await q.synchronize(db, "b", async () => {
      throw Object.assign(new Error("Invalid product"), { status: 400 });
    });
    assert.equal((await q.rows(db, "b"))[0].state, "needs-review");
    await q.retry(db, "b", "one");
    assert.equal((await q.rows(db, "b"))[0].state, "pending");
  } finally {
    db.db.close();
  }
});

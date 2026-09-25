"use client";
import { useFeedback } from "../../lib/feedback";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  money,
  type Membership,
  type Product,
  type Sale,
} from "@/lib/api";
import { definiteRejection } from "@/lib/order-attempt";
type Shift = {
  id: number;
  register_name: string;
  expected_cash: number;
  counted_cash: number | null;
  closed: boolean;
  cashier: number;
};
type Transfer = {
  id: number;
  source: number;
  destination: number;
  product: number;
  quantity: number;
  status: string;
};
type Attempt = { path: string; body: Record<string, unknown> };
export default function OperationsPanel({
  membership,
  userId,
  products,
  sales,
  reload,
}: {
  membership: Membership;
  userId: number;
  products: Product[];
  sales: Sale[];
  reload: () => Promise<void>;
}) {
  const base = `businesses/${membership.business.id}/`,
    storageKey = `duukayo-operation:${userId}:${membership.business.id}:${membership.branch}`;
  const [registers, setRegisters] = useState<{ id: number; name: string }[]>(
      [],
    ),
    [shifts, setShifts] = useState<Shift[]>([]),
    [transfers, setTransfers] = useState<Transfer[]>([]);
  const [error, setError] = useFeedback("error"),
    [notice, setNotice] = useFeedback("info"),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Attempt | null>(null);
  const running = useRef(false);
  const manager = membership.role !== "cashier";
  const load = useCallback(async () => {
    const [r, s, t] = await Promise.all([
      api<typeof registers>(base + "registers/"),
      api<Shift[]>(base + "shifts/"),
      manager ? api<Transfer[]>(base + "transfers/") : Promise.resolve([]),
    ]);
    setRegisters(r);
    setShifts(s);
    setTransfers(t);
  }, [base, manager]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    try {
      setPending(JSON.parse(localStorage.getItem(storageKey) || "null"));
    } catch {
      setError(
        "Saved operation could not be read. Resolve it before starting another operation.",
      );
    }
  }, [load, storageKey, setError]);
  async function command(
    path: string,
    body: Record<string, unknown>,
    retry = false,
  ) {
    if (running.current) return;
    if (pending && !retry) {
      setError("Retry the pending operation first.");
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const attempt =
      retry && pending
        ? pending
        : { path, body: { ...body, client_id: crypto.randomUUID() } };
    try {
      localStorage.setItem(storageKey, JSON.stringify(attempt));
      setPending(attempt);
      await api(attempt.path, attempt.body);
      localStorage.removeItem(storageKey);
      setPending(null);
      setNotice("Operation recorded.");
    } catch (e) {
      if (
        definiteRejection(e) &&
        ![401, 403, 404].includes((e as { status: number }).status)
      ) {
        localStorage.removeItem(storageKey);
        setPending(null);
      }
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
    try {
      await load();
      await reload();
    } catch {
      setError(
        "The operation result is shown above. Refresh to reload records.",
      );
    }
  }
  function form(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return new FormData(event.currentTarget);
  }
  const ownShift = shifts.find((s) => !s.closed && s.cashier === userId);
  return (
    <section className="operations-panel">
      <p className="muted">
        Manage your register, returns and branch stock. Money values are in{" "}
        {membership.business.currency}.
      </p>
      {error && (
        <p className="error">
          {error}
        </p>
      )}
      {notice && <p>{notice}</p>}
      {pending && (
        <button
          disabled={busy}
          onClick={() => void command(pending.path, pending.body, true)}
        >
          Retry pending operation
        </button>
      )}
      <div className="operations-grid">
        <section className="panel">
          <h2>Register & cash drawer</h2>
          {manager && (
            <form
              onSubmit={(e) => {
                const f = form(e);
                void command(base + "registers/", { name: f.get("name") });
              }}
            >
              <label>
                Register name
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="Front counter"
                />
              </label>
              <button disabled={busy || !!pending}>Add register</button>
            </form>
          )}
          {!ownShift ? (
            <form
              onSubmit={(e) => {
                const f = form(e);
                void command(base + "shifts/", {
                  action: "open",
                  register: Number(f.get("register")),
                  amount: Number(f.get("amount")),
                });
              }}
            >
              <label>
                Register
                <select name="register" required>
                  {registers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Opening cash
                <input name="amount" type="number" min="0" step="1" required />
              </label>
              <button disabled={busy || !!pending || !registers.length}>
                Open shift
              </button>
            </form>
          ) : (
            <>
              <p>
                <strong>{ownShift.register_name}</strong> · Expected cash{" "}
                {money(ownShift.expected_cash, membership.business.currency)}
              </p>
              <form
                onSubmit={(e) => {
                  const f = form(e);
                  void command(base + "shifts/", {
                    action: f.get("action"),
                    shift: ownShift.id,
                    amount: Number(f.get("amount")),
                    reason: f.get("reason"),
                  });
                }}
              >
                <label>
                  Action
                  <select name="action">
                    <option value="close">Close & balance shift</option>
                    {manager && (
                      <>
                        <option value="cash_in">Record cash in</option>
                        <option value="cash_out">Record cash out</option>
                      </>
                    )}
                  </select>
                </label>
                <label>
                  Counted cash / movement amount
                  <input
                    name="amount"
                    type="number"
                    min="0"
                    step="1"
                    required
                  />
                </label>
                <label>
                  Reason or discrepancy explanation
                  <input name="reason" maxLength={250} />
                </label>
                <button disabled={busy || !!pending}>
                  Record cash operation
                </button>
              </form>
            </>
          )}
          {shifts
            .filter((s) => s.closed)
            .slice(0, 5)
            .map((s) => (
              <p key={s.id}>
                {s.register_name}: counted {money(s.counted_cash || 0)} ·
                expected {money(s.expected_cash)}
              </p>
            ))}
        </section>
        {manager && (
          <section className="panel">
            <h2>Returns & refunds</h2>
            <p className="muted">
              Record money actually returned to the customer. Mobile-money
              refunds require a transaction reference.
            </p>
            <form
              onSubmit={(e) => {
                const f = form(e);
                const [sale, line] = String(f.get("line")).split(":");
                void command(base + `sales/${sale}/returns/`, {
                  reason: f.get("reason"),
                  method: f.get("method"),
                  reference: f.get("reference"),
                  lines: [
                    {
                      line: Number(line),
                      quantity: Number(f.get("quantity")),
                      restock: f.get("restock") === "on",
                    },
                  ],
                });
              }}
            >
              <label>
                Sold item
                <select name="line" required>
                  {sales.flatMap((s) =>
                    s.lines
                      .filter((l) => l.id)
                      .map((l) => (
                        <option key={l.id} value={`${s.id}:${l.id}`}>
                          Receipt #{s.id} · {l.name} · sold {l.quantity}
                        </option>
                      )),
                  )}
                </select>
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue="1"
                />
              </label>
              <label>
                Reason
                <input name="reason" required minLength={3} maxLength={250} />
              </label>
              <label>
                Refund method
                <select name="method">
                  <option value="cash">Cash returned</option>
                  <option value="manual_mtn">MTN refund received</option>
                  <option value="manual_airtel">Airtel refund received</option>
                </select>
              </label>
              <label>
                Transaction reference
                <input name="reference" maxLength={100} />
              </label>
              <label className="check">
                <input name="restock" type="checkbox" defaultChecked /> Return
                sellable items to stock
              </label>
              <button disabled={busy || !!pending || !sales.length}>
                Record return & refund
              </button>
            </form>
          </section>
        )}
        {manager && (
          <section className="panel">
            <h2>Branch transfers</h2>
            <form
              onSubmit={(e) => {
                const f = form(e);
                void command(base + "transfers/", {
                  action: "dispatch",
                  product: Number(f.get("product")),
                  destination: Number(f.get("destination")),
                  quantity: Number(f.get("quantity")),
                  reference: f.get("reference"),
                });
              }}
            >
              <label>
                Product
                <select name="product" required>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination
                <select name="destination" required>
                  {membership.business.branches
                    ?.filter((b) => b.id !== membership.branch)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  required
                />
              </label>
              <label>
                Dispatch reference
                <input name="reference" maxLength={100} />
              </label>
              <button disabled={busy || !!pending}>Dispatch stock</button>
            </form>
            {transfers.map((t) => (
              <div key={t.id}>
                <p>
                  Transfer #{t.id} · {t.quantity} items · {t.status}
                </p>
                {t.destination === membership.branch &&
                  t.status === "dispatched" && (
                    <button
                      disabled={busy || !!pending}
                      onClick={() =>
                        void command(base + "transfers/", {
                          action: "receive",
                          transfer: t.id,
                        })
                      }
                    >
                      Confirm receipt #{t.id}
                    </button>
                  )}
              </div>
            ))}
          </section>
        )}
      </div>
    </section>
  );
}

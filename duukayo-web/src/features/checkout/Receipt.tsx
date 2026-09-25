import { money, Sale } from "@/lib/api";
export default function Receipt({ sale, shop }: { sale: Sale; shop: string }) {
  const text = [
    shop,
    `Receipt #${sale.id}`,
    ...sale.lines.map(
      (l) =>
        `${l.quantity} x ${l.name}: ${money(l.quantity * l.price - l.discount, sale.currency)}`,
    ),
    `Delivery: ${money(sale.delivery_fee, sale.currency)}`,
    `Total: ${money(sale.total, sale.currency)}`,
    `Payment: ${sale.payment.method}`,
    ...(sale.allocations || []).map(part => `${part.method}: ${money(part.amount, sale.currency)}${part.reference ? " · " + part.reference : ""}`),
    `Change: ${money(sale.payment.change, sale.currency)}`,
    "Thank you for shopping with us.",
  ].join("\n");
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${sale.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="receipt">
      <p className="eyebrow">Sale completed</p>
      <h2>{shop}</h2>
      <pre>{text}</pre>
      {sale.review_reasons.length > 0 && (
        <p className="notice">Needs review: {sale.review_reasons.join(", ")}</p>
      )}
      <button onClick={download}>Download receipt</button>
      <button className="secondary" onClick={() => window.print()}>
        Print receipt view
      </button>
      <p className="muted">
        Browser print dialog. Physical receipt printers have not been tested.
      </p>
    </section>
  );
}

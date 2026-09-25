import Icon from "./Icon";

export default function CatalogPagination({ page, pages, onPage, label }: {
  page: number; pages: number; onPage: (page: number) => void; label: string;
}) {
  const candidates = new Set([1, pages, page]);
  const start = page <= 3 ? 1 : page >= pages - 2 ? Math.max(1, pages - 3) : page - 1;
  const end = page <= 3 ? Math.min(4, pages) : page >= pages - 2 ? pages : page + 1;
  for (let n = start; n <= end; n++) candidates.add(n);
  const numbers = [...candidates].sort((a, b) => a - b);

  return <nav className="catalog-pagination numbered-pagination" aria-label={label}>
    <button className="secondary pagination-previous" aria-label="Previous products" disabled={page === 1} onClick={() => onPage(page - 1)}><Icon name="left" /><span>Previous</span></button>
    <div className="pagination-numbers">{numbers.map((n, i) => <span className="pagination-item" key={n}>
      {i > 0 && n - numbers[i - 1] > 1 && <span className="pagination-gap" aria-hidden="true">…</span>}
      <button className={page === n ? "pagination-current" : "secondary"} aria-label={`Page ${n}`} aria-current={page === n ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>
    </span>)}</div>
    <button className="secondary pagination-next" aria-label="Next products" disabled={page === pages} onClick={() => onPage(page + 1)}><span>Next</span><Icon name="right" /></button>
  </nav>;
}

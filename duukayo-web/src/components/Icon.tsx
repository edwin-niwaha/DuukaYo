const paths: Record<string, string> = {
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  Shops: "M3 10V4h18v6M2 10h20M4 10v11h16V10M9 21v-7h6v7M8 4l-1 6M16 4l1 6",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3ZM12 8v5M12 16h.01",
  wallet: "M3 6a2 2 0 0 1 2-2h14v4H5a2 2 0 0 1 0-4M3 6v14h18V8M16 12h5v5h-5z",
  calendar: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2",
  Operations: "M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4",
  Overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  Checkout: "M3 3h2l3 12h10l3-8H6M9 20h.01M18 20h.01",
  Catalog: "m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9",
  Inventory: "M3 7h18v14H3zM2 3h20v4H2zM9 11h6",
  Orders: "M6 3h12v19l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6",
  Customers: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4",
  Sales: "M4 3v18h17M8 16v-4M13 16V8M18 16V5",
  Settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  Team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM20 7v6M17 10h6",
  left: "M20 12H4m6-6-6 6 6 6",
  right: "M4 12h16m-6-6 6 6-6 6",
  refresh: "M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 7M4 12l3 7a7 7 0 0 0 12-3",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "m6 6 12 12M6 18 18 6",
  external: "M14 3h7v7M21 3 10 14M10 3H3v18h18v-7",
  logout: "M9 3H3v18h6M9 12h12m-5-5 5 5-5 5",
  plus: "M12 5v14M5 12h14",
  edit: "m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5",
  copy: "M9 9h12v12H9zM15 9V3H3v12h6",
  archive: "M3 7h18v14H3zM2 3h20v4H2zM9 12h6",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  save: "M3 3h15l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8",
};

export default function Icon({ name }: { name: string }) {
  return <svg className="ui-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] || paths.Catalog} /></svg>;
}

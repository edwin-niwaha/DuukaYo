import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DuukaYo · Your shop, in sync",
  description: "A calmer way to run your shop. By Perpetual Labs.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import CartSync from "@/components/CartSync";
import Toasts from "@/components/Toasts";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DuukaYo · Discover more",
  description: "Discover shops, explore everyday essentials and new favourites, and order for pickup or shop delivery.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}<CartSync /><Toasts /></body>
    </html>
  );
}

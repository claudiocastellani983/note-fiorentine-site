import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Note Fiorentine · Gestionale prenotazioni",
  description: "Gestione prenotazioni e sala Note Fiorentine",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Note Fiorentine" }
};
export const viewport: Viewport = { themeColor: "#211b18", width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
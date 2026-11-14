import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata: Metadata = {
  title: "Note Fiorentine · Gestionale prenotazioni",
  description: "Gestione prenotazioni e sala Note Fiorentine",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Note Fiorentine" }
};
export const viewport: Viewport = { themeColor: "#211b18", width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body><PwaRegister />{children}</body></html>;
}
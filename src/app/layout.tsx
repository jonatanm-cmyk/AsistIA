import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "AsistIA · Backoffice", template: "%s · AsistIA" },
  description:
    "Backoffice de AsistIA: configuración del agente, base de conocimiento, canal de WhatsApp y consumo por empresa.",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

/**
 * Layout raíz. A propósito NO monta el AppShell: /login y /unauthorized se
 * pintan a pantalla completa. El shell vive en el layout del grupo `(app)`,
 * que es el que además resuelve la sesión en el servidor.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Central Barbearia - Mensalistas & WhatsApp",
  description: "Sistema local de gestão de cortes e atendimento automatizado",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased bg-zinc-950 text-zinc-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}

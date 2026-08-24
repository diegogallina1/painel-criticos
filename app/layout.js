import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata = {
  title: "Painel de Leitores Sintéticos",
  description:
    "Cole um texto e veja a reação de leitores fictícios com personalidades bem diferentes.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

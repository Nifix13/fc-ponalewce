import type { Metadata } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import "./globals.css";
import LiveWidget from "./LiveWidget.tsx";

/*
  Big Shoulders Display - wysokie i waskie, zbudowane do duzych napisow;
  daje te sportowa, tablicowa energie, ktorej zabraklo pierwszej wersji.
  Archivo obsluguje dane: tabele, wyniki, liczby.
  Obie rodziny maja pelny zestaw polskich znakow (latin-ext).
*/
const shoulders = Big_Shoulders({
  subsets: ["latin-ext"],
  variable: "--font-shoulders",
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin-ext"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FC Po Nalewce",
  description:
    "Szóstki piłkarskie z Otwocka i Józefowa. Tabele, wyniki, terminarz i skład.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={`${shoulders.variable} ${archivo.variable}`}>
      <body className="bg-coal text-white antialiased">
        {children}
        {/* Widget pokazuje sie sam tylko wokol meczu - poza tym nic nie rysuje. */}
        <LiveWidget />
      </body>
    </html>
  );
}

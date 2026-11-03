import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wassalha — Tunisian WhatsApp Commerce & Dispatch",
  description: "WhatsApp selling for Tunisian shops: match the product, hold the floor price, pin the door, send the waybill.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col bg-secondary text-primary selection:bg-brand-100 selection:text-brand-900">
        {children}
      </body>
    </html>
  );
}

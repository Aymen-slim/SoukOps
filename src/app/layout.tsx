import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wassalha — Smart Message Assistant for Shops & Professionals in Tunisia",
  description:
    "Answer WhatsApp, Instagram, and Messenger messages automatically in Tunisian Derja, French, or Arabic. Turn chats into confirmed orders, bookings, and paid opportunities.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col bg-secondary text-primary selection:bg-brand-100 selection:text-brand-900">
        {children}
      </body>
    </html>
  );
}

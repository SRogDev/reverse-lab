import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  description:
    "Autonomous reverse engineering and experimental engineering laboratory.",
  title: "Reverse Lab",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

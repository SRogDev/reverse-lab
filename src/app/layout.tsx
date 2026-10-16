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
      <body>
        <div className="lab-shell">
          <header className="lab-header">
            <div className="lab-header-inner">
              <a className="lab-brand" href="/">
                <span className="lab-brand-mark" aria-hidden="true" />
                Reverse Lab
              </a>
              <nav className="lab-nav" aria-label="Primary">
                <a href="/workspace">Workspace</a>
              </nav>
            </div>
          </header>
          <main className="lab-main">{children}</main>
          <footer className="lab-footer">
            <div className="lab-footer-inner">
              <span>reverse-lab · mvp phase 5 ui</span>
              <span>evidence or it didn&apos;t happen</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

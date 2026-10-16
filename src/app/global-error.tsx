"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="lab-shell">
          <main className="lab-main">
            <div className="card" role="alert">
              <h1>Lab offline</h1>
              <p className="muted">
                {error.message || "An unexpected error stopped the whole app."}
              </p>
              <button type="button" className="btn btn-primary" onClick={reset}>
                Try again
              </button>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}

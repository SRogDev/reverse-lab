"use client";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card" role="alert">
      <h1>Something broke in the lab</h1>
      <p className="muted">
        {error.message || "An unexpected error interrupted this view."}
      </p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}

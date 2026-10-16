export default function NotFound() {
  return (
    <div className="card">
      <h1>404 — nothing recorded here</h1>
      <p className="muted">
        This route does not exist in the lab. The id may be wrong or the record
        was never created.
      </p>
      <a className="btn" href="/workspace">
        Back to the workspace
      </a>
    </div>
  );
}

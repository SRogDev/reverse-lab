export default function Home() {
  return (
    <main>
      <h1>Reverse Lab</h1>
      <p>
        Autonomous reverse engineering &amp; experimental engineering
        laboratory.
      </p>
      <p>
        Phase 1 foundation is online. The investigation UI arrives in Phase 5;
        the API contract is documented in the repo README.
      </p>
      <ul>
        <li>
          <code>GET /api/projects</code> — list research projects
        </li>
        <li>
          <code>POST /api/projects</code> — create a research project
        </li>
      </ul>
    </main>
  );
}

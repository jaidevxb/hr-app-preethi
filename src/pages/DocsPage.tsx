const GLOSSARY = [
  {
    icon: "○",
    name: "Start Event",
    meaning: "Marks where a process instance begins.",
    here: '"Request Submitted"',
  },
  {
    icon: "▢",
    name: "User Task",
    meaning: "A step that requires a human to act before the flow can continue.",
    here: '"Manager Review", "Escalated Review", "HR Processes Leave"',
  },
  {
    icon: "◇",
    name: "Exclusive Gateway",
    meaning: "A decision point — picks exactly one outgoing path based on data collected so far.",
    here: '"Approved?" branches to HR processing or straight to Rejected',
  },
  {
    icon: "⏱",
    name: "Timer (boundary event)",
    meaning:
      "Attached to a task. If the task isn't completed within an SLA, the timer fires and reroutes the flow instead of leaving it stuck.",
    here: "Attached to “Manager Review” — 3-day SLA, escalates to a skip-level manager",
  },
  {
    icon: "●",
    name: "End Event",
    meaning: "Marks where a process instance finishes.",
    here: '"Leave Approved" / "Leave Rejected"',
  },
];

const SHIPPED = [
  {
    title: "A real BPMN 2.0 process definition",
    detail:
      "leaveRequestWorkflow.bpmn is genuine BPMN 2.0 XML — open it in Camunda Modeler or bpmn.io and it renders with their standard tooling, same as any process a real team would author.",
  },
  {
    title: "A custom-drawn diagram, not the stock renderer",
    detail:
      "The in-app diagram (this one) is hand-rendered SVG instead of bpmn-js's default output — bpmn-js paints everything via inline styles built for a white canvas, which fought every attempt to retheme it into this app's dark/light palette. Same shapes, positions, and semantics as the .bpmn file; full control over the visuals.",
  },
];

const ROADMAP = [
  {
    title: "Diagram authoring, not just viewing",
    detail:
      "The diagram here is read-only. A real editing surface (drag out new tasks/gateways, export the edited XML) would mean bringing in bpmn-js's Modeler after all — just for authoring, not for display.",
  },
  {
    title: "Real timers + persistence",
    detail:
      "Replace the “simulate timer expiry” button with an actual scheduled timer, and store instances in a database so they survive a restart.",
  },
  {
    title: "Multiple concurrent instances",
    detail: "A dashboard listing every in-flight request, plus a “My Tasks” inbox per assignee.",
  },
  {
    title: "A real BPMN engine underneath",
    detail:
      "Swap the hand-rolled engine for Camunda 8 / Zeebe behind the same interface, once the mechanics are second nature.",
  },
  {
    title: "Auth + role-based assignment",
    detail: "Only the actual manager can act on their own employee's request.",
  },
  {
    title: "Notifications",
    detail: "Email/Slack pings on task assignment and escalation.",
  },
];

export function DocsPage() {
  return (
    <div className="page docs">
      <section className="card docs-section">
        <h2>What this is</h2>
        <p>
          A small, self-contained demo that models a real HR process — leave/time-off approval — as a{" "}
          <strong>BPMN 2.0 workflow</strong>. The CLI and this visual UI are two different front ends sitting on top
          of the exact same workflow engine; the process is also written out as real BPMN 2.0 XML, openable in
          Camunda Modeler or bpmn.io, though the diagram below is a custom-rendered view of it (see "Shipped" for
          why).
        </p>
      </section>

      <section className="card docs-section">
        <h2>Why it exists</h2>
        <p>
          This started as a way to actually learn BPMN — the standard notation behind tools like Camunda, Flowable,
          and jBPM — rather than just reading about it. The approach: build the mechanics by hand first (no
          workflow library, no engine) so each element's behavior is understood first-hand, then layer real tooling
          on top once that's solid. Diagram-first, engine-second.
        </p>
      </section>

      <section className="card docs-section">
        <h2>What is BPMN</h2>
        <p>
          BPMN (Business Process Model and Notation) is the standard diagramming language for business processes,
          maintained by the OMG. <strong>BPMN 2.0</strong>, released in 2011, is still the current version in
          industry use — there's no widely-adopted BPMN 3.0. Its value: every diagram is backed by a portable XML
          schema, so the same process definition can move between modeling tools and execution engines.
        </p>
      </section>

      <section className="card docs-section">
        <h2>Element glossary</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Element</th>
                <th>Meaning</th>
                <th>Where it shows up here</th>
              </tr>
            </thead>
            <tbody>
              {GLOSSARY.map((row) => (
                <tr key={row.name}>
                  <td className="glossary-icon" aria-hidden>
                    {row.icon}
                  </td>
                  <td>{row.name}</td>
                  <td className="muted">{row.meaning}</td>
                  <td className="muted">{row.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card docs-section">
        <h2>What's the use</h2>
        <p>
          The demo is leave approval, but the shape generalizes to almost any "submit → review → branch → notify"
          business process: expense reimbursement, procurement sign-off, onboarding checklists. The engine (
          <code>engine.ts</code> + <code>types.ts</code>) is generic — a new process is a new data definition, like{" "}
          <code>leaveRequestWorkflow.ts</code>, not new engine code.
        </p>
      </section>

      <section className="card docs-section">
        <h2>Architecture at a glance</h2>
        <ul className="filelist">
          <li>
            <code>src/workflow/types.ts</code> — node & definition types; the "schema" for any BPMN-style flow
          </li>
          <li>
            <code>src/workflow/engine.ts</code> — generic <code>WorkflowInstance</code> engine (start / completeTask
            / fireTimer)
          </li>
          <li>
            <code>src/workflow/leaveRequestWorkflow.ts</code> — this process, expressed as pure data (drives the CLI
            and the engine)
          </li>
          <li>
            <code>src/workflow/leaveRequestWorkflow.bpmn</code> — the same process as real BPMN 2.0 XML (a reference
            artifact — not parsed by the app)
          </li>
          <li>
            <code>src/cli.ts</code> — terminal driver
          </li>
          <li>
            <code>src/components/ProcessDiagram.tsx</code> — custom SVG diagram; highlights visited/current nodes as
            the engine progresses
          </li>
          <li>
            <code>src/hooks</code>, <code>src/components</code>, <code>src/pages</code> — this browser UI, reusing
            the identical engine
          </li>
        </ul>
      </section>

      <section className="card docs-section">
        <h2>Current scope — v1</h2>
        <ul>
          <li>One workflow definition: Leave Request</li>
          <li>One in-memory instance at a time — nothing persists across a page refresh or a new CLI run</li>
          <li>The 3-day SLA timer is simulated with a button, not a real clock</li>
          <li>The diagram is read-only and hand-drawn for this one process — not a general-purpose renderer</li>
          <li>No auth, no multi-user, no database, no notifications</li>
        </ul>
        <p className="muted">This is a learning/demo project, not production software — that's intentional.</p>
      </section>

      <section className="card docs-section">
        <h2>Shipped</h2>
        <ol className="roadmap">
          {SHIPPED.map((item) => (
            <li key={item.title}>
              <span className="roadmap-index" aria-hidden>
                ✓
              </span>
              <div>
                <div className="roadmap-title">{item.title}</div>
                <div className="muted">{item.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card docs-section">
        <h2>Roadmap — future upgrades</h2>
        <ol className="roadmap">
          {ROADMAP.map((item, i) => (
            <li key={item.title}>
              <span className="roadmap-index">{i + 1}</span>
              <div>
                <div className="roadmap-title">{item.title}</div>
                <div className="muted">{item.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card docs-section">
        <h2>Where this currently stops</h2>
        <p>
          Right here: one process, playable end-to-end through both the CLI and this UI, backed by real BPMN 2.0 XML
          and a custom-drawn diagram, unit-tested, and documented. Nothing else on the roadmap above is built yet —
          each item gets picked up only when it's actually needed next, not speculatively.
        </p>
      </section>
    </div>
  );
}

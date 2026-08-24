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
    title: "The XML is the source of truth — it's parsed, not decorative",
    detail:
      "The .bpmn file used to be a reference artifact sitting next to a hand-written TypeScript copy of the same process, plus a third copy of its coordinates inside the diagram component. All three are now one: the file is parsed into the executable definition and the drawn diagram. Flow structure, assignees (camunda:assignee), the 3-day SLA (P3D), gateway conditions and every shape position come out of the XML. Edit it in Camunda Modeler and both the engine and this diagram follow.",
  },
  {
    title: "Gateway conditions without eval",
    detail:
      'Conditions like decision == "approved" live in the file as BPMN conditionExpressions. Since the process definition is now data loaded at runtime, running it through eval() would be a real hole — so there is a deliberately tiny grammar (variable, operator, literal) that refuses anything it doesn\'t recognise. Real engines do the same thing with a proper expression language: JUEL in Camunda 7, FEEL in Zeebe.',
  },
  {
    title: "A custom-drawn diagram, not the stock renderer",
    detail:
      "The in-app diagram (this one) is hand-rendered SVG instead of bpmn-js's default output — bpmn-js paints everything via inline styles built for a white canvas, which fought every attempt to retheme it into this app's dark/light palette. It now reads its geometry from the file's own BPMNDI section, so it stays a faithful view of the same diagram Camunda Modeler would draw — with full control over the visuals.",
  },
];

const ROADMAP = [
  {
    title: "A library of processes, not one",
    detail:
      "Adding a process is now adding a file — the parser does the rest. Drop in expense reimbursement and onboarding alongside leave approval, list them in a picker, and the claim below that “the engine is generic” stops being aspirational.",
  },
  {
    title: "Forms described by the BPMN file",
    detail:
      "The request form is currently three hardcoded fields (name / days / reason). Camunda models form fields inside the XML; reading those would mean each process in the library brings its own form instead of borrowing the leave request's.",
  },
  {
    title: "Parallel gateways — and the token model they force",
    detail:
      "An AND-split is the element that breaks this engine: it tracks a single current node, and a parallel branch needs several live at once. Doing it properly means moving to tokens, which is the actual line between a toy and an engine — and it's much cheaper to cross before instances get persisted or listed in a dashboard.",
  },
  {
    title: "Service tasks and business rule tasks",
    detail:
      "Steps that run without a human — post to payroll, auto-approve anything under two days. Cheap to add once tasks can dispatch to registered handlers, and they make the activity log look like something actually happened.",
  },
  {
    title: "Real timers on an accelerated clock",
    detail:
      "Replace the “simulate timer expiry” button with a genuine scheduled timer running on a compressed clock — one simulated day per couple of seconds — so the escalation can be watched firing on the diagram instead of triggered by hand.",
  },
  {
    title: "Many concurrent instances, persistence, and a task inbox",
    detail:
      "A dashboard of every in-flight request and a “My Tasks” view per assignee, surviving a refresh. localStorage first, a real database only if it earns it.",
  },
  {
    title: "Replay and audit",
    detail:
      "Scrub a finished instance step by step and watch the token travel the diagram. The log and the BPMNDI waypoints needed for it are already there.",
  },
  {
    title: "A validation panel",
    detail:
      "Flag unreachable elements, tasks with no outgoing flow, gateways that can't decide. The parser already rejects the structural errors it would choke on; this surfaces the ones it can survive but shouldn't.",
  },
  {
    title: "Diagram authoring, not just viewing",
    detail:
      "The diagram here is read-only. A real editing surface (drag out new tasks/gateways, export the edited XML, run it immediately) would mean bringing in bpmn-js's Modeler after all — just for authoring, not for display.",
  },
  {
    title: "A real BPMN engine underneath",
    detail:
      "Swap the hand-rolled engine for Camunda 8 / Zeebe behind the same interface, once the mechanics are second nature. The parser is where that seam already sits.",
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
          of the exact same workflow engine, and both read the same BPMN 2.0 XML file: it is parsed into the
          process that runs <em>and</em> the diagram below, which is custom-rendered from the file's own
          coordinates (see "Shipped" for why).
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
            <code>src/workflow/leaveRequestWorkflow.bpmn</code> — real BPMN 2.0 XML, and the single source of truth
            for both the flow and the drawing
          </li>
          <li>
            <code>src/workflow/bpmnParser.ts</code> — parses that file into a <code>WorkflowDefinition</code> plus a
            diagram layout read from its BPMNDI section
          </li>
          <li>
            <code>src/workflow/conditionExpression.ts</code> — the small, strict grammar gateway conditions are
            evaluated with
          </li>
          <li>
            <code>src/workflow/types.ts</code> — node & definition types; the "schema" for any BPMN-style flow
          </li>
          <li>
            <code>src/workflow/engine.ts</code> — generic <code>WorkflowInstance</code> engine (start / completeTask
            / fireTimer)
          </li>
          <li>
            <code>src/workflow/leaveRequestWorkflow.ts</code> — loads the .bpmn (Vite <code>?raw</code>) and parses
            it; <code>src/cli.ts</code> reads the same file with <code>fs</code>
          </li>
          <li>
            <code>src/components/ProcessDiagram.tsx</code> — custom SVG renderer driven by the parsed layout;
            highlights visited/current nodes as the engine progresses
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
          <li>One workflow definition: Leave Request — though adding another is now adding a .bpmn file</li>
          <li>One in-memory instance at a time — nothing persists across a page refresh or a new CLI run</li>
          <li>The 3-day SLA timer is simulated with a button, not a real clock</li>
          <li>
            Five BPMN element types are understood (start, user task, exclusive gateway, boundary timer, end);
            anything else in a file is rejected rather than silently ignored
          </li>
          <li>The engine tracks a single active element, so parallel gateways aren't possible yet</li>
          <li>The diagram is read-only — a renderer for this subset, not a general-purpose one</li>
          <li>The request form's fields are hardcoded, not read from the process</li>
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
          Right here: one process, playable end-to-end through both the CLI and this UI, loaded and drawn from a
          real BPMN 2.0 file, unit-tested, and documented. Nothing else on the roadmap above is built yet — each
          item gets picked up only when it's actually needed next, not speculatively.
        </p>
      </section>
    </div>
  );
}

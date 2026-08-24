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
    icon: "⚙",
    name: "Service Task",
    meaning:
      "A step the system performs by itself — no human involved. The file names a topic; the app supplies the code behind it.",
    here: '"Update Leave Balance" — deducts the days from the employee\'s allowance',
  },
  {
    icon: "◇",
    name: "Exclusive Gateway",
    meaning: "A decision point — picks exactly one outgoing path based on data collected so far.",
    here: '"Approved?" branches to HR processing or straight to Rejected',
  },
  {
    icon: "✛",
    name: "Parallel Gateway",
    meaning:
      "An AND-split and AND-join. Splitting starts every outgoing path at once; joining waits until every incoming path has arrived before continuing.",
    here: "After approval, HR's paperwork and the balance update run side by side and must both finish",
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
    title: "A token-based engine, so parallel gateways actually work",
    detail:
      "The engine used to track a single current element, which is fine until two things need to happen at once. It now models execution with tokens the way BPMN specifies: an AND-split issues a token per outgoing flow, an AND-join holds them until every incoming flow has delivered one, and the process ends when no tokens remain. Approved leave now runs HR's paperwork and the balance update side by side.",
  },
  {
    title: "Service tasks with a handler registry",
    detail:
      "Steps that run without a human. The BPMN file names a camunda:topic and the app registers the code behind it — the same split Camunda uses between a process and its external task workers, so the definition stays free of implementation.",
  },
  {
    title: "A library of processes, not one",
    detail:
      "Every .bpmn file in src/workflow/processes/ is picked up automatically — the web build globs the folder, the CLI walks it with fs, and both hand the files to the same parser. Adding a process is adding a file: no registration step, no engine changes. Three ship today, and they were chosen to cover different mechanics rather than to be a product.",
  },
  {
    title: "Each process brings its own form",
    detail:
      "Start forms are declared in the file as camunda:formData — field ids, labels, types, defaults, enum choices. The UI renders whatever the process asks for and the CLI prompts for the same fields, so a new process gets working inputs without touching a component.",
  },
  {
    title: "A custom-drawn diagram, not the stock renderer",
    detail:
      "The in-app diagram (this one) is hand-rendered SVG instead of bpmn-js's default output — bpmn-js paints everything via inline styles built for a white canvas, which fought every attempt to retheme it into this app's dark/light palette. It now reads its geometry from the file's own BPMNDI section, so it stays a faithful view of the same diagram Camunda Modeler would draw — with full control over the visuals.",
  },
];

const ROADMAP = [
  {
    title: "Real timers on an accelerated clock",
    detail:
      "Replace the “simulate timer expiry” button with a genuine scheduled timer running on a compressed clock — one simulated day per couple of seconds — so the escalation can be watched firing on the diagram instead of triggered by hand. This is the most simulator-ish thing left undone.",
  },
  {
    title: "Replay and step-through",
    detail:
      "Scrub a finished instance step by step and watch the tokens travel the diagram. The log records which token did what and the BPMNDI waypoints are already parsed, so the pieces are in place.",
  },
  {
    title: "A validation panel",
    detail:
      "Flag unreachable elements, tasks with no outgoing flow, joins that can never fire. The parser already rejects the structural errors it would choke on; this surfaces the ones it can survive but shouldn't — including deadlocks the engine will happily sit in.",
  },
  {
    title: "More of the BPMN vocabulary",
    detail:
      "Inclusive (OR) gateways, message and signal events, sub-processes, terminate end events. Each one is a new element in the glossary and a new behaviour in the engine — which is the whole point of the exercise.",
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
];

/** Things deliberately not being built — this is a simulator, not a product. */
const NON_GOALS = [
  "Auth and role-based assignment — every task is actionable by whoever is driving",
  "A database, or instances that survive a refresh",
  "A dashboard of concurrent instances, or a per-assignee task inbox",
  "Email/Slack notifications",
];

export function DocsPage() {
  return (
    <div className="page docs">
      <section className="card docs-section">
        <h2>What this is</h2>
        <p>
          A <strong>BPMN 2.0 simulator</strong>: a hand-rolled workflow engine you can drive by hand, with a small
          library of HR processes — leave approval, expense reimbursement, employee onboarding — to run through it.
          Each one is a .bpmn file that gets parsed into the process that runs <em>and</em> the diagram above, which
          is custom-rendered from the file's own coordinates (see "Shipped" for why). The CLI and this visual UI are
          two front ends over the exact same engine.
        </p>
        <p className="muted">
          It's a simulator, not a product. No auth, no database, no multi-user — those would add scaffolding without
          teaching anything more about BPMN.
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
          The shape generalizes to almost any "submit → review → branch → notify" business process, which is why the
          library holds three of them: leave approval, expense reimbursement and onboarding all run on the same
          engine without a line of process-specific code. A new one is a new <code>.bpmn</code> file, not new engine
          code — that claim used to be aspirational, and now it's how the folder works.
        </p>
      </section>

      <section className="card docs-section">
        <h2>Architecture at a glance</h2>
        <ul className="filelist">
          <li>
            <code>src/workflow/processes/*.bpmn</code> — real BPMN 2.0 XML, and the single source of truth for both
            the flow and the drawing. Drop a file in, get a process
          </li>
          <li>
            <code>src/workflow/processes/index.ts</code> — globs the folder for the web build;{" "}
            <code>loadProcessLibrary.node.ts</code> does the same with <code>fs</code> for the CLI
          </li>
          <li>
            <code>src/workflow/bpmnParser.ts</code> — parses a file into a <code>WorkflowDefinition</code> plus a
            diagram layout read from its BPMNDI section
          </li>
          <li>
            <code>src/workflow/handlers.ts</code> — the code behind each <code>camunda:topic</code>, kept out of the
            process definitions
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
            <code>src/cli.ts</code> — terminal driver: pick a process, fill its form, walk it
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
          <li>Three processes in the library; adding a fourth is adding a .bpmn file to the folder</li>
          <li>One in-memory instance at a time — nothing persists across a page refresh or a new CLI run</li>
          <li>The 3-day SLA timer is simulated with a button, not a real clock</li>
          <li>Start forms come from the file; per-task forms don't exist yet</li>
          <li>
            A deadlocked join (a token waiting on a branch that can't arrive) is detected and reported, but nothing
            unwinds it
          </li>
          <li>
            Eight BPMN element types are understood (start, user task, service task, business rule task, exclusive
            gateway, parallel gateway, boundary timer, end); anything else in a file is rejected rather than
            silently ignored
          </li>
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
        <h2>Deliberately not building</h2>
        <ul>
          {NON_GOALS.map((item) => (
            <li key={item} className="muted">
              {item}
            </li>
          ))}
        </ul>
        <p className="muted">
          Each of these is product scaffolding. None of them would teach anything more about BPMN, which is what
          this exists for.
        </p>
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

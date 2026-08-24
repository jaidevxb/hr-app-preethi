# HR Workflow — Leave Request (BPMN, v1)

A hand-rolled workflow engine modeling a Leave Request Approval process.
The BPMN 2.0 XML file *is* the process: `leaveRequestWorkflow.bpmn` is parsed
at load into both the executable definition the engine walks and the diagram
that gets drawn, positions and all. Edit it in Camunda Modeler or bpmn.io and
both follow — there is no hand-written second copy to keep in sync.

Rendering is a custom SVG layer fed by the file's own BPMNDI coordinates
(bpmn-js's default renderer paints via inline styles built for a white canvas
and wasn't worth fighting to retheme — see the in-app Docs page for the full
story). Two front ends sit on top of the same engine: an interactive CLI and a
React/Vite web UI with a full in-app Docs page — what/why/roadmap.

## Flow

```
(Start: Request Submitted)
      |
[User Task: Manager Review] --boundary Timer (3d SLA)--> [User Task: Escalated Review]
      |                                                          |
      +-------------------------- [Gateway: Approved?] <---------+
             |approved                    |rejected
             v                            v
[User Task: HR Processes Leave]      (End: Rejected)
      |
(End: Approved)
```

Elements demonstrated: Start/End Events, User Tasks, an Exclusive (Decision)
Gateway, and a boundary Timer Event (simulated via a `fireTimer()` call
instead of a real clock, since this is v1).

## Run it

```bash
npm install
npm run dev        # web UI at http://localhost:5173 — Workflow tab + Docs tab
npm run cli        # interactive terminal walkthrough of the same flow
npm test           # unit tests covering approve / reject / timer-escalation paths
npm run build      # production build of the web UI (dist/) — what Vercel runs
npm run typecheck  # type-check the CLI/engine side (tsc, no emit)
```

## Structure

- `src/workflow/leaveRequestWorkflow.bpmn` — **the source of truth.** Real BPMN 2.0 XML: flow, assignees (`camunda:assignee`), the 3-day SLA (`P3D`), and every diagram coordinate
- `src/workflow/bpmnParser.ts` — turns that XML into a `WorkflowDefinition` + a diagram layout
- `src/workflow/conditionExpression.ts` — tiny, deliberately limited evaluator for gateway conditions (no `eval`)
- `src/workflow/types.ts` — generic BPMN-ish node/definition types
- `src/workflow/engine.ts` — reusable `WorkflowInstance` engine (start, completeTask, fireTimer)
- `src/workflow/leaveRequestWorkflow.ts` — loads the .bpmn via Vite's `?raw` and parses it
- `src/cli.ts` — interactive terminal driver; reads the same .bpmn with `fs`
- `src/hooks/useWorkflowInstance.ts` — React wrapper around the engine
- `src/components/ProcessDiagram.tsx` — custom SVG renderer, driven entirely by the parsed layout
- `src/components/`, `src/pages/` — the web UI (diagram + forms + Docs page)

The Docs page (in-app, at the "Docs" tab) covers what BPMN is, why this
project is built the way it is, the element glossary, current scope, and the
full roadmap — that content isn't duplicated here.

## Next steps (not built yet)

See the Roadmap section on the in-app Docs page. Short version: a library of
several processes (now that adding one is just adding a file), more BPMN
element types — parallel gateways and service tasks first — then real timers,
persistence and a task inbox, and eventually a real BPMN 2.0 engine
(Camunda/Zeebe) behind the same interface.

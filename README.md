# HR Workflow — Leave Request (BPMN, v1)

A hand-rolled workflow engine modeling a Leave Request Approval process,
rendered as a real BPMN 2.0 diagram via `bpmn-js` (the library behind
bpmn.io / Camunda Modeler). Two front ends sit on top of the same engine: an
interactive CLI and a React/Vite web UI with a full in-app Docs page —
what/why/roadmap.

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

- `src/workflow/types.ts` — generic BPMN-ish node/definition types
- `src/workflow/engine.ts` — reusable `WorkflowInstance` engine (start, completeTask, fireTimer)
- `src/workflow/leaveRequestWorkflow.ts` — the actual leave-request process definition
- `src/workflow/leaveRequestWorkflow.bpmn` — the same process as real BPMN 2.0 XML
- `src/cli.ts` — interactive terminal driver
- `src/hooks/useWorkflowInstance.ts` — React wrapper around the engine
- `src/components/BpmnDiagram.tsx` — bpmn-js viewer wrapper, highlights live progress
- `src/components/`, `src/pages/` — the web UI (diagram + forms + Docs page)

The Docs page (in-app, at the "Docs" tab) covers what BPMN is, why this
project is built the way it is, the element glossary, current scope, and the
full roadmap — that content isn't duplicated here.

## Next steps (not built yet)

See the Roadmap section on the in-app Docs page. Short version: diagram
authoring (not just viewing), real timers + persistence, multiple concurrent
instances, and eventually a real BPMN 2.0 engine (Camunda/Zeebe) behind the
same interface.

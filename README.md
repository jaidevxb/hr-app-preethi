# BPMN Workflow Simulator

A hand-rolled BPMN 2.0 engine you can drive by hand, with a library of HR
processes to run through it. This is a **simulator for learning BPMN**, not a
product — there's no auth, no database, no multi-user anything, and that's on
purpose.

The BPMN 2.0 XML files *are* the processes. Each one is parsed at load into
both the executable definition the engine walks and the diagram that gets
drawn, positions and all. Edit one in Camunda Modeler or bpmn.io and both
follow — there is no hand-written second copy to keep in sync. Adding a
process to the simulator is adding a file to `src/workflow/processes/`.

Rendering is a custom SVG layer fed by each file's own BPMNDI coordinates
(bpmn-js's default renderer paints via inline styles built for a white canvas
and wasn't worth fighting to retheme — see the in-app Docs page for the full
story). Two front ends sit on top of the same engine: an interactive CLI and a
React/Vite web UI with a full in-app Docs page — what/why/roadmap.

## The process library

| Process | Shows off |
| --- | --- |
| **Leave Request Approval** | Boundary timer with SLA escalation, exclusive gateway, an AND-split into a user task + service task that must rejoin before the process ends |
| **Expense Reimbursement** | A business rule task that decides whether a human is needed at all — small claims skip Finance entirely |
| **Employee Onboarding** | A three-way parallel split (IT, accounts, buddy) that the join holds until every track lands |
| **Employee Offboarding** | An inclusive (OR) split where the form decides which tracks run — and a join that closes on however many actually did |
| **Deadlock Demo** | Deliberately broken: an AND-join downstream of an XOR-split. The validator predicts the hang, then the engine hangs exactly there |

### Leave Request, in detail

```
(Start: Request Submitted)
      |
[User Task: Manager Review] --boundary Timer (3d SLA)--> [User Task: Escalated Review]
      |                                                          |
      +-------------------------- [X Gateway: Approved?] <-------+
             |approved                    |rejected
             v                            v
       [+ Split]                     (End: Rejected)
        |      |
        |      +--> [Service Task: Update Leave Balance] --+
        |                                                  |
        +--------> [User Task: HR Processes Leave] --------+
                                                           v
                                                       [+ Join]
                                                           |
                                                    (End: Approved)
```

Elements understood by the engine: Start/End Events, User Tasks, Service
Tasks, Business Rule Tasks, Exclusive (Decision) Gateways, Inclusive (OR)
Gateways, Parallel (AND) Gateways — the last two as both split and join — and
boundary Timer Events.

The inclusive join is the interesting one: an OR-split decides at runtime how
many branches to activate, so the join can't count to a fixed number. It waits
until no live token anywhere else could still reach it, then merges however
many turned up.

The timers run on a **compressed simulation clock** — one simulated day per
second or two, adjustable and pausable — so a 3-day SLA can actually be
watched running out and escalating. The deadline itself is the `P3D` from the
file; only the clock is sped up.

Any instance can be **replayed** from its log: play it through, scrub to a
step, or walk it one entry at a time while the diagram highlights the element
that entry touched.

## Run it

```bash
npm install
npm run dev        # web UI at http://localhost:5173 — Workflow tab + Docs tab
npm run cli        # terminal driver; pick a process, then walk it
npm test           # engine, parser, diagram and per-process path coverage
npm run build      # production build of the web UI (dist/) — what Vercel runs
npm run typecheck  # type-check everything (tsc, no emit)
```

## Structure

- `src/workflow/processes/*.bpmn` — **the source of truth.** Real BPMN 2.0 XML: flow, assignees (`camunda:assignee`), handler topics (`camunda:topic`), SLAs (`P3D`), start forms (`camunda:formData`), and every diagram coordinate
- `src/workflow/processes/index.ts` — globs and parses every file in that folder (Vite); `loadProcessLibrary.node.ts` does the same with `fs` for the CLI
- `src/workflow/bpmnParser.ts` — turns the XML into a `WorkflowDefinition` + a diagram layout
- `src/workflow/conditionExpression.ts` — tiny, deliberately limited evaluator for gateway conditions (no `eval`)
- `src/workflow/engine.ts` — the token-based `WorkflowInstance` engine (start, completeTask, fireTimer)
- `src/workflow/handlers.ts` — the code behind each `camunda:topic`, kept out of the process definitions
- `src/workflow/simulationClock.ts` — the compressed clock boundary timers count against
- `src/workflow/graph.ts` — reachability over the process graph, shared by the inclusive join and the validator
- `src/workflow/validate.ts` — structural checks the parser doesn't make: unreachable elements, unreachable end events, joins that can never fire
- `src/workflow/types.ts` — generic BPMN-ish node/definition types
- `src/cli.ts` — interactive terminal driver
- `src/hooks/useWorkflowInstance.ts` — React wrapper around the engine
- `src/components/ProcessDiagram.tsx` — custom SVG renderer, driven entirely by the parsed layout
- `src/components/`, `src/pages/` — the web UI (picker + diagram + forms + Docs page)

The Docs page (in-app, at the "Docs" tab) covers what BPMN is, why this
project is built the way it is, the element glossary, current scope, and the
full roadmap — that content isn't duplicated here.

## Next steps (not built yet)

See the Roadmap section on the in-app Docs page. Short version: more BPMN
element types (message/signal events, intermediate catch events, sub-processes,
terminate end events), and eventually diagram authoring plus a real BPMN engine
(Camunda/Zeebe) behind the same interface.

Explicit non-goals, since this is a simulator: auth, a database, a dashboard
of concurrent instances, notifications.

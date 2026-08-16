import type { WorkflowInstance } from "../workflow/engine.js";
import type { WorkflowDefinition } from "../workflow/types.js";

// Canonical happy-path + escalation order, for the empty-state preview
// (before an instance exists there's no log to derive an order from).
const PREVIEW_ORDER = [
  "start",
  "managerReview",
  "escalatedReview",
  "approvalGateway",
  "hrProcessing",
  "endApproved",
];

function visitedNodeIds(instance: WorkflowInstance): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const entry of instance.getLog()) {
    if (!seen.has(entry.nodeId)) {
      seen.add(entry.nodeId);
      order.push(entry.nodeId);
    }
  }
  return order;
}

const ICON: Record<string, string> = {
  startEvent: "○",
  endEvent: "●",
  userTask: "▢",
  exclusiveGateway: "◇",
};

export function Stepper({
  definition,
  instance,
}: {
  definition: WorkflowDefinition;
  instance: WorkflowInstance | null;
}) {
  const order = instance ? visitedNodeIds(instance) : PREVIEW_ORDER;
  const currentId = instance?.getCurrentNode().id;
  const isCompleted = instance?.getStatus() === "completed";

  const subtitle = !instance
    ? "Full flow, start to finish — highlights live once a request is submitted."
    : isCompleted
      ? "Completed — final path taken."
      : "Live progress for this request.";

  return (
    <div className="card stepper-card">
      <div className="stepper-header">
        <span className="eyebrow">{instance ? "In Progress" : "Process Overview"}</span>
        <p className="muted stepper-subtitle">{subtitle}</p>
      </div>
      <div className="stepper">
        {order.map((id) => {
          const node = definition.nodes[id];
          const isCurrent = !!instance && id === currentId && !isCompleted;
          const isPending = !instance;
          const hasTimer = node.type === "userTask" && !!node.timer;
          return (
            <div className="step" key={id}>
              <div
                className={
                  "step-node" +
                  ` step-node--${node.type}` +
                  (isPending ? " is-pending" : isCurrent ? " is-current" : " is-done")
                }
              >
                <span aria-hidden>{ICON[node.type]}</span>
              </div>
              <div className="step-label">{node.name}</div>
              {node.type === "userTask" && <div className="step-meta">{node.assignee}</div>}
              {hasTimer && <div className="step-meta step-meta--timer">⏱ SLA timer</div>}
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span>○ Event</span>
        <span>▢ User Task</span>
        <span>◇ Gateway</span>
        <span>⏱ Timer</span>
      </div>
    </div>
  );
}

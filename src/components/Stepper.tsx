import type { WorkflowInstance } from "../workflow/engine.js";
import type { WorkflowDefinition } from "../workflow/types.js";

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
  instance: WorkflowInstance;
}) {
  const order = visitedNodeIds(instance);
  const currentId = instance.getCurrentNode().id;
  const isCompleted = instance.getStatus() === "completed";

  return (
    <div className="card stepper-card">
      <div className="stepper">
        {order.map((id) => {
          const node = definition.nodes[id];
          const isCurrent = id === currentId && !isCompleted;
          const hasTimer = node.type === "userTask" && !!node.timer;
          return (
            <div className="step" key={id}>
              <div
                className={
                  "step-node" +
                  ` step-node--${node.type}` +
                  (isCurrent ? " is-current" : " is-done")
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

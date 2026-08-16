import { BpmnDiagram } from "./BpmnDiagram.js";
import type { WorkflowInstance } from "../workflow/engine.js";

function visitedNodeIds(instance: WorkflowInstance): string[] {
  const seen = new Set<string>();
  for (const entry of instance.getLog()) {
    seen.add(entry.nodeId);
  }
  return [...seen];
}

export function ProcessDiagram({ instance }: { instance: WorkflowInstance | null }) {
  const isWaiting = instance?.getStatus() === "waitingOnTask";
  const isCompleted = instance?.getStatus() === "completed";

  const visitedIds = instance ? visitedNodeIds(instance) : [];
  const currentId = isWaiting ? instance!.getCurrentNode().id : undefined;

  const subtitle = !instance
    ? "The full process map — highlights appear once a request is submitted."
    : isCompleted
      ? "Completed — full path highlighted below."
      : "Live progress for this request.";

  return (
    <div className="card stepper-card">
      <div className="stepper-header">
        <span className="eyebrow">{instance ? "In Progress" : "Process Overview"}</span>
        <p className="muted stepper-subtitle">{subtitle}</p>
      </div>
      <BpmnDiagram visitedIds={visitedIds} currentId={currentId} />
    </div>
  );
}

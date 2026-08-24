import type { UserTaskNode } from "../workflow/types.js";

const HOUR_MS = 60 * 60 * 1000;

/** Fallback when the boundary event in the BPMN file has no name of its own. */
function formatSla(durationMs: number): string {
  const hours = durationMs / HOUR_MS;
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24}-day SLA`;
  if (hours >= 1) return `${hours}-hour SLA`;
  return `${Math.round(durationMs / 60000)}-minute SLA`;
}

export function ActionPanel({
  node,
  onApprove,
  onReject,
  onFireTimer,
  onMarkProcessed,
}: {
  node: UserTaskNode;
  onApprove: () => void;
  onReject: () => void;
  onFireTimer: () => void;
  onMarkProcessed: () => void;
}) {
  const isReviewTask = node.id === "managerReview" || node.id === "escalatedReview";

  return (
    <div className="card">
      <div className="task-header">
        <span className="badge">User Task</span>
        {node.timer && (
          <span className="badge badge-timer">
            ⏱ {node.timer.label ?? formatSla(node.timer.durationMs)} armed
          </span>
        )}
      </div>
      <h2>{node.name}</h2>
      <p className="muted">Waiting on: {node.assignee}</p>

      {isReviewTask ? (
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onApprove}>
            Approve
          </button>
          <button className="btn btn-danger" onClick={onReject}>
            Reject
          </button>
          {node.timer && (
            <button className="btn btn-ghost" onClick={onFireTimer}>
              Simulate timer expiry
            </button>
          )}
        </div>
      ) : (
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onMarkProcessed}>
            Mark processed
          </button>
        </div>
      )}
    </div>
  );
}

import type { UserTaskNode } from "../workflow/types.js";

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
        {node.timer && <span className="badge badge-timer">⏱ 3-day SLA armed</span>}
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

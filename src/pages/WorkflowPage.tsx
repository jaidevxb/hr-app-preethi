import { ActionPanel } from "../components/ActionPanel.js";
import { LogTimeline } from "../components/LogTimeline.js";
import { RequestForm } from "../components/RequestForm.js";
import { Stepper } from "../components/Stepper.js";
import { useWorkflowInstance } from "../hooks/useWorkflowInstance.js";
import { leaveRequestWorkflow } from "../workflow/leaveRequestWorkflow.js";

export function WorkflowPage() {
  const { instance, submit, completeTask, fireTimer, reset } = useWorkflowInstance(leaveRequestWorkflow);

  if (!instance) {
    return (
      <div className="page">
        <RequestForm onSubmit={submit} />
      </div>
    );
  }

  const status = instance.getStatus();
  const node = instance.getCurrentNode();
  const context = instance.getContext();

  return (
    <div className="page">
      <Stepper definition={leaveRequestWorkflow} instance={instance} />

      {status === "waitingOnTask" && node.type === "userTask" && (
        <ActionPanel
          node={node}
          onApprove={() => completeTask({ decision: "approved" })}
          onReject={() => completeTask({ decision: "rejected" })}
          onFireTimer={fireTimer}
          onMarkProcessed={() => completeTask({})}
        />
      )}

      {status === "completed" && node.type === "endEvent" && (
        <div className={`card outcome outcome-${node.outcome}`}>
          <h2>{node.name}</h2>
          <p className="muted">
            {String(context.employeeName)} — {String(context.days)} day(s) — {String(context.reason)}
          </p>
          <button className="btn btn-ghost" onClick={reset}>
            Start another request
          </button>
        </div>
      )}

      <LogTimeline log={instance.getLog()} />
    </div>
  );
}

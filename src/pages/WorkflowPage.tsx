import { ActionPanel } from "../components/ActionPanel.js";
import { LogTimeline } from "../components/LogTimeline.js";
import { ProcessDiagram } from "../components/ProcessDiagram.js";
import { RequestForm } from "../components/RequestForm.js";
import { useWorkflowInstance } from "../hooks/useWorkflowInstance.js";
import { handlers } from "../workflow/handlers.js";
import { leaveRequestProcess } from "../workflow/leaveRequestWorkflow.js";

const { definition } = leaveRequestProcess;

export function WorkflowPage() {
  const { instance, submit, completeTask, fireTimer, reset } = useWorkflowInstance(
    definition,
    handlers
  );

  const status = instance?.getStatus();
  const context = instance?.getContext();
  const activeTasks = instance?.getActiveTasks() ?? [];
  const outcome = status === "completed" ? instance?.getEndEvents()[0] : undefined;

  return (
    <div className="page">
      <ProcessDiagram process={leaveRequestProcess} instance={instance} />

      {!instance && <RequestForm onSubmit={submit} />}

      {activeTasks.length > 1 && (
        <p className="muted parallel-note">
          {activeTasks.length} tasks are waiting at the same time — the process split into parallel
          branches and won't finish until both are done.
        </p>
      )}

      {activeTasks.map(({ tokenId, node }) => (
        <ActionPanel
          key={tokenId}
          node={node}
          isDecision={definition.nodes[node.next]?.type === "exclusiveGateway"}
          onApprove={() => completeTask(tokenId, { decision: "approved" })}
          onReject={() => completeTask(tokenId, { decision: "rejected" })}
          onFireTimer={() => fireTimer(tokenId)}
          onComplete={() => completeTask(tokenId, {})}
        />
      ))}

      {outcome && (
        <div className={`card outcome outcome-${outcome.outcome}`}>
          <h2>{outcome.name}</h2>
          <p className="muted">
            {String(context?.employeeName)} — {String(context?.days)} day(s) — {String(context?.reason)}
          </p>
          {context?.leaveBalance !== undefined && (
            <p className="muted">Leave balance now {String(context.leaveBalance)} day(s).</p>
          )}
          <button className="btn btn-ghost" onClick={reset}>
            Start another request
          </button>
        </div>
      )}

      {instance && <LogTimeline log={instance.getLog()} />}
    </div>
  );
}

import { useMemo, useState } from "react";
import { ActionPanel } from "../components/ActionPanel.js";
import { ClockPanel } from "../components/ClockPanel.js";
import { LogTimeline } from "../components/LogTimeline.js";
import { ProcessDiagram } from "../components/ProcessDiagram.js";
import { ReplayPanel } from "../components/ReplayPanel.js";
import { RequestForm } from "../components/RequestForm.js";
import { ValidationPanel } from "../components/ValidationPanel.js";
import { useWorkflowInstance } from "../hooks/useWorkflowInstance.js";
import { handlers } from "../workflow/handlers.js";
import { DEFAULT_PROCESS_ID, findProcess, processLibrary } from "../workflow/processes/index.js";
import { CLOCK_SPEEDS, DEFAULT_SPEED_ID } from "../workflow/simulationClock.js";
import { validateProcess } from "../workflow/validate.js";
import type { StartEventNode } from "../workflow/types.js";

/** Values the engine set itself aren't worth echoing back as "you entered". */
function contextEntries(context: Record<string, unknown>) {
  return Object.entries(context).filter(([, value]) => value !== undefined && value !== "");
}

export function WorkflowPage() {
  const [processId, setProcessId] = useState(DEFAULT_PROCESS_ID);
  const [speedId, setSpeedId] = useState(DEFAULT_SPEED_ID);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);
  const process = findProcess(processId);
  const { definition } = process;

  const { instance, elapsedSimMs, submit, completeTask, fireTimer, reset } = useWorkflowInstance(
    definition,
    handlers,
    speedId
  );

  const status = instance?.getStatus();
  const context = instance?.getContext() ?? {};
  const activeTasks = instance?.getActiveTasks() ?? [];
  const armedTimers = instance?.getArmedTimers() ?? [];
  const outcome = status === "completed" ? instance?.getEndEvents()[0] : undefined;
  const start = definition.nodes[definition.startNodeId] as StartEventNode;

  const clockRunning =
    (CLOCK_SPEEDS.find((speed) => speed.id === speedId)?.simMsPerRealSecond ?? 0) > 0;
  const remainingFor = (tokenId: string) =>
    armedTimers.find((timer) => timer.tokenId === tokenId)?.remainingMs;

  const issues = useMemo(
    () => validateProcess(definition, Object.keys(handlers)),
    [definition]
  );

  const log = instance?.getLog() ?? [];
  const inReplay = replayIndex !== null;
  const exitReplay = () => {
    setReplayIndex(null);
    setReplaying(false);
  };

  // Tokens are live but none are actionable and nothing is counting down.
  const stuck =
    status === "waiting" &&
    instance !== null &&
    activeTasks.length === 0 &&
    armedTimers.length === 0 &&
    instance.getTokens().length > 0;

  return (
    <div className="page">
      <div className="card process-picker">
        <label>
          Process
          <select
            value={processId}
            onChange={(event) => {
              setProcessId(event.target.value);
              exitReplay();
              reset();
            }}
          >
            {processLibrary.map((candidate) => (
              <option key={candidate.definition.id} value={candidate.definition.id}>
                {candidate.definition.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          {processLibrary.length} processes, each one a .bpmn file in{" "}
          <code>src/workflow/processes/</code>. The engine is the same for all of them.
        </p>
      </div>

      <ProcessDiagram process={process} instance={instance} replayIndex={replayIndex} />

      {inReplay && (
        <ReplayPanel
          log={log}
          index={replayIndex}
          playing={replaying}
          onIndexChange={setReplayIndex}
          onPlayingChange={setReplaying}
          onExit={exitReplay}
        />
      )}

      {!inReplay && log.length > 1 && (
        <button
          className="btn btn-ghost btn-block"
          onClick={() => {
            setReplayIndex(0);
            setReplaying(true);
          }}
        >
          ▶ Replay this instance step by step
        </button>
      )}

      <ValidationPanel issues={issues} />

      {stuck && !inReplay && (
        <p className="muted parallel-note parallel-note--stuck">
          Deadlocked. Tokens are parked at a join that is still waiting on a branch which can never
          arrive — there is nothing left to click. This is the failure the validation panel above
          predicted.
        </p>
      )}

      {!instance && (
        <RequestForm start={start} processName={definition.name} onSubmit={submit} />
      )}

      {activeTasks.length > 1 && !inReplay && (
        <p className="muted parallel-note">
          {activeTasks.length} tasks are waiting at the same time — the process split into parallel
          branches and won't finish until all of them are done.
        </p>
      )}

      {instance && status === "waiting" && !inReplay && (
        <ClockPanel
          speedId={speedId}
          onSpeedChange={setSpeedId}
          elapsedSimMs={elapsedSimMs}
          armedTimers={armedTimers}
          running={clockRunning}
        />
      )}

      {!inReplay &&
        activeTasks.map(({ tokenId, node }) => (
          <ActionPanel
            key={tokenId}
            node={node}
            isDecision={definition.nodes[node.next]?.type === "exclusiveGateway"}
            remainingMs={remainingFor(tokenId)}
            onApprove={() => completeTask(tokenId, { decision: "approved" })}
            onReject={() => completeTask(tokenId, { decision: "rejected" })}
            onFireTimer={() => fireTimer(tokenId)}
            onComplete={() => completeTask(tokenId, {})}
          />
        ))}

      {outcome && !inReplay && (
        <div className={`card outcome outcome-${outcome.outcome}`}>
          <h2>{outcome.name}</h2>
          <dl className="context-dump">
            {contextEntries(context).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
          <button
            className="btn btn-ghost"
            onClick={() => {
              exitReplay();
              reset();
            }}
          >
            Run it again
          </button>
        </div>
      )}

      {instance && <LogTimeline log={instance.getLog()} />}
    </div>
  );
}

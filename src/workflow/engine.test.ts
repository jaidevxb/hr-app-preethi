import { describe, expect, it } from "vitest";
import { WorkflowInstance } from "./engine.js";
import { handlers } from "./handlers.js";
import { leaveRequestProcess } from "./processes/index.js";

const leaveRequestWorkflow = leaveRequestProcess.definition;

function newInstance(context: Record<string, unknown> = {}) {
  const wf = new WorkflowInstance(leaveRequestWorkflow, { days: "4", ...context }, handlers);
  wf.start();
  return wf;
}

/** Most steps in this process have exactly one task waiting; assert that. */
function onlyTask(wf: WorkflowInstance) {
  const tasks = wf.getActiveTasks();
  expect(tasks).toHaveLength(1);
  return tasks[0];
}

describe("Leave Request workflow", () => {
  it("approves when the manager approves, once both parallel branches finish", () => {
    const wf = newInstance({ employeeName: "Alex" });

    const review = onlyTask(wf);
    expect(review.node.id).toBe("managerReview");

    wf.completeTask(review.tokenId, { decision: "approved" });

    // The split put one token on the HR task and sent the other through the
    // service task to the join, where it waits.
    const hr = onlyTask(wf);
    expect(hr.node.id).toBe("hrProcessing");
    expect(wf.getActiveNodeIds().sort()).toEqual(["hrProcessing", "joinApproved"]);
    expect(wf.getStatus()).toBe("waiting");

    wf.completeTask(hr.tokenId, {});
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.id)).toEqual(["endApproved"]);
    expect(wf.getTokens()).toHaveLength(0);
  });

  it("rejects when the manager rejects", () => {
    const wf = newInstance({ employeeName: "Sam" });
    wf.completeTask(onlyTask(wf).tokenId, { decision: "rejected" });

    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.id)).toEqual(["endRejected"]);
  });

  it("escalates via boundary timer when the manager doesn't respond", () => {
    const wf = newInstance({ employeeName: "Priya" });

    const review = onlyTask(wf);
    expect(review.node.id).toBe("managerReview");

    wf.fireTimer(review.tokenId);
    const escalated = onlyTask(wf);
    expect(escalated.node.id).toBe("escalatedReview");

    wf.completeTask(escalated.tokenId, { decision: "approved" });
    wf.completeTask(onlyTask(wf).tokenId, {});
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.id)).toEqual(["endApproved"]);
  });

  it("throws if firing a timer on a task with no timer attached", () => {
    const wf = newInstance();
    wf.completeTask(onlyTask(wf).tokenId, { decision: "approved" });

    const hr = onlyTask(wf); // hrProcessing, no boundary timer
    expect(() => wf.fireTimer(hr.tokenId)).toThrow(/no boundary timer/);
  });

  it("rejects actions on tokens that aren't waiting on a user task", () => {
    const wf = newInstance();
    expect(() => wf.completeTask("nope")).toThrow(/No active token/);
  });
});

describe("parallel gateways", () => {
  it("splits into two tokens and holds the join until both arrive", () => {
    const wf = newInstance();
    wf.completeTask(onlyTask(wf).tokenId, { decision: "approved" });

    // Two live tokens: the HR task, and the one parked at the join.
    const tokens = wf.getTokens();
    expect(tokens).toHaveLength(2);
    expect(tokens.map((token) => token.nodeId).sort()).toEqual(["hrProcessing", "joinApproved"]);

    const log = wf.getLog().map((entry) => entry.message);
    expect(log).toContain("Split into 2 parallel branches");
    expect(log).toContain("Waiting to join (1/2 branches arrived)");
    expect(log).not.toContain("Joined 2 branches");

    wf.completeTask(onlyTask(wf).tokenId, {});
    expect(wf.getLog().map((entry) => entry.message)).toContain("Joined 2 branches");
  });

  it("tags log entries with the token that produced them", () => {
    const wf = newInstance();
    wf.completeTask(onlyTask(wf).tokenId, { decision: "approved" });

    const branchTokens = new Set(
      wf
        .getLog()
        .filter((entry) => entry.nodeId === "hrProcessing" || entry.nodeId === "updateBalance")
        .map((entry) => entry.tokenId)
    );
    // The two branches ran under different tokens.
    expect(branchTokens.size).toBe(2);
  });
});

describe("boundary timers on a clock", () => {
  const DAY = 24 * 60 * 60 * 1000;

  /** An instance whose timers count against a clock the test controls. */
  function withClock() {
    let simTime = 0;
    const wf = new WorkflowInstance(leaveRequestWorkflow, { days: "4" }, handlers, () => simTime);
    wf.start();
    return { wf, set: (ms: number) => (simTime = ms) };
  }

  it("arms the SLA from the file when a token parks on the task", () => {
    const { wf } = withClock();
    const [timer] = wf.getArmedTimers();

    expect(timer).toMatchObject({ nodeId: "managerReview", label: "3-day SLA" });
    expect(timer.remainingMs).toBe(3 * DAY);
  });

  it("counts down and fires on its own once the deadline passes", () => {
    const { wf, set } = withClock();

    set(2 * DAY);
    expect(wf.tick()).toEqual([]);
    expect(wf.getArmedTimers()[0].remainingMs).toBe(DAY);

    set(3 * DAY);
    expect(wf.tick()).toHaveLength(1);
    expect(wf.getActiveTasks()[0].node.id).toBe("escalatedReview");
    // The escalation task carries no timer of its own.
    expect(wf.getArmedTimers()).toEqual([]);
  });

  it("disarms the timer when the task is completed in time", () => {
    const { wf, set } = withClock();
    wf.completeTask(wf.getActiveTasks()[0].tokenId, { decision: "approved" });

    expect(wf.getArmedTimers()).toEqual([]);
    set(10 * DAY);
    expect(wf.tick()).toEqual([]);
    expect(wf.getActiveTasks()[0].node.id).toBe("hrProcessing");
  });
});

describe("service tasks", () => {
  it("runs the registered handler and merges its result into the context", () => {
    const wf = newInstance({ days: "4" });
    wf.completeTask(onlyTask(wf).tokenId, { decision: "approved" });

    expect(wf.getContext()).toMatchObject({ leaveBalance: 14, daysDeducted: 4 });
    expect(wf.getLog().map((entry) => entry.message)).toContain(
      "Deducted 4 day(s) — 14 of 18 remaining"
    );
  });

  it("logs and continues when no handler is registered for the topic", () => {
    const wf = new WorkflowInstance(leaveRequestWorkflow, { days: "2" }, {});
    wf.start();
    wf.completeTask(onlyTask(wf).tokenId, { decision: "approved" });
    wf.completeTask(onlyTask(wf).tokenId, {});

    expect(wf.getStatus()).toBe("completed");
    expect(wf.getLog().map((entry) => entry.message)).toContain(
      'No handler registered for "leave.updateBalance" — skipped'
    );
  });
});

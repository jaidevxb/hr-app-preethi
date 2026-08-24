import { describe, expect, it } from "vitest";
import { handlers } from "./handlers.js";
import { findProcess, processLibrary } from "./processes/index.js";
import type { WorkflowDefinition } from "./types.js";
import { validateProcess } from "./validate.js";

const topics = Object.keys(handlers);
const validate = (id: string) => validateProcess(findProcess(id).definition, topics);

/**
 * A copy the tests can break. structuredClone is out — gateway branches hold
 * compiled condition functions — so this copies the node map one level down,
 * plus the timer object, which is all these tests mutate.
 */
function editableCopy(id: string): WorkflowDefinition {
  const original = findProcess(id).definition;
  return {
    ...original,
    nodes: Object.fromEntries(
      Object.entries(original.nodes).map(([key, node]) => [
        key,
        node.type === "userTask" && node.timer
          ? { ...node, timer: { ...node.timer } }
          : { ...node },
      ])
    ),
  };
}

describe("validateProcess", () => {
  it("passes every process in the library except the broken demo", () => {
    for (const { definition } of processLibrary) {
      if (definition.id === "Process_DeadlockDemo") continue;
      expect(validateProcess(definition, topics), definition.name).toEqual([]);
    }
  });

  it("catches an AND-join sitting downstream of an XOR-split", () => {
    const issues = validate("Process_DeadlockDemo");
    const deadlock = issues.find((issue) => issue.nodeId === "brokenJoin");

    expect(deadlock?.severity).toBe("error");
    expect(deadlock?.message).toContain("waits for 2 branches");
    expect(deadlock?.message).toContain("Which path?");
  });

  it("reports the deadlock once, not once per branch", () => {
    const deadlocks = validate("Process_DeadlockDemo").filter(
      (issue) => issue.nodeId === "brokenJoin"
    );
    expect(deadlocks).toHaveLength(1);
  });

  it("flags a service task whose topic nobody implements", () => {
    const definition = editableCopy("Process_ExpenseApproval");
    const reimburse = definition.nodes.reimburse;
    if (reimburse.type !== "serviceTask") throw new Error("expected a service task");
    reimburse.topic = "expense.notWritten";

    const issues = validateProcess(definition, topics);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        nodeId: "reimburse",
        message: 'No handler registered for topic "expense.notWritten" — this step will be skipped',
      })
    );
  });

  it("flags unreachable elements", () => {
    const definition = editableCopy("Process_LeaveRequest");
    // Cut the escalation path loose by pointing the timer somewhere else.
    const managerReview = definition.nodes.managerReview;
    if (managerReview.type !== "userTask" || !managerReview.timer) throw new Error("no timer");
    managerReview.timer.next = "approvalGateway";

    const issues = validateProcess(definition, topics);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        nodeId: "escalatedReview",
        message: "Unreachable — no path from the start event leads here",
      })
    );
  });

  it("flags a process that can never reach an end event", () => {
    const definition = editableCopy("Process_LeaveRequest");
    for (const id of ["endApproved", "endRejected"]) delete definition.nodes[id];

    const issues = validateProcess(definition, topics);
    expect(issues.map((issue) => issue.message)).toContain(
      "No end event is reachable — this process can never complete"
    );
  });

  it("flags a user task with nobody assigned", () => {
    const definition = editableCopy("Process_LeaveRequest");
    const hrProcessing = definition.nodes.hrProcessing;
    if (hrProcessing.type !== "userTask") throw new Error("expected a user task");
    hrProcessing.assignee = "Unassigned";

    const issues = validateProcess(definition, topics);
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: "warning", nodeId: "hrProcessing" })
    );
  });
});

describe("the deadlock demo actually deadlocks", () => {
  it("hangs at the join with no task left to act on", async () => {
    const { WorkflowInstance } = await import("./engine.js");
    const wf = new WorkflowInstance(findProcess("Process_DeadlockDemo").definition, {}, handlers);
    wf.start();

    wf.completeTask(wf.getActiveTasks()[0].tokenId, {});

    expect(wf.getStatus()).toBe("waiting");
    expect(wf.getActiveTasks()).toEqual([]);
    expect(wf.getTokens().map((token) => token.nodeId)).toEqual(["brokenJoin"]);
    expect(wf.getLog().map((entry) => entry.message)).toContain(
      "Waiting to join (1/2 branches arrived)"
    );
  });
});

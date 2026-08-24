import { describe, expect, it } from "vitest";
import { WorkflowInstance } from "../engine.js";
import { handlers } from "../handlers.js";
import type { StartEventNode } from "../types.js";
import { findProcess, processLibrary } from "./index.js";

function run(processId: string, context: Record<string, unknown>) {
  const wf = new WorkflowInstance(findProcess(processId).definition, context, handlers);
  wf.start();
  return wf;
}

const messages = (wf: WorkflowInstance) => wf.getLog().map((entry) => entry.message);

describe("process library", () => {
  it("parses every .bpmn file in the folder", () => {
    expect(processLibrary.map((process) => process.definition.name)).toEqual([
      "Deadlock Demo (intentionally broken)",
      "Employee Onboarding",
      "Expense Reimbursement",
      "Leave Request Approval",
    ]);
  });

  it("gives every process a start form and a drawn diagram", () => {
    for (const { definition, layout } of processLibrary) {
      const start = definition.nodes[definition.startNodeId] as StartEventNode;
      expect(start.form.length, `${definition.name} start form`).toBeGreaterThan(0);
      expect(layout.shapes.length, `${definition.name} shapes`).toBeGreaterThan(0);
      expect(layout.edges.length, `${definition.name} edges`).toBeGreaterThan(0);
    }
  });
});

describe("Expense Reimbursement", () => {
  it("skips human approval entirely when the rule task says it's within policy", () => {
    const wf = run("Process_ExpenseApproval", { employeeName: "Ravi", amount: 2500 });

    // No user task ever ran — the rule task routed it straight to payout.
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.id)).toEqual(["endPaid"]);
    expect(messages(wf)).toContain("₹2500 is within the ₹5000 limit — no approval needed");
    expect(wf.getLog().some((entry) => entry.nodeId === "financeReview")).toBe(false);
  });

  it("routes over-limit claims to Finance, and pays out when approved", () => {
    const wf = run("Process_ExpenseApproval", { employeeName: "Ravi", amount: 12000 });

    const task = wf.getActiveTasks()[0];
    expect(task.node.id).toBe("financeReview");
    expect(task.node.assignee).toBe("Finance Manager");

    wf.completeTask(task.tokenId, { decision: "approved" });
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.id)).toEqual(["endPaid"]);
    expect(messages(wf)).toContain("Queued ₹12000 for the next payroll run");
  });

  it("rejects over-limit claims that Finance turns down", () => {
    const wf = run("Process_ExpenseApproval", { amount: 12000 });
    wf.completeTask(wf.getActiveTasks()[0].tokenId, { decision: "rejected" });

    expect(wf.getEndEvents().map((end) => end.id)).toEqual(["endRejected"]);
  });
});

describe("Employee Onboarding", () => {
  it("runs three tracks at once and holds the join until all of them land", () => {
    const wf = run("Process_EmployeeOnboarding", { employeeName: "Meera Rao", role: "Backend" });

    expect(messages(wf)).toContain("Split into 3 parallel branches");
    // The service track finished on its own and is parked at the join; the two
    // human tracks are still open.
    expect(wf.getActiveTasks().map((task) => task.node.id).sort()).toEqual([
      "assignBuddy",
      "prepareWorkstation",
    ]);
    expect(wf.getActiveNodeIds()).toContain("joinTracks");
    expect(messages(wf)).toContain("Created email + SSO for meera@example.com");

    // Completing one still isn't enough.
    wf.completeTask(wf.getActiveTasks()[0].tokenId, {});
    expect(wf.getStatus()).toBe("waiting");
    expect(messages(wf)).not.toContain("Joined 3 branches");

    wf.completeTask(wf.getActiveTasks()[0].tokenId, {});
    expect(messages(wf)).toContain("Joined 3 branches");

    // The join released one token into the final task.
    const orientation = wf.getActiveTasks();
    expect(orientation).toHaveLength(1);
    expect(orientation[0].node.id).toBe("orientation");

    wf.completeTask(orientation[0].tokenId, {});
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.outcome)).toEqual(["onboarded"]);
  });
});

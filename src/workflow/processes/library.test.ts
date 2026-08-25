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
      "Employee Offboarding",
      "Employee Onboarding",
      "Expense Reimbursement",
      "Leave Request Approval",
      "Vendor Purchase Order",
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

describe("Vendor Purchase Order — catch events racing to terminate", () => {
  const DAY = 24 * 60 * 60 * 1000;

  /** The PO process on a clock the test controls. */
  function raise() {
    let simTime = 0;
    const wf = new WorkflowInstance(
      findProcess("Process_VendorPurchaseOrder").definition,
      { vendor: "Nandi Supplies", amount: 40000 },
      handlers,
      () => simTime
    );
    wf.start();
    return { wf, set: (ms: number) => (simTime = ms) };
  }

  it("parks all three branches on their events after sending the PO", () => {
    const { wf } = raise();

    expect(messages(wf)).toContain("PO for ₹40000 emailed to Nandi Supplies");
    expect(wf.getActiveTasks()).toEqual([]); // nothing for a human yet

    expect(wf.getPendingEvents().map((event) => [event.kind, event.name])).toEqual([
      ["message", "VendorConfirmed"],
      ["signal", "BudgetPulled"],
    ]);
    // The third branch is on a timer, not an external event.
    expect(wf.getArmedTimers().map((timer) => timer.nodeId)).toEqual(["catchTimeout"]);
  });

  it("lets the vendor confirm, then terminates the losing branches", () => {
    const { wf } = raise();

    expect(wf.deliverMessage("VendorConfirmed")).toBe(true);
    expect(messages(wf)).toContain('Message "VendorConfirmed" received');

    const receive = wf.getActiveTasks()[0];
    expect(receive.node.id).toBe("receiveGoods");
    wf.completeTask(receive.tokenId, {});

    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.id)).toEqual(["endFulfilled"]);
    // The timeout and budget branches were still parked; terminate killed them.
    expect(messages(wf)).toContain("Terminated — discarded 2 token(s) still in flight");
    expect(wf.getTokens()).toEqual([]);
    expect(wf.getPendingEvents()).toEqual([]);
  });

  it("cancels the order when the deadline passes first", () => {
    const { wf, set } = raise();

    set(4 * DAY);
    expect(wf.tick()).toEqual([]);

    set(5 * DAY);
    expect(wf.tick()).toHaveLength(1);

    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.id)).toEqual(["endCancelled"]);
    expect(messages(wf)).toContain("Terminated — discarded 2 token(s) still in flight");
  });

  it("cancels when Finance broadcasts the budget freeze", () => {
    const { wf } = raise();

    expect(wf.broadcastSignal("BudgetPulled")).toBe(1);
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getEndEvents().map((end) => end.outcome)).toEqual(["cancelled"]);
  });

  it("ignores messages and signals nobody is waiting for", () => {
    const { wf } = raise();

    expect(wf.deliverMessage("SomethingElse")).toBe(false);
    expect(wf.broadcastSignal("SomethingElse")).toBe(0);
    expect(wf.getStatus()).toBe("waiting");
  });

  it("only wakes one token per message, unlike a signal", () => {
    const { wf } = raise();

    // The message had exactly one listener; delivering again finds nobody,
    // because that branch has moved on to the Receive Goods task.
    expect(wf.deliverMessage("VendorConfirmed")).toBe(true);
    expect(wf.deliverMessage("VendorConfirmed")).toBe(false);
  });
});

describe("Employee Offboarding — inclusive gateway", () => {
  const offboard = (context: Record<string, unknown>) =>
    run("Process_EmployeeOffboarding", { employeeName: "Dev", ...context });

  /** Walk any remaining user tasks to the end. */
  function finish(wf: ReturnType<typeof run>) {
    while (wf.getStatus() === "waiting" && wf.getActiveTasks().length > 0) {
      wf.completeTask(wf.getActiveTasks()[0].tokenId, {});
    }
    return wf;
  }

  it("takes only the unconditional branch when nothing else applies", () => {
    const wf = offboard({ hasLaptop: false, hasParkingPass: false });

    expect(messages(wf)).toContain('Branch "Always" taken');
    // Straight to the exit interview: the join had nothing to wait for.
    expect(wf.getActiveTasks()[0].node.id).toBe("exitInterview");
    expect(messages(wf).some((message) => message.startsWith("Waiting to join"))).toBe(false);

    finish(wf);
    expect(wf.getStatus()).toBe("completed");
  });

  it("takes two branches and joins exactly two", () => {
    const wf = offboard({ hasLaptop: true, hasParkingPass: false });

    expect(messages(wf)).toContain('2 of 3 branches taken: "Always", "Has laptop"');
    expect(wf.getActiveTasks()[0].node.id).toBe("collectLaptop");
    expect(messages(wf)).toContain("Waiting to join — another branch is still running");

    wf.completeTask(wf.getActiveTasks()[0].tokenId, {});
    // The crucial bit: it joined 2, not the 3 incoming flows it has.
    expect(messages(wf)).toContain("Joined 2 branches");
    expect(wf.getActiveTasks()[0].node.id).toBe("exitInterview");
  });

  it("takes all three when the form says so", () => {
    const wf = offboard({ hasLaptop: true, hasParkingPass: true });

    expect(messages(wf)).toContain(
      '3 of 3 branches taken: "Always", "Has laptop", "Has parking pass"'
    );
    wf.completeTask(wf.getActiveTasks()[0].tokenId, {});
    expect(messages(wf)).toContain("Joined 3 branches");

    finish(wf);
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getContext()).toMatchObject({ parkingPassReturned: true, accessRevokedFor: "Dev" });
  });

  it("never logs a branch decision for the gateway used purely as a join", () => {
    const wf = finish(offboard({ hasLaptop: false, hasParkingPass: false }));
    const joinEntries = wf.getLog().filter((entry) => entry.nodeId === "joinExit");

    expect(joinEntries.map((entry) => entry.message)).not.toContain(
      'Branch "flow_join_exitInterview" taken'
    );
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

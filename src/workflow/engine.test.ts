import { describe, expect, it } from "vitest";
import { WorkflowInstance } from "./engine.js";
import { leaveRequestWorkflow } from "./leaveRequestWorkflow.js";

describe("Leave Request workflow", () => {
  it("approves when manager approves", () => {
    const wf = new WorkflowInstance(leaveRequestWorkflow, { employeeName: "Alex" });
    wf.start();
    expect(wf.getCurrentNode().id).toBe("managerReview");

    wf.completeTask({ decision: "approved" });
    expect(wf.getCurrentNode().id).toBe("hrProcessing");

    wf.completeTask({});
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getCurrentNode().id).toBe("endApproved");
  });

  it("rejects when manager rejects", () => {
    const wf = new WorkflowInstance(leaveRequestWorkflow, { employeeName: "Sam" });
    wf.start();
    wf.completeTask({ decision: "rejected" });

    expect(wf.getStatus()).toBe("completed");
    expect(wf.getCurrentNode().id).toBe("endRejected");
  });

  it("escalates via boundary timer when manager doesn't respond", () => {
    const wf = new WorkflowInstance(leaveRequestWorkflow, { employeeName: "Priya" });
    wf.start();
    expect(wf.getCurrentNode().id).toBe("managerReview");

    wf.fireTimer();
    expect(wf.getCurrentNode().id).toBe("escalatedReview");

    wf.completeTask({ decision: "approved" });
    wf.completeTask({});
    expect(wf.getStatus()).toBe("completed");
    expect(wf.getCurrentNode().id).toBe("endApproved");
  });

  it("throws if firing a timer on a task with no timer attached", () => {
    const wf = new WorkflowInstance(leaveRequestWorkflow, { employeeName: "Jo" });
    wf.start();
    wf.completeTask({ decision: "approved" }); // now at hrProcessing, no timer

    expect(() => wf.fireTimer()).toThrow();
  });
});

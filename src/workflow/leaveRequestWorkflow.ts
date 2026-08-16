import type { WorkflowDefinition } from "./types.js";

/**
 * Leave Request Approval — BPMN flow:
 *
 *  (Start: Request Submitted)
 *        |
 *  [User Task: Manager Review]  --- boundary Timer (SLA) --> [User Task: Escalated Review]
 *        |                                                          |
 *  [Gateway: Approved?]  <---------------------------- (approve/reject) --+
 *     |approved            |rejected
 *     v                    v
 *  [User Task: HR          (End: Rejected)
 *   Processes Leave]
 *     |
 *  (End: Approved)
 */
export const leaveRequestWorkflow: WorkflowDefinition = {
  id: "leave-request-approval",
  name: "Leave Request Approval",
  startNodeId: "start",
  nodes: {
    start: {
      id: "start",
      type: "startEvent",
      name: "Request Submitted",
      next: "managerReview",
    },
    managerReview: {
      id: "managerReview",
      type: "userTask",
      name: "Manager Review",
      assignee: "Manager",
      next: "approvalGateway",
      timer: {
        durationMs: 3 * 24 * 60 * 60 * 1000, // 3 days SLA
        next: "escalatedReview",
      },
    },
    escalatedReview: {
      id: "escalatedReview",
      type: "userTask",
      name: "Escalated Review (Skip-Level)",
      assignee: "Skip-level Manager",
      next: "approvalGateway",
    },
    approvalGateway: {
      id: "approvalGateway",
      type: "exclusiveGateway",
      name: "Approved?",
      branches: [
        {
          label: "Approved",
          condition: (ctx) => ctx.decision === "approved",
          next: "hrProcessing",
        },
        {
          label: "Rejected",
          condition: (ctx) => ctx.decision === "rejected",
          next: "endRejected",
        },
      ],
      default: "endRejected",
    },
    hrProcessing: {
      id: "hrProcessing",
      type: "userTask",
      name: "HR Processes Leave",
      assignee: "HR",
      next: "endApproved",
    },
    endApproved: {
      id: "endApproved",
      type: "endEvent",
      name: "Leave Approved",
      outcome: "approved",
    },
    endRejected: {
      id: "endRejected",
      type: "endEvent",
      name: "Leave Rejected",
      outcome: "rejected",
    },
  },
};

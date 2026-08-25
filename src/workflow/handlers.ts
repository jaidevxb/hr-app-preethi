import type { ServiceHandlers } from "./engine.js";

/**
 * Implementations for the automated steps in the process definitions.
 *
 * Keyed by the `camunda:topic` on the service / business rule task, so the
 * BPMN file says *what* should happen and this registry says *how* — the same
 * split Camunda uses between a process and its external task workers.
 */

const ANNUAL_ALLOWANCE_DAYS = 18;
const AUTO_APPROVE_LIMIT = 5000;

export const handlers: ServiceHandlers = {
  "leave.updateBalance": (ctx) => {
    const days = Number(ctx.days) || 0;
    const before = Number(ctx.leaveBalance ?? ANNUAL_ALLOWANCE_DAYS);
    const after = Math.max(0, before - days);
    return {
      context: { leaveBalance: after, daysDeducted: days },
      message: `Deducted ${days} day(s) — ${after} of ${ANNUAL_ALLOWANCE_DAYS} remaining`,
    };
  },

  "expense.policyCheck": (ctx) => {
    const amount = Number(ctx.amount) || 0;
    const autoApprove = amount <= AUTO_APPROVE_LIMIT;
    return {
      context: { autoApprove },
      message: autoApprove
        ? `₹${amount} is within the ₹${AUTO_APPROVE_LIMIT} limit — no approval needed`
        : `₹${amount} is over the ₹${AUTO_APPROVE_LIMIT} limit — routing to Finance`,
    };
  },

  "expense.reimburse": (ctx) => ({
    context: { reimbursedAt: "next payroll run" },
    message: `Queued ₹${Number(ctx.amount) || 0} for the next payroll run`,
  }),

  "po.send": (ctx) => ({
    context: { poSentTo: String(ctx.vendor ?? "the vendor") },
    message: `PO for ₹${Number(ctx.amount) || 0} emailed to ${String(ctx.vendor ?? "the vendor")}`,
  }),

  "offboarding.revokeAccess": (ctx) => ({
    context: { accessRevokedFor: String(ctx.employeeName ?? "the leaver") },
    message: `Revoked SSO, email and repo access for ${String(ctx.employeeName ?? "the leaver")}`,
  }),

  "offboarding.revokeParking": () => ({
    context: { parkingPassReturned: true },
    message: "Parking pass deactivated and barrier access removed",
  }),

  "onboarding.createAccounts": (ctx) => {
    const name = String(ctx.employeeName ?? "the new hire");
    const handle = name.trim().split(/\s+/)[0].toLowerCase() || "newhire";
    return {
      context: { accountEmail: `${handle}@example.com` },
      message: `Created email + SSO for ${handle}@example.com`,
    };
  },
};

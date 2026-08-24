import type { ServiceHandlers } from "./engine.js";

/**
 * Implementations for the automated steps in the process definitions.
 *
 * Keyed by the `camunda:topic` on the service / business rule task, so the
 * BPMN file says *what* should happen and this registry says *how* — the same
 * split Camunda uses between a process and its external task workers.
 */

const ANNUAL_ALLOWANCE_DAYS = 18;

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
};

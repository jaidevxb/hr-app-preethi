import { useCallback, useEffect, useReducer, useRef } from "react";
import { WorkflowInstance, type ServiceHandlers } from "../workflow/engine.js";
import {
  CLOCK_SPEEDS,
  DEFAULT_SPEED_ID,
  SimulationClock,
} from "../workflow/simulationClock.js";
import type { WorkflowContext, WorkflowDefinition } from "../workflow/types.js";

/** How often the clock is nudged forward, in real milliseconds. */
const TICK_MS = 100;

/**
 * Thin React wrapper around WorkflowInstance. The engine is a plain, mutable
 * class (by design — it's shared as-is with the CLI), so this hook just forces
 * a re-render after every call that changes its state.
 *
 * It also owns the simulation clock the instance's boundary timers count
 * against, and drives it: a 3-day SLA expires in a few seconds instead of
 * three days, but everything else about the timer is real.
 *
 * Actions take a token id — with parallel gateways there can be several user
 * tasks waiting at once, so "the current task" is no longer a single thing.
 */
export function useWorkflowInstance(
  definition: WorkflowDefinition,
  handlers: ServiceHandlers = {},
  speedId: string = DEFAULT_SPEED_ID
) {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const clockRef = useRef<SimulationClock | null>(null);
  if (!clockRef.current) clockRef.current = new SimulationClock();
  const clock = clockRef.current;

  const instanceRef = useRef<WorkflowInstance | null>(null);

  useEffect(() => {
    const speed = CLOCK_SPEEDS.find((candidate) => candidate.id === speedId);
    clock.setSpeed(speed?.simMsPerRealSecond ?? 0);
  }, [clock, speedId]);

  useEffect(() => {
    let previous = performance.now();

    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = now - previous;
      previous = now;

      const instance = instanceRef.current;
      if (!instance || instance.getStatus() !== "waiting" || !clock.isRunning()) return;

      clock.advance(delta);
      const fired = instance.tick();
      // Re-render while a countdown is on screen, or if a timer just escalated.
      if (fired.length > 0 || instance.getArmedTimers().length > 0) forceRender();
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [clock]);

  const submit = useCallback(
    (initialContext: WorkflowContext) => {
      clock.reset();
      const instance = new WorkflowInstance(definition, initialContext, handlers, clock.now);
      instance.start();
      instanceRef.current = instance;
      forceRender();
    },
    [clock, definition, handlers]
  );

  const completeTask = useCallback((tokenId: string, outcome: WorkflowContext = {}) => {
    instanceRef.current?.completeTask(tokenId, outcome);
    forceRender();
  }, []);

  const fireTimer = useCallback((tokenId: string) => {
    instanceRef.current?.fireTimer(tokenId);
    forceRender();
  }, []);

  const reset = useCallback(() => {
    instanceRef.current = null;
    clock.reset();
    forceRender();
  }, [clock]);

  return {
    instance: instanceRef.current,
    elapsedSimMs: clock.now(),
    submit,
    completeTask,
    fireTimer,
    reset,
  };
}

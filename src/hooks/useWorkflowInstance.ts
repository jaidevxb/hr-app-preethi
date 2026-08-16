import { useCallback, useReducer, useRef } from "react";
import { WorkflowInstance } from "../workflow/engine.js";
import type { WorkflowContext, WorkflowDefinition } from "../workflow/types.js";

/**
 * Thin React wrapper around WorkflowInstance. The engine is a plain,
 * mutable class (by design — it's shared as-is with the CLI), so this hook
 * just forces a re-render after every call that changes its state.
 */
export function useWorkflowInstance(definition: WorkflowDefinition) {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const instanceRef = useRef<WorkflowInstance | null>(null);

  const submit = useCallback(
    (initialContext: WorkflowContext) => {
      const instance = new WorkflowInstance(definition, initialContext);
      instance.start();
      instanceRef.current = instance;
      forceRender();
    },
    [definition]
  );

  const completeTask = useCallback((outcome: WorkflowContext = {}) => {
    instanceRef.current?.completeTask(outcome);
    forceRender();
  }, []);

  const fireTimer = useCallback(() => {
    instanceRef.current?.fireTimer();
    forceRender();
  }, []);

  const reset = useCallback(() => {
    instanceRef.current = null;
    forceRender();
  }, []);

  return { instance: instanceRef.current, submit, completeTask, fireTimer, reset };
}

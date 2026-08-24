import { useCallback, useReducer, useRef } from "react";
import { WorkflowInstance, type ServiceHandlers } from "../workflow/engine.js";
import type { WorkflowContext, WorkflowDefinition } from "../workflow/types.js";

/**
 * Thin React wrapper around WorkflowInstance. The engine is a plain, mutable
 * class (by design — it's shared as-is with the CLI), so this hook just forces
 * a re-render after every call that changes its state.
 *
 * Actions take a token id: with parallel gateways there can be several user
 * tasks waiting at once, so "the current task" is no longer a single thing.
 */
export function useWorkflowInstance(definition: WorkflowDefinition, handlers: ServiceHandlers = {}) {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const instanceRef = useRef<WorkflowInstance | null>(null);

  const submit = useCallback(
    (initialContext: WorkflowContext) => {
      const instance = new WorkflowInstance(definition, initialContext, handlers);
      instance.start();
      instanceRef.current = instance;
      forceRender();
    },
    [definition, handlers]
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
    forceRender();
  }, []);

  return { instance: instanceRef.current, submit, completeTask, fireTimer, reset };
}

import { outgoingTargets, reachableFrom } from "./graph.js";
import { isAutomatedTask } from "./types.js";
import type { NodeId, WorkflowDefinition } from "./types.js";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** The element the issue is about, when it is about one. */
  nodeId?: NodeId;
  nodeName?: string;
  message: string;
}

/**
 * Structural checks the parser deliberately doesn't make. The parser rejects
 * files it cannot execute at all; this finds the ones it *can* run but
 * shouldn't — most importantly the join that will sit waiting forever, which
 * the engine will happily deadlock in rather than complain about.
 *
 * `knownTopics` is the handler registry's keys, so a service task pointing at
 * an implementation nobody wrote shows up here instead of at runtime.
 */
export function validateProcess(
  definition: WorkflowDefinition,
  knownTopics: Iterable<string> = []
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const topics = new Set(knownTopics);
  const reachable = reachableFrom(definition, definition.startNodeId);

  const describe = (id: NodeId) => ({ nodeId: id, nodeName: definition.nodes[id]?.name ?? id });

  for (const node of Object.values(definition.nodes)) {
    if (!reachable.has(node.id)) {
      issues.push({
        severity: "error",
        ...describe(node.id),
        message: "Unreachable — no path from the start event leads here",
      });
    }

    if (node.type === "userTask" && node.assignee === "Unassigned") {
      issues.push({
        severity: "warning",
        ...describe(node.id),
        message: "No camunda:assignee — nobody is named as responsible for this task",
      });
    }

    if (isAutomatedTask(node) && !topics.has(node.topic)) {
      issues.push({
        severity: "warning",
        ...describe(node.id),
        message: `No handler registered for topic "${node.topic}" — this step will be skipped`,
      });
    }
  }

  if (![...reachable].some((id) => definition.nodes[id]?.type === "endEvent")) {
    issues.push({
      severity: "error",
      message: "No end event is reachable — this process can never complete",
    });
  }

  issues.push(...findDeadlockedJoins(definition, reachable, describe));
  return issues;
}

/**
 * The classic BPMN mistake: an exclusive gateway picks *one* branch, but both
 * branches feed a parallel join that waits for *all* of them. One token
 * arrives, the join never fires, and the process hangs.
 */
function findDeadlockedJoins(
  definition: WorkflowDefinition,
  reachable: Set<NodeId>,
  describe: (id: NodeId) => { nodeId: NodeId; nodeName: string }
): ValidationIssue[] {
  const flagged = new Set<NodeId>();
  const issues: ValidationIssue[] = [];

  for (const gateway of Object.values(definition.nodes)) {
    if (gateway.type !== "exclusiveGateway" || !reachable.has(gateway.id)) continue;

    const branchTargets = outgoingTargets(gateway);
    if (branchTargets.length < 2) continue;

    // How many of this gateway's mutually exclusive branches lead to each join?
    const arrivalsPerJoin = new Map<NodeId, number>();
    for (const target of branchTargets) {
      for (const id of reachableFrom(definition, target)) {
        const node = definition.nodes[id];
        if (node?.type === "parallelGateway" && node.joinCount > 1) {
          arrivalsPerJoin.set(id, (arrivalsPerJoin.get(id) ?? 0) + 1);
        }
      }
    }

    for (const [joinId, branches] of arrivalsPerJoin) {
      if (branches < 2 || flagged.has(joinId)) continue;
      flagged.add(joinId);

      const join = definition.nodes[joinId];
      if (join?.type !== "parallelGateway") continue;

      issues.push({
        severity: "error",
        ...describe(joinId),
        message: `Deadlock: waits for ${join.joinCount} branches, but "${gateway.name}" only ever takes one of the paths that reach it`,
      });
    }
  }

  return issues;
}

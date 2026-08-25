import type { NodeId, WorkflowDefinition, WorkflowNode } from "./types.js";

/** Everywhere a token can go from this element, ignoring conditions. */
export function outgoingTargets(node: WorkflowNode): NodeId[] {
  switch (node.type) {
    case "startEvent":
    case "serviceTask":
    case "businessRuleTask":
      return [node.next];
    case "userTask":
      return node.timer ? [node.next, node.timer.next] : [node.next];
    case "exclusiveGateway":
    case "inclusiveGateway":
      return [...new Set([node.default, ...node.branches.map((branch) => branch.next)])];
    case "parallelGateway":
      return [...new Set(node.next)];
    case "endEvent":
      return [];
  }
}

/** Every element reachable from `startId`, including it. */
export function reachableFrom(definition: WorkflowDefinition, startId: NodeId): Set<NodeId> {
  const seen = new Set<NodeId>();
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);

    const node = definition.nodes[id];
    if (!node) continue;
    queue.push(...outgoingTargets(node));
  }
  return seen;
}

/** Can a token sitting on `fromId` still get to `targetId`? */
export function canReach(
  definition: WorkflowDefinition,
  fromId: NodeId,
  targetId: NodeId
): boolean {
  return reachableFrom(definition, fromId).has(targetId);
}

import type { WorkflowDefinition } from "./types.js";

/**
 * What's interesting about a process, read off the definition rather than
 * written down next to it — so a new .bpmn file describes itself and an edited
 * one can't end up with a stale blurb.
 */
export function processHighlights(definition: WorkflowDefinition): string[] {
  const nodes = Object.values(definition.nodes);
  const has = (predicate: (node: (typeof nodes)[number]) => boolean) => nodes.some(predicate);

  const tags: string[] = [];

  if (has((node) => node.type === "parallelGateway" && node.joinCount > 1)) tags.push("parallel");
  if (has((node) => node.type === "inclusiveGateway")) tags.push("inclusive OR");
  if (has((node) => node.type === "exclusiveGateway")) tags.push("decision");
  if (has((node) => node.type === "userTask" && Boolean(node.timer))) tags.push("SLA timer");
  if (has((node) => node.type === "businessRuleTask")) tags.push("rules");

  const catchKinds = new Set(
    nodes.flatMap((node) => (node.type === "intermediateCatchEvent" ? [node.trigger.kind] : []))
  );
  for (const kind of ["message", "signal", "timer"] as const) {
    if (catchKinds.has(kind)) tags.push(kind);
  }

  if (has((node) => node.type === "endEvent" && Boolean(node.terminate))) tags.push("terminate");
  if (has((node) => node.type === "serviceTask") && tags.length < 4) tags.push("service task");

  return tags;
}

/** The highlights as one line, kept short enough for a dropdown row. */
export function describeProcess(definition: WorkflowDefinition, limit = 4): string {
  return processHighlights(definition).slice(0, limit).join(" · ");
}

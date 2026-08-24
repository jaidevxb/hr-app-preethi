import { XMLParser } from "fast-xml-parser";
import { parseCondition } from "./conditionExpression.js";
import type {
  BusinessRuleTaskNode,
  EndEventNode,
  ExclusiveGatewayNode,
  NodeId,
  ParallelGatewayNode,
  ServiceTaskNode,
  StartEventNode,
  UserTaskNode,
  WorkflowDefinition,
  WorkflowNode,
} from "./types.js";

/**
 * Reads a BPMN 2.0 XML file and produces both halves of what this app needs:
 * the executable WorkflowDefinition the engine walks, and the diagram layout
 * (positions, waypoints, labels) taken straight from the file's BPMNDI
 * section. That makes the .bpmn file the single source of truth — editing it
 * in Camunda Modeler / bpmn.io changes both what runs and what's drawn.
 *
 * Supported subset: start events, user tasks, exclusive gateways, end events,
 * and boundary timer events. Anything else raises rather than being silently
 * skipped, so an unsupported diagram fails loudly instead of running wrong.
 */

// ---------------------------------------------------------------- layout ----

export type ShapeKind =
  | "start"
  | "end"
  | "userTask"
  | "serviceTask"
  | "businessRuleTask"
  | "exclusiveGateway"
  | "parallelGateway"
  | "boundary";

/** Tasks are rounded rectangles that carry their label inside the shape. */
export function isTaskKind(kind: ShapeKind): boolean {
  return kind === "userTask" || kind === "serviceTask" || kind === "businessRuleTask";
}

export interface ShapeLabel {
  x: number;
  y: number; // baseline of the first line
  w: number;
  lines: string[];
}

export interface DiagramShape {
  id: NodeId;
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: ShapeLabel;
}

export interface DiagramEdge {
  id: string;
  points: [number, number][];
  label?: { x: number; y: number; text: string };
}

export interface DiagramLayout {
  shapes: DiagramShape[];
  edges: DiagramEdge[];
  viewBox: string;
}

export interface BpmnProcess {
  definition: WorkflowDefinition;
  layout: DiagramLayout;
}

export class BpmnParseError extends Error {}

/**
 * Text metrics for label wrapping. The renderer draws labels at 11.5px/600
 * (see `.diagram-label` in styles.css); SVG can't measure text before layout,
 * so wrapping uses a flat average glyph width. It's an approximation, but the
 * alternative — hand-maintained line breaks — is exactly what this replaces.
 */
const CHAR_WIDTH = 6.4;
const LINE_HEIGHT = 13;
/** Baseline sits this far below the top of a BPMNLabel bounds box. */
const EXTERNAL_LABEL_BASELINE = 12;
/** Tasks label inside their own shape; keep text off the rounded corners. */
const TASK_LABEL_PADDING = 12;
/** Vertical nudge that visually centers a label block inside a task shape. */
const TASK_LABEL_SHIFT = -6;
const VIEWBOX_PADDING = 16;

// ------------------------------------------------------------ xml reading ---

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // bpmn:userTask -> userTask, camunda:assignee -> @_assignee
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type XmlNode = Record<string, any>;

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function attr(node: XmlNode, name: string): string | undefined {
  const value = node[`@_${name}`];
  return value === undefined || value === null ? undefined : String(value);
}

function num(node: XmlNode, name: string): number {
  const value = Number(attr(node, name));
  if (!Number.isFinite(value)) {
    throw new BpmnParseError(`Expected numeric "${name}" in diagram bounds`);
  }
  return value;
}

function text(node: XmlNode | string | undefined): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === "string") return node;
  const value = node["#text"];
  return value === undefined ? undefined : String(value);
}

// -------------------------------------------------------------- durations ---

const ISO_DURATION =
  /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * ISO 8601 duration -> milliseconds. Years and months are calendar-dependent;
 * they're approximated (365 / 30 days) since this drives an SLA countdown, not
 * a billing calculation.
 */
export function parseIsoDuration(value: string): number {
  const match = ISO_DURATION.exec(value.trim());
  if (!match || value.trim() === "P") {
    throw new BpmnParseError(`Unsupported timer duration "${value}" (expected ISO 8601, e.g. P3D)`);
  }
  const [, years, months, weeks, days, hours, minutes, seconds] = match.map((part) =>
    part === undefined ? 0 : Number(part)
  );
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  return (
    years * 365 * DAY +
    months * 30 * DAY +
    weeks * 7 * DAY +
    days * DAY +
    hours * HOUR +
    minutes * MINUTE +
    seconds * SECOND
  );
}

// ------------------------------------------------------------------ parse ---

interface SequenceFlow {
  id: string;
  name?: string;
  sourceRef: string;
  targetRef: string;
  condition?: string;
}

export function parseBpmn(xml: string): BpmnProcess {
  const doc = parser.parse(xml);
  const definitions = doc?.definitions;
  if (!definitions) throw new BpmnParseError("No <bpmn:definitions> root element found");

  const processes = toArray<XmlNode>(definitions.process);
  if (processes.length === 0) throw new BpmnParseError("No <bpmn:process> found");
  const process = processes[0];

  const flows = readFlows(process);
  // Checked before the elements are read so "two start events" beats the
  // vaguer complaint about one of them having no outgoing flow.
  const startNodeId = readStartNodeId(process);
  const nodes = readNodes(process, flows);

  const definition: WorkflowDefinition = {
    id: attr(process, "id") ?? "process",
    name: attr(process, "name") ?? "Untitled process",
    startNodeId,
    nodes,
  };

  return { definition, layout: readLayout(definitions, nodes, flows) };
}

function readFlows(process: XmlNode): Map<string, SequenceFlow> {
  const flows = new Map<string, SequenceFlow>();
  for (const raw of toArray<XmlNode>(process.sequenceFlow)) {
    const id = attr(raw, "id");
    const sourceRef = attr(raw, "sourceRef");
    const targetRef = attr(raw, "targetRef");
    if (!id || !sourceRef || !targetRef) {
      throw new BpmnParseError("Every <bpmn:sequenceFlow> needs id, sourceRef and targetRef");
    }
    flows.set(id, {
      id,
      name: attr(raw, "name"),
      sourceRef,
      targetRef,
      condition: text(raw.conditionExpression),
    });
  }
  return flows;
}

function outgoingFlows(elementId: string, flows: Map<string, SequenceFlow>): SequenceFlow[] {
  return [...flows.values()].filter((flow) => flow.sourceRef === elementId);
}

function singleTarget(elementId: string, label: string, flows: Map<string, SequenceFlow>): NodeId {
  const outgoing = outgoingFlows(elementId, flows);
  if (outgoing.length !== 1) {
    throw new BpmnParseError(
      `${label} "${elementId}" must have exactly one outgoing sequence flow, found ${outgoing.length}`
    );
  }
  return outgoing[0].targetRef;
}

function readStartNodeId(process: XmlNode): NodeId {
  const starts = toArray<XmlNode>(process.startEvent);
  if (starts.length !== 1) {
    throw new BpmnParseError(`Expected exactly one <bpmn:startEvent>, found ${starts.length}`);
  }
  const id = attr(starts[0], "id");
  if (!id) throw new BpmnParseError("<bpmn:startEvent> is missing an id");
  return id;
}

function readNodes(
  process: XmlNode,
  flows: Map<string, SequenceFlow>
): Record<NodeId, WorkflowNode> {
  const nodes: Record<NodeId, WorkflowNode> = {};

  const add = (node: WorkflowNode) => {
    if (nodes[node.id]) throw new BpmnParseError(`Duplicate element id "${node.id}"`);
    nodes[node.id] = node;
  };

  for (const raw of toArray<XmlNode>(process.startEvent)) {
    const id = attr(raw, "id")!;
    const node: StartEventNode = {
      id,
      type: "startEvent",
      name: attr(raw, "name") ?? id,
      next: singleTarget(id, "Start event", flows),
    };
    add(node);
  }

  for (const raw of toArray<XmlNode>(process.userTask)) {
    const id = attr(raw, "id");
    if (!id) throw new BpmnParseError("<bpmn:userTask> is missing an id");
    const node: UserTaskNode = {
      id,
      type: "userTask",
      name: attr(raw, "name") ?? id,
      // camunda:assignee — the extension Camunda Modeler exposes in its
      // properties panel, so the role stays editable in real tooling.
      assignee: attr(raw, "assignee") ?? "Unassigned",
      next: singleTarget(id, "User task", flows),
    };
    add(node);
  }

  for (const raw of toArray<XmlNode>(process.serviceTask)) {
    add(readAutomatedTask<ServiceTaskNode>(raw, "serviceTask", "Service task", flows));
  }

  for (const raw of toArray<XmlNode>(process.businessRuleTask)) {
    add(readAutomatedTask<BusinessRuleTaskNode>(raw, "businessRuleTask", "Business rule task", flows));
  }

  for (const raw of toArray<XmlNode>(process.exclusiveGateway)) {
    const id = attr(raw, "id");
    if (!id) throw new BpmnParseError("<bpmn:exclusiveGateway> is missing an id");
    add(readGateway(raw, id, flows));
  }

  for (const raw of toArray<XmlNode>(process.parallelGateway)) {
    const id = attr(raw, "id");
    if (!id) throw new BpmnParseError("<bpmn:parallelGateway> is missing an id");

    const outgoing = outgoingFlows(id, flows);
    if (outgoing.length === 0) {
      throw new BpmnParseError(`Parallel gateway "${id}" has no outgoing sequence flows`);
    }
    const node: ParallelGatewayNode = {
      id,
      type: "parallelGateway",
      name: attr(raw, "name") ?? id,
      // A join fires once every incoming flow has delivered a token.
      joinCount: [...flows.values()].filter((flow) => flow.targetRef === id).length,
      next: outgoing.map((flow) => flow.targetRef),
    };
    add(node);
  }

  for (const raw of toArray<XmlNode>(process.endEvent)) {
    const id = attr(raw, "id");
    if (!id) throw new BpmnParseError("<bpmn:endEvent> is missing an id");
    const node: EndEventNode = {
      id,
      type: "endEvent",
      name: attr(raw, "name") ?? id,
      outcome: attr(raw, "outcome") ?? id,
    };
    add(node);
  }

  attachBoundaryTimers(process, nodes, flows);
  assertTargetsResolve(nodes);
  return nodes;
}

function readAutomatedTask<T extends ServiceTaskNode | BusinessRuleTaskNode>(
  raw: XmlNode,
  type: T["type"],
  label: string,
  flows: Map<string, SequenceFlow>
): T {
  const id = attr(raw, "id");
  if (!id) throw new BpmnParseError(`<bpmn:${type}> is missing an id`);

  // camunda:topic — the same attribute Camunda uses to route external tasks
  // to a worker. Here it names an entry in the handler registry.
  const topic = attr(raw, "topic");
  if (!topic) {
    throw new BpmnParseError(`${label} "${id}" needs a camunda:topic naming its handler`);
  }

  return {
    id,
    type,
    name: attr(raw, "name") ?? id,
    topic,
    next: singleTarget(id, label, flows),
  } as T;
}

function readGateway(
  raw: XmlNode,
  id: NodeId,
  flows: Map<string, SequenceFlow>
): ExclusiveGatewayNode {
  const outgoing = outgoingFlows(id, flows);
  if (outgoing.length === 0) {
    throw new BpmnParseError(`Exclusive gateway "${id}" has no outgoing sequence flows`);
  }

  const defaultFlowId = attr(raw, "default");
  const defaultFlow = defaultFlowId ? flows.get(defaultFlowId) : undefined;
  if (defaultFlowId && !defaultFlow) {
    throw new BpmnParseError(`Gateway "${id}" names an unknown default flow "${defaultFlowId}"`);
  }

  const branches: ExclusiveGatewayNode["branches"] = [];
  for (const flow of outgoing) {
    if (!flow.condition) continue;
    branches.push({
      label: flow.name ?? flow.id,
      condition: parseCondition(flow.condition),
      next: flow.targetRef,
    });
  }

  // The default flow carries no condition (BPMN forbids it), but the engine
  // logs which *branch* was taken — so append it as an always-true branch,
  // last, rather than letting it fall through unnamed.
  if (defaultFlow) {
    branches.push({
      label: defaultFlow.name ?? defaultFlow.id,
      condition: () => true,
      next: defaultFlow.targetRef,
    });
  }

  const fallback = defaultFlow?.targetRef ?? outgoing[outgoing.length - 1].targetRef;
  if (branches.length === 0) {
    throw new BpmnParseError(
      `Exclusive gateway "${id}" has no conditional flows and no default flow — it can't decide anything`
    );
  }

  return {
    id,
    type: "exclusiveGateway",
    name: attr(raw, "name") ?? id,
    branches,
    default: fallback,
  };
}

function attachBoundaryTimers(
  process: XmlNode,
  nodes: Record<NodeId, WorkflowNode>,
  flows: Map<string, SequenceFlow>
): void {
  for (const raw of toArray<XmlNode>(process.boundaryEvent)) {
    const id = attr(raw, "id");
    if (!id) throw new BpmnParseError("<bpmn:boundaryEvent> is missing an id");

    if (!raw.timerEventDefinition) {
      throw new BpmnParseError(
        `Boundary event "${id}" is not a timer event — only timer boundary events are supported`
      );
    }

    const attachedTo = attr(raw, "attachedToRef");
    const host = attachedTo ? nodes[attachedTo] : undefined;
    if (!host || host.type !== "userTask") {
      throw new BpmnParseError(
        `Boundary event "${id}" must attach to a user task (attachedToRef="${attachedTo ?? ""}")`
      );
    }
    if (host.timer) {
      throw new BpmnParseError(`Task "${host.id}" already has a boundary timer attached`);
    }

    const duration = text(raw.timerEventDefinition.timeDuration);
    if (!duration) {
      throw new BpmnParseError(`Boundary timer "${id}" is missing a <bpmn:timeDuration>`);
    }

    host.timer = {
      sourceId: id,
      label: attr(raw, "name"),
      durationMs: parseIsoDuration(duration),
      next: singleTarget(id, "Boundary event", flows),
    };
  }
}

/** Catch dangling references now, rather than mid-run with a cryptic error. */
function assertTargetsResolve(nodes: Record<NodeId, WorkflowNode>): void {
  const exists = (id: NodeId) => Boolean(nodes[id]);
  for (const node of Object.values(nodes)) {
    const targets: NodeId[] = [];
    switch (node.type) {
      case "startEvent":
      case "serviceTask":
      case "businessRuleTask":
        targets.push(node.next);
        break;
      case "userTask":
        targets.push(node.next);
        if (node.timer) targets.push(node.timer.next);
        break;
      case "exclusiveGateway":
        targets.push(node.default, ...node.branches.map((branch) => branch.next));
        break;
      case "parallelGateway":
        targets.push(...node.next);
        break;
      case "endEvent":
        break;
    }
    for (const target of targets) {
      if (!exists(target)) {
        throw new BpmnParseError(`Element "${node.id}" flows to unknown element "${target}"`);
      }
    }
  }
}

// ----------------------------------------------------------------- layout ---

function readLayout(
  definitions: XmlNode,
  nodes: Record<NodeId, WorkflowNode>,
  flows: Map<string, SequenceFlow>
): DiagramLayout {
  const diagrams = toArray<XmlNode>(definitions.BPMNDiagram);
  const plane = diagrams[0]?.BPMNPlane;
  if (!plane) throw new BpmnParseError("No <bpmndi:BPMNPlane> found — the file has no diagram data");

  const shapes = toArray<XmlNode>(plane.BPMNShape).map((raw) => readShape(raw, nodes));
  const edges = toArray<XmlNode>(plane.BPMNEdge).map((raw) => readEdge(raw, flows));

  return { shapes, edges, viewBox: computeViewBox(shapes, edges) };
}

function readShape(raw: XmlNode, nodes: Record<NodeId, WorkflowNode>): DiagramShape {
  const id = attr(raw, "bpmnElement");
  if (!id) throw new BpmnParseError("<bpmndi:BPMNShape> is missing bpmnElement");

  const bounds = raw.Bounds;
  if (!bounds) throw new BpmnParseError(`Shape for "${id}" has no <dc:Bounds>`);

  const shape: DiagramShape = {
    id,
    kind: shapeKindFor(id, nodes),
    x: num(bounds, "x"),
    y: num(bounds, "y"),
    w: num(bounds, "width"),
    h: num(bounds, "height"),
  };

  const name = nameFor(id, nodes);
  if (!name) return shape;

  const labelBounds = raw.BPMNLabel?.Bounds;
  if (labelBounds) {
    // An explicit BPMNLabel box: an external label placed beside the shape.
    const w = num(labelBounds, "width");
    shape.label = {
      x: num(labelBounds, "x"),
      y: num(labelBounds, "y") + EXTERNAL_LABEL_BASELINE,
      w,
      lines: wrap(name, w),
    };
  } else if (isTaskKind(shape.kind)) {
    // Tasks with no BPMNLabel carry their name centered inside the shape,
    // which is how every BPMN tool renders them.
    const lines = wrap(name, shape.w - TASK_LABEL_PADDING);
    const centerY = shape.y + shape.h / 2;
    shape.label = {
      x: shape.x,
      y: centerY + TASK_LABEL_SHIFT - ((lines.length - 1) * LINE_HEIGHT) / 2,
      w: shape.w,
      lines,
    };
  }

  return shape;
}

function readEdge(raw: XmlNode, flows: Map<string, SequenceFlow>): DiagramEdge {
  const id = attr(raw, "bpmnElement");
  if (!id) throw new BpmnParseError("<bpmndi:BPMNEdge> is missing bpmnElement");

  const waypoints = toArray<XmlNode>(raw.waypoint);
  if (waypoints.length < 2) {
    throw new BpmnParseError(`Edge for "${id}" needs at least two <di:waypoint> entries`);
  }

  const edge: DiagramEdge = {
    id,
    points: waypoints.map((point) => [num(point, "x"), num(point, "y")] as [number, number]),
  };

  const labelBounds = raw.BPMNLabel?.Bounds;
  const name = flows.get(id)?.name;
  if (labelBounds && name) {
    edge.label = {
      x: num(labelBounds, "x") + num(labelBounds, "width") / 2,
      y: num(labelBounds, "y") + EXTERNAL_LABEL_BASELINE,
      text: name,
    };
  }

  return edge;
}

function shapeKindFor(id: NodeId, nodes: Record<NodeId, WorkflowNode>): ShapeKind {
  const node = nodes[id];
  if (!node) {
    // Boundary events live on their host task rather than in the node map.
    const isBoundaryTimer = Object.values(nodes).some(
      (candidate) => candidate.type === "userTask" && candidate.timer?.sourceId === id
    );
    if (!isBoundaryTimer) {
      throw new BpmnParseError(`Diagram draws "${id}", which isn't an element of the process`);
    }
    return "boundary";
  }
  switch (node.type) {
    case "startEvent":
      return "start";
    case "endEvent":
      return "end";
    default:
      return node.type;
  }
}

function nameFor(id: NodeId, nodes: Record<NodeId, WorkflowNode>): string | undefined {
  const node = nodes[id];
  if (node) return node.name;
  // Boundary timer: it has a diagram shape but no entry in the node map — its
  // name is folded into the host task's `timer`.
  for (const candidate of Object.values(nodes)) {
    if (candidate.type === "userTask" && candidate.timer?.sourceId === id) {
      return candidate.timer.label;
    }
  }
  return undefined;
}

/** Greedy word wrap against an estimated glyph width. */
function wrap(textValue: string, maxWidth: number): string[] {
  const words = textValue.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (candidate.length * CHAR_WIDTH <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

function computeViewBox(shapes: DiagramShape[], edges: DiagramEdge[]): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const shape of shapes) {
    include(shape.x, shape.y);
    include(shape.x + shape.w, shape.y + shape.h);
    if (shape.label) {
      const top = shape.label.y - EXTERNAL_LABEL_BASELINE;
      include(shape.label.x, top);
      include(shape.label.x + shape.label.w, top + shape.label.lines.length * LINE_HEIGHT);
    }
  }
  for (const edge of edges) {
    for (const [x, y] of edge.points) include(x, y);
    if (edge.label) include(edge.label.x, edge.label.y);
  }

  if (!Number.isFinite(minX)) throw new BpmnParseError("Diagram has no shapes or edges to lay out");

  const x = Math.round(minX - VIEWBOX_PADDING);
  const y = Math.round(minY - VIEWBOX_PADDING);
  const width = Math.round(maxX + VIEWBOX_PADDING) - x;
  const height = Math.round(maxY + VIEWBOX_PADDING) - y;
  return `${x} ${y} ${width} ${height}`;
}

export type NodeId = string;

export interface WorkflowContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: Date;
  nodeId: string;
  nodeName: string;
  message: string;
  /** Which token this happened to — parallel branches interleave in the log. */
  tokenId?: string;
}

interface BaseNode {
  id: NodeId;
  name: string;
}

/**
 * A field on a start form, from `camunda:formData` in the BPMN file — so each
 * process brings its own inputs instead of the UI hardcoding one process's.
 */
export interface FormField {
  id: string;
  label: string;
  type: "string" | "long" | "boolean" | "enum";
  defaultValue?: string;
  placeholder?: string;
  /** Choices for `enum` fields. */
  options?: Array<{ id: string; name: string }>;
}

// BPMN: Start Event
export interface StartEventNode extends BaseNode {
  type: "startEvent";
  next: NodeId;
  /** Empty when the file declares no start form. */
  form: FormField[];
}

// BPMN: End Event
export interface EndEventNode extends BaseNode {
  type: "endEvent";
  outcome: string;
  /**
   * A Terminate End Event doesn't just end its own path — it ends the whole
   * instance, discarding every other token still in flight.
   */
  terminate?: boolean;
}

/**
 * BPMN: Intermediate Catch Event. The token stops here and waits for
 * something: an elapsed duration, a message addressed to this instance, or a
 * broadcast signal. Messages wake one waiting token; signals wake every token
 * listening for them.
 */
export type CatchTrigger =
  | { kind: "timer"; durationMs: number }
  | { kind: "message"; name: string }
  | { kind: "signal"; name: string };

export interface IntermediateCatchEventNode extends BaseNode {
  type: "intermediateCatchEvent";
  next: NodeId;
  trigger: CatchTrigger;
}

// BPMN: User Task, optionally with an attached Boundary Timer Event
export interface UserTaskNode extends BaseNode {
  type: "userTask";
  assignee: string;
  next: NodeId;
  timer?: {
    /** Id of the boundary event element itself — it has its own diagram shape. */
    sourceId: NodeId;
    /** The boundary event's name, e.g. "3-day SLA". */
    label?: string;
    durationMs: number;
    next: NodeId; // where the boundary timer escalation flow goes
  };
}

/**
 * BPMN: Service Task / Business Rule Task — steps that run without a human.
 * `topic` names the handler that implements it; the engine looks it up in the
 * registry handed to the WorkflowInstance rather than embedding behaviour in
 * the process definition.
 */
export interface ServiceTaskNode extends BaseNode {
  type: "serviceTask";
  topic: string;
  next: NodeId;
}

export interface BusinessRuleTaskNode extends BaseNode {
  type: "businessRuleTask";
  topic: string;
  next: NodeId;
}

export interface GatewayBranch {
  label: string;
  condition: (ctx: WorkflowContext) => boolean;
  next: NodeId;
}

// BPMN: Exclusive (Decision) Gateway — exactly one outgoing path is taken.
export interface ExclusiveGatewayNode extends BaseNode {
  type: "exclusiveGateway";
  branches: GatewayBranch[];
  default: NodeId;
}

/**
 * BPMN: Inclusive (OR) Gateway. Splitting takes *every* branch whose condition
 * holds — one, some, or all of them. Joining is the subtle part: it can't wait
 * for a fixed number, because how many branches were activated is only known
 * at runtime. It waits until no token anywhere else in the process could still
 * reach it.
 */
export interface InclusiveGatewayNode extends BaseNode {
  type: "inclusiveGateway";
  branches: GatewayBranch[];
  default: NodeId;
  /** More than one incoming flow means this gateway also acts as a join. */
  incomingCount: number;
}

/**
 * BPMN: Parallel Gateway (AND). Splitting produces a token per outgoing flow;
 * joining waits for one token on every incoming flow before continuing.
 */
export interface ParallelGatewayNode extends BaseNode {
  type: "parallelGateway";
  /** How many incoming flows must arrive before the gateway fires. */
  joinCount: number;
  next: NodeId[];
}

export type WorkflowNode =
  | StartEventNode
  | EndEventNode
  | UserTaskNode
  | ServiceTaskNode
  | BusinessRuleTaskNode
  | IntermediateCatchEventNode
  | ExclusiveGatewayNode
  | InclusiveGatewayNode
  | ParallelGatewayNode;

export type AutomatedTaskNode = ServiceTaskNode | BusinessRuleTaskNode;

export function isAutomatedTask(node: WorkflowNode): node is AutomatedTaskNode {
  return node.type === "serviceTask" || node.type === "businessRuleTask";
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  startNodeId: NodeId;
  nodes: Record<NodeId, WorkflowNode>;
}

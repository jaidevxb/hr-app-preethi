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

// BPMN: Start Event
export interface StartEventNode extends BaseNode {
  type: "startEvent";
  next: NodeId;
}

// BPMN: End Event
export interface EndEventNode extends BaseNode {
  type: "endEvent";
  outcome: string;
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

// BPMN: Exclusive (Decision) Gateway — exactly one outgoing path is taken.
export interface ExclusiveGatewayNode extends BaseNode {
  type: "exclusiveGateway";
  branches: Array<{
    label: string;
    condition: (ctx: WorkflowContext) => boolean;
    next: NodeId;
  }>;
  default: NodeId;
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
  | ExclusiveGatewayNode
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

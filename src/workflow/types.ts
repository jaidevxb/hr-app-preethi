export type NodeId = string;

export interface WorkflowContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: Date;
  nodeId: string;
  nodeName: string;
  message: string;
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

// BPMN: Exclusive (Decision) Gateway
export interface ExclusiveGatewayNode extends BaseNode {
  type: "exclusiveGateway";
  branches: Array<{
    label: string;
    condition: (ctx: WorkflowContext) => boolean;
    next: NodeId;
  }>;
  default: NodeId;
}

export type WorkflowNode =
  | StartEventNode
  | EndEventNode
  | UserTaskNode
  | ExclusiveGatewayNode;

export interface WorkflowDefinition {
  id: string;
  name: string;
  startNodeId: NodeId;
  nodes: Record<NodeId, WorkflowNode>;
}

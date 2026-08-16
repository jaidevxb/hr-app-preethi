import type {
  LogEntry,
  NodeId,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowNode,
} from "./types.js";

export type InstanceStatus = "running" | "waitingOnTask" | "completed";

/**
 * Minimal BPMN-flavored workflow engine. Walks a WorkflowDefinition node by
 * node, auto-advancing through start events / gateways / end events, and
 * pausing at User Tasks until completeTask() or fireTimer() is called.
 */
export class WorkflowInstance {
  private readonly definition: WorkflowDefinition;
  private currentNodeId: NodeId;
  private context: WorkflowContext;
  private readonly log: LogEntry[] = [];
  private status: InstanceStatus = "running";

  constructor(definition: WorkflowDefinition, initialContext: WorkflowContext = {}) {
    this.definition = definition;
    this.currentNodeId = definition.startNodeId;
    this.context = { ...initialContext };
  }

  getStatus(): InstanceStatus {
    return this.status;
  }

  getContext(): WorkflowContext {
    return { ...this.context };
  }

  getCurrentNode(): WorkflowNode {
    return this.node(this.currentNodeId);
  }

  getLog(): LogEntry[] {
    return [...this.log];
  }

  /** Begin execution: process the start event and run until blocked or done. */
  start(): void {
    const node = this.node(this.currentNodeId);
    if (node.type !== "startEvent") {
      throw new Error(`Workflow must begin at a startEvent, got ${node.type}`);
    }
    this.record(node, `Started workflow "${this.definition.name}"`);
    this.moveTo(node.next);
    this.advance();
  }

  /**
   * Complete the User Task currently being waited on. `outcome` is merged
   * into the workflow context so downstream gateways can branch on it.
   */
  completeTask(outcome: WorkflowContext = {}): void {
    const node = this.requireWaitingUserTask();
    this.context = { ...this.context, ...outcome };
    this.record(node, `Task completed by ${node.assignee}`);
    this.moveTo(node.next);
    this.advance();
  }

  /**
   * Simulate the boundary Timer Event on the current User Task firing
   * (e.g. no response within the SLA), rerouting to its escalation path.
   */
  fireTimer(): void {
    const node = this.requireWaitingUserTask();
    if (!node.timer) {
      throw new Error(`Task "${node.name}" has no boundary timer event`);
    }
    this.record(node, `Boundary timer fired (SLA exceeded), escalating`);
    this.moveTo(node.timer.next);
    this.advance();
  }

  private requireWaitingUserTask() {
    if (this.status !== "waitingOnTask") {
      throw new Error(`No user task is currently waiting (status: ${this.status})`);
    }
    const node = this.node(this.currentNodeId);
    if (node.type !== "userTask") {
      throw new Error(`Current node "${node.id}" is not a userTask`);
    }
    return node;
  }

  /** Auto-advance through startEvent/gateway/endEvent nodes until blocked or done. */
  private advance(): void {
    for (;;) {
      const node = this.node(this.currentNodeId);

      if (node.type === "userTask") {
        this.status = "waitingOnTask";
        this.record(node, `Waiting on ${node.assignee}${node.timer ? " (timer armed)" : ""}`);
        return;
      }

      if (node.type === "endEvent") {
        this.status = "completed";
        this.record(node, `Workflow ended: ${node.outcome}`);
        return;
      }

      if (node.type === "exclusiveGateway") {
        const branch = node.branches.find((b) => b.condition(this.context));
        const next = branch?.next ?? node.default;
        this.record(
          node,
          branch ? `Branch "${branch.label}" taken` : "No branch matched, using default"
        );
        this.moveTo(next);
        continue;
      }

      throw new Error(`Cannot auto-advance through node type "${node.type}"`);
    }
  }

  private moveTo(nodeId: NodeId): void {
    this.currentNodeId = nodeId;
    this.status = "running";
  }

  private node(id: NodeId): WorkflowNode {
    const node = this.definition.nodes[id];
    if (!node) throw new Error(`Unknown node id "${id}"`);
    return node;
  }

  private record(node: WorkflowNode, message: string): void {
    this.log.push({ timestamp: new Date(), nodeId: node.id, nodeName: node.name, message });
  }
}

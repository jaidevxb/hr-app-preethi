import { canReach } from "./graph.js";
import { isAutomatedTask } from "./types.js";
import type {
  AutomatedTaskNode,
  EndEventNode,
  InclusiveGatewayNode,
  LogEntry,
  NodeId,
  ParallelGatewayNode,
  UserTaskNode,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowNode,
} from "./types.js";

export type InstanceStatus = "waiting" | "completed";

/** A unit of execution sitting on one element. Parallel branches each get one. */
export interface Token {
  id: string;
  nodeId: NodeId;
}

/** A user task with a live token on it — something a person can act on. */
export interface ActiveTask {
  tokenId: string;
  node: UserTaskNode;
}

export interface ServiceTaskResult {
  /** Values merged into the workflow context. */
  context?: WorkflowContext;
  /** What to write in the activity log; a default is used if omitted. */
  message?: string;
}

export type ServiceHandler = (ctx: WorkflowContext) => ServiceTaskResult | void;
export type ServiceHandlers = Record<string, ServiceHandler>;

/** A boundary timer counting down on a task the process is currently waiting at. */
export interface ArmedTimer {
  tokenId: string;
  nodeId: NodeId;
  nodeName: string;
  label?: string;
  /** Deadline, on whatever clock the instance was given. */
  dueAt: number;
  remainingMs: number;
}

/** Runaway guard: a cyclic definition with no user task would spin forever. */
const MAX_STEPS = 10_000;

/**
 * Minimal BPMN-flavored workflow engine.
 *
 * Execution is modeled with tokens rather than a single cursor, which is what
 * BPMN actually specifies and what parallel gateways require: an AND-split
 * produces a token per outgoing flow, and an AND-join holds them until every
 * incoming flow has delivered one. A process is complete when no tokens remain.
 */
export class WorkflowInstance {
  private readonly definition: WorkflowDefinition;
  private readonly handlers: ServiceHandlers;
  private context: WorkflowContext;
  private readonly log: LogEntry[] = [];
  private readonly reachedEnds: EndEventNode[] = [];

  private tokens: Token[] = [];
  private queue: string[] = [];
  private nextTokenNumber = 1;
  private status: InstanceStatus = "waiting";
  /** tokenId -> deadline, for tokens parked on a task with a boundary timer. */
  private readonly timers = new Map<string, number>();
  private readonly now: () => number;

  constructor(
    definition: WorkflowDefinition,
    initialContext: WorkflowContext = {},
    handlers: ServiceHandlers = {},
    /**
     * Clock the boundary timers count against. Defaults to wall time; the UI
     * passes a simulation clock so a 3-day SLA can expire in a few seconds.
     */
    now: () => number = Date.now
  ) {
    this.definition = definition;
    this.handlers = handlers;
    this.context = { ...initialContext };
    this.now = now;
  }

  getStatus(): InstanceStatus {
    return this.status;
  }

  getContext(): WorkflowContext {
    return { ...this.context };
  }

  getLog(): LogEntry[] {
    return [...this.log];
  }

  getTokens(): Token[] {
    return this.tokens.map((token) => ({ ...token }));
  }

  /** Every element currently holding a token — user tasks and parked joins. */
  getActiveNodeIds(): NodeId[] {
    return [...new Set(this.tokens.map((token) => token.nodeId))];
  }

  /** The user tasks a person can act on right now. */
  getActiveTasks(): ActiveTask[] {
    const tasks: ActiveTask[] = [];
    for (const token of this.tokens) {
      const node = this.node(token.nodeId);
      if (node.type === "userTask") tasks.push({ tokenId: token.id, node });
    }
    return tasks;
  }

  /** End events this instance reached, in the order they were reached. */
  getEndEvents(): EndEventNode[] {
    return [...this.reachedEnds];
  }

  /** Boundary timers currently counting down, with time left on the clock. */
  getArmedTimers(): ArmedTimer[] {
    const now = this.now();
    const armed: ArmedTimer[] = [];

    for (const [tokenId, dueAt] of this.timers) {
      const token = this.tokens.find((candidate) => candidate.id === tokenId);
      if (!token) continue;
      const node = this.node(token.nodeId);
      if (node.type !== "userTask" || !node.timer) continue;

      armed.push({
        tokenId,
        nodeId: node.id,
        nodeName: node.name,
        label: node.timer.label,
        dueAt,
        remainingMs: Math.max(0, dueAt - now),
      });
    }
    return armed;
  }

  /**
   * Fire every boundary timer whose deadline has passed. Returns the tokens
   * that escalated, so a caller driving a clock knows whether anything moved.
   */
  tick(): string[] {
    const now = this.now();
    const due = [...this.timers.entries()]
      .filter(([, dueAt]) => dueAt <= now)
      .map(([tokenId]) => tokenId);

    const fired: string[] = [];
    for (const tokenId of due) {
      // Firing one runs the engine, which can consume or re-arm others.
      if (!this.timers.has(tokenId)) continue;
      this.fireTimer(tokenId);
      fired.push(tokenId);
    }
    return fired;
  }

  /** Begin execution: place a token on the start event and run until blocked. */
  start(): void {
    if (this.log.length > 0) throw new Error("Workflow instance has already been started");
    const node = this.node(this.definition.startNodeId);
    if (node.type !== "startEvent") {
      throw new Error(`Workflow must begin at a startEvent, got ${node.type}`);
    }
    const token = this.createToken(node.id);
    this.queue.push(token.id);
    this.run();
  }

  /**
   * Complete the User Task the given token is waiting on. `outcome` is merged
   * into the workflow context so downstream gateways can branch on it.
   */
  completeTask(tokenId: string, outcome: WorkflowContext = {}): void {
    const { token, node } = this.requireWaitingUserTask(tokenId);
    this.context = { ...this.context, ...outcome };
    this.timers.delete(tokenId);
    this.record(node, `Task completed by ${node.assignee}`, token);
    this.moveToken(token, node.next);
    this.run();
  }

  /**
   * Fire the boundary Timer Event on the task this token is waiting at (e.g.
   * no response within the SLA), rerouting it down the escalation path.
   */
  fireTimer(tokenId: string): void {
    const { token, node } = this.requireWaitingUserTask(tokenId);
    if (!node.timer) {
      throw new Error(`Task "${node.name}" has no boundary timer event`);
    }
    this.timers.delete(tokenId);
    this.record(node, "Boundary timer fired (SLA exceeded), escalating", token);
    this.moveToken(token, node.timer.next);
    this.run();
  }

  private requireWaitingUserTask(tokenId: string): { token: Token; node: UserTaskNode } {
    const token = this.tokens.find((candidate) => candidate.id === tokenId);
    if (!token) throw new Error(`No active token "${tokenId}"`);

    const node = this.node(token.nodeId);
    if (node.type !== "userTask") {
      throw new Error(`Token "${tokenId}" is on "${node.id}", which is not a userTask`);
    }
    return { token, node };
  }

  // ------------------------------------------------------------ execution ---

  /** Drain the queue: advance every token until each is parked or consumed. */
  private run(): void {
    let steps = 0;
    while (this.queue.length > 0) {
      if (++steps > MAX_STEPS) {
        throw new Error(
          `Workflow "${this.definition.id}" exceeded ${MAX_STEPS} steps — the definition probably has a cycle with no wait state`
        );
      }
      const tokenId = this.queue.shift()!;
      const token = this.tokens.find((candidate) => candidate.id === tokenId);
      if (!token) continue; // consumed by a join while it sat in the queue
      this.step(token);
    }
    this.status = this.tokens.length === 0 ? "completed" : "waiting";
  }

  private step(token: Token): void {
    const node = this.node(token.nodeId);

    if (node.type === "startEvent") {
      this.record(node, `Started workflow "${this.definition.name}"`, token);
      this.moveToken(token, node.next);
      return;
    }

    if (node.type === "userTask") {
      // The token parks here; it isn't requeued until a person acts (or the
      // boundary timer runs out).
      if (node.timer) this.timers.set(token.id, this.now() + node.timer.durationMs);
      this.record(node, `Waiting on ${node.assignee}${node.timer ? " (timer armed)" : ""}`, token);
      return;
    }

    if (isAutomatedTask(node)) {
      this.runAutomatedTask(node, token);
      this.moveToken(token, node.next);
      return;
    }

    if (node.type === "exclusiveGateway") {
      const branch = node.branches.find((candidate) => candidate.condition(this.context));
      const next = branch?.next ?? node.default;
      this.record(
        node,
        branch ? `Branch "${branch.label}" taken` : "No branch matched, using default",
        token
      );
      this.moveToken(token, next);
      return;
    }

    if (node.type === "inclusiveGateway") {
      this.stepInclusiveGateway(node, token);
      return;
    }

    if (node.type === "parallelGateway") {
      this.stepParallelGateway(node, token);
      return;
    }

    // endEvent — this token's path is finished.
    this.record(node, `Workflow ended: ${node.outcome}`, token);
    this.reachedEnds.push(node);
    this.consume(token);
  }

  private stepInclusiveGateway(node: InclusiveGatewayNode, token: Token): void {
    if (node.incomingCount > 1) {
      const arrived = this.tokens.filter((candidate) => candidate.nodeId === node.id);

      // An inclusive join can't wait for a fixed number — the split decided how
      // many branches to activate at runtime. So it waits until nothing else
      // could still turn up: no other live token can reach this gateway.
      const stillComing = this.tokens.some(
        (candidate) =>
          candidate.nodeId !== node.id &&
          canReach(this.definition, candidate.nodeId, node.id)
      );

      if (stillComing) {
        // No count here on purpose: tokens are queued the moment they're moved,
        // so "how many have arrived" is ambiguous mid-drain. What matters is
        // that at least one more branch is still live.
        this.record(node, "Waiting to join — another branch is still running", token);
        return;
      }

      for (const other of arrived) {
        if (other.id !== token.id) this.consume(other);
      }
      if (arrived.length > 1) {
        this.record(node, `Joined ${arrived.length} branches`, token);
      }
    }

    const matched = node.branches.filter((branch) => branch.condition(this.context));
    const taken = matched.length > 0 ? matched.map((branch) => branch.next) : [node.default];

    // A gateway used purely as a join has one unconditional way out; saying a
    // "branch was taken" there is noise, not information.
    const isPureJoin = node.branches.length === 1;

    if (matched.length === 0) {
      this.record(node, "No branch matched, using default", token);
    } else if (matched.length === 1) {
      if (!isPureJoin) this.record(node, `Branch "${matched[0].label}" taken`, token);
    } else {
      this.record(
        node,
        `${matched.length} of ${node.branches.length} branches taken: ${matched
          .map((branch) => `"${branch.label}"`)
          .join(", ")}`,
        token
      );
    }

    for (const target of taken.slice(1)) {
      const branch = this.createToken(target);
      this.queue.push(branch.id);
    }
    this.moveToken(token, taken[0]);
  }

  private stepParallelGateway(node: ParallelGatewayNode, token: Token): void {
    if (node.joinCount > 1) {
      const arrived = this.tokens.filter((candidate) => candidate.nodeId === node.id);
      if (arrived.length < node.joinCount) {
        // Park: this branch got here first and waits for its siblings.
        this.record(
          node,
          `Waiting to join (${arrived.length}/${node.joinCount} branches arrived)`,
          token
        );
        return;
      }
      // All in. Merge them back down to the one token we're holding.
      for (const other of arrived) {
        if (other.id !== token.id) this.consume(other);
      }
      this.record(node, `Joined ${node.joinCount} branches`, token);
    }

    if (node.next.length === 0) {
      throw new Error(`Parallel gateway "${node.id}" has no outgoing flow`);
    }

    if (node.next.length > 1) {
      this.record(node, `Split into ${node.next.length} parallel branches`, token);
      for (const target of node.next.slice(1)) {
        const branch = this.createToken(target);
        this.queue.push(branch.id);
      }
    }
    this.moveToken(token, node.next[0]);
  }

  private runAutomatedTask(node: AutomatedTaskNode, token: Token): void {
    const handler = this.handlers[node.topic];
    if (!handler) {
      this.record(node, `No handler registered for "${node.topic}" — skipped`, token);
      return;
    }

    const result = handler(this.getContext()) ?? {};
    if (result.context) this.context = { ...this.context, ...result.context };

    const kind = node.type === "businessRuleTask" ? "Rule evaluated" : "Service task ran";
    this.record(node, result.message ?? `${kind} (${node.topic})`, token);
  }

  // --------------------------------------------------------------- tokens ---

  private createToken(nodeId: NodeId): Token {
    const token: Token = { id: `t${this.nextTokenNumber++}`, nodeId };
    this.tokens.push(token);
    return token;
  }

  private moveToken(token: Token, nodeId: NodeId): void {
    token.nodeId = nodeId;
    this.queue.push(token.id);
  }

  private consume(token: Token): void {
    this.tokens = this.tokens.filter((candidate) => candidate.id !== token.id);
    this.timers.delete(token.id);
  }

  private node(id: NodeId): WorkflowNode {
    const node = this.definition.nodes[id];
    if (!node) throw new Error(`Unknown node id "${id}"`);
    return node;
  }

  private record(node: WorkflowNode, message: string, token?: Token): void {
    this.log.push({
      timestamp: new Date(),
      nodeId: node.id,
      nodeName: node.name,
      message,
      tokenId: token?.id,
    });
  }
}

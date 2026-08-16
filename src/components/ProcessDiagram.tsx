import type { WorkflowInstance } from "../workflow/engine.js";

type NodeKind = "start" | "end" | "task" | "gateway" | "boundary";
type NodeState = "pending" | "visited" | "current";

interface DiagramNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: { x: number; y: number; w: number; lines: string[] };
}

interface DiagramEdge {
  id: string;
  points: [number, number][];
  label?: { x: number; y: number; text: string };
}

const NODES: DiagramNode[] = [
  {
    id: "start",
    kind: "start",
    x: 140,
    y: 242,
    w: 36,
    h: 36,
    label: { x: 115, y: 296, w: 86, lines: ["Request", "Submitted"] },
  },
  { id: "managerReview", kind: "task", x: 270, y: 220, w: 120, h: 80, label: { x: 270, y: 254, w: 120, lines: ["Manager Review"] } },
  {
    id: "managerReviewTimer",
    kind: "boundary",
    x: 312,
    y: 282,
    w: 36,
    h: 36,
    label: { x: 388, y: 296, w: 90, lines: ["3-day SLA"] },
  },
  {
    id: "escalatedReview",
    kind: "task",
    x: 270,
    y: 460,
    w: 120,
    h: 80,
    label: { x: 270, y: 486, w: 120, lines: ["Escalated Review", "(Skip-Level)"] },
  },
  {
    id: "approvalGateway",
    kind: "gateway",
    x: 500,
    y: 235,
    w: 50,
    h: 50,
    label: { x: 490, y: 200, w: 70, lines: ["Approved?"] },
  },
  {
    id: "hrProcessing",
    kind: "task",
    x: 660,
    y: 220,
    w: 120,
    h: 80,
    label: { x: 660, y: 246, w: 120, lines: ["HR Processes", "Leave"] },
  },
  {
    id: "endApproved",
    kind: "end",
    x: 862,
    y: 242,
    w: 36,
    h: 36,
    label: { x: 827, y: 296, w: 106, lines: ["Leave Approved"] },
  },
  {
    id: "endRejected",
    kind: "end",
    x: 507,
    y: 500,
    w: 36,
    h: 36,
    label: { x: 472, y: 554, w: 106, lines: ["Leave Rejected"] },
  },
];

const EDGES: DiagramEdge[] = [
  { id: "e1", points: [[176, 260], [270, 260]] },
  { id: "e2", points: [[390, 260], [500, 260]] },
  { id: "e3", points: [[330, 318], [330, 460]] },
  { id: "e4", points: [[390, 500], [500, 500], [500, 260]] },
  { id: "e5", points: [[550, 260], [660, 260]], label: { x: 605, y: 244, text: "Approved" } },
  { id: "e6", points: [[525, 285], [525, 500]], label: { x: 563, y: 396, text: "Rejected" } },
  { id: "e7", points: [[780, 260], [862, 260]] },
];

const VIEWBOX = "100 190 850 385";

function pathFor(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
}

function stateOf(id: string, visitedIds: string[], currentId?: string): NodeState {
  if (id === currentId) return "current";
  if (visitedIds.includes(id)) return "visited";
  return "pending";
}

function visitedNodeIds(instance: WorkflowInstance): string[] {
  const seen = new Set<string>();
  for (const entry of instance.getLog()) seen.add(entry.nodeId);
  return [...seen];
}

function Node({ node, state }: { node: DiagramNode; state: NodeState }) {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const className = `diagram-node diagram-node--${state}`;

  return (
    <g className={className}>
      {node.kind === "task" && <rect className="diagram-shape" x={node.x} y={node.y} width={node.w} height={node.h} rx={12} />}

      {node.kind === "start" && <circle className="diagram-shape diagram-shape--start" cx={cx} cy={cy} r={node.w / 2} />}

      {node.kind === "end" && <circle className="diagram-shape diagram-shape--end" cx={cx} cy={cy} r={node.w / 2} />}

      {node.kind === "boundary" && (
        <>
          <circle className="diagram-shape diagram-shape--boundary" cx={cx} cy={cy} r={node.w / 2} />
          <path className="diagram-glyph" d={`M${cx},${cy - 6} L${cx},${cy} L${cx + 5},${cy + 3}`} />
        </>
      )}

      {node.kind === "gateway" && (
        <>
          <polygon
            className="diagram-shape"
            points={`${cx},${node.y} ${node.x + node.w},${cy} ${cx},${node.y + node.h} ${node.x},${cy}`}
          />
          <path
            className="diagram-glyph diagram-glyph--bold"
            d={`M${cx - 8},${cy - 8} L${cx + 8},${cy + 8} M${cx - 8},${cy + 8} L${cx + 8},${cy - 8}`}
          />
        </>
      )}

      {node.label && (
        <text className="diagram-label" x={node.label.x + node.label.w / 2} y={node.label.y} textAnchor="middle">
          {node.label.lines.map((line, i) => (
            <tspan key={i} x={node.label!.x + node.label!.w / 2} dy={i === 0 ? 0 : 13}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

function Edge({ edge }: { edge: DiagramEdge }) {
  return (
    <g className="diagram-edge">
      <path d={pathFor(edge.points)} markerEnd="url(#diagram-arrow)" />
      {edge.label && (
        <text className="diagram-edge-label" x={edge.label.x} y={edge.label.y} textAnchor="middle">
          {edge.label.text}
        </text>
      )}
    </g>
  );
}

function WorkflowDiagram({ visitedIds, currentId }: { visitedIds: string[]; currentId?: string }) {
  return (
    <div className="diagram-frame">
      <svg className="diagram-svg" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Leave request process diagram">
        <defs>
          <marker id="diagram-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="diagram-arrowhead" />
          </marker>
        </defs>

        {EDGES.map((edge) => (
          <Edge key={edge.id} edge={edge} />
        ))}

        {NODES.map((node) => (
          <Node key={node.id} node={node} state={stateOf(node.id, visitedIds, currentId)} />
        ))}
      </svg>
    </div>
  );
}

export function ProcessDiagram({ instance }: { instance: WorkflowInstance | null }) {
  const isWaiting = instance?.getStatus() === "waitingOnTask";
  const isCompleted = instance?.getStatus() === "completed";

  const visitedIds = instance ? visitedNodeIds(instance) : [];
  const currentId = isWaiting ? instance!.getCurrentNode().id : undefined;

  const subtitle = !instance
    ? "The full process map — highlights appear once a request is submitted."
    : isCompleted
      ? "Completed — full path highlighted below."
      : "Live progress for this request.";

  return (
    <div className="card stepper-card">
      <div className="stepper-header">
        <span className="eyebrow">{instance ? "In Progress" : "Process Overview"}</span>
        <p className="muted stepper-subtitle">{subtitle}</p>
      </div>
      <WorkflowDiagram visitedIds={visitedIds} currentId={currentId} />
    </div>
  );
}

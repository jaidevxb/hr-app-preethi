import type { BpmnProcess, DiagramEdge, DiagramShape } from "../workflow/bpmnParser.js";
import type { WorkflowInstance } from "../workflow/engine.js";

type NodeState = "pending" | "visited" | "current";

/** Vertical gap between wrapped label lines; matches the parser's metrics. */
const LINE_HEIGHT = 13;

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

function Shape({ shape, state }: { shape: DiagramShape; state: NodeState }) {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const className = `diagram-node diagram-node--${state}`;

  return (
    <g className={className}>
      {shape.kind === "task" && (
        <rect className="diagram-shape" x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={12} />
      )}

      {shape.kind === "start" && <circle className="diagram-shape diagram-shape--start" cx={cx} cy={cy} r={shape.w / 2} />}

      {shape.kind === "end" && <circle className="diagram-shape diagram-shape--end" cx={cx} cy={cy} r={shape.w / 2} />}

      {shape.kind === "boundary" && (
        <>
          <circle className="diagram-shape diagram-shape--boundary" cx={cx} cy={cy} r={shape.w / 2} />
          <path className="diagram-glyph" d={`M${cx},${cy - 6} L${cx},${cy} L${cx + 5},${cy + 3}`} />
        </>
      )}

      {shape.kind === "gateway" && (
        <>
          <polygon
            className="diagram-shape"
            points={`${cx},${shape.y} ${shape.x + shape.w},${cy} ${cx},${shape.y + shape.h} ${shape.x},${cy}`}
          />
          <path
            className="diagram-glyph diagram-glyph--bold"
            d={`M${cx - 8},${cy - 8} L${cx + 8},${cy + 8} M${cx - 8},${cy + 8} L${cx + 8},${cy - 8}`}
          />
        </>
      )}

      {shape.label && (
        <text
          className="diagram-label"
          x={shape.label.x + shape.label.w / 2}
          y={shape.label.y}
          textAnchor="middle"
        >
          {shape.label.lines.map((line, i) => (
            <tspan key={i} x={shape.label!.x + shape.label!.w / 2} dy={i === 0 ? 0 : LINE_HEIGHT}>
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

function WorkflowDiagram({
  process,
  visitedIds,
  currentId,
}: {
  process: BpmnProcess;
  visitedIds: string[];
  currentId?: string;
}) {
  const { layout, definition } = process;

  return (
    <div className="diagram-frame">
      <svg
        className="diagram-svg"
        viewBox={layout.viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${definition.name} process diagram`}
      >
        <defs>
          <marker id="diagram-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="diagram-arrowhead" />
          </marker>
        </defs>

        {layout.edges.map((edge) => (
          <Edge key={edge.id} edge={edge} />
        ))}

        {layout.shapes.map((shape) => (
          <Shape key={shape.id} shape={shape} state={stateOf(shape.id, visitedIds, currentId)} />
        ))}
      </svg>
    </div>
  );
}

export function ProcessDiagram({
  process,
  instance,
}: {
  process: BpmnProcess;
  instance: WorkflowInstance | null;
}) {
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
      <WorkflowDiagram process={process} visitedIds={visitedIds} currentId={currentId} />
    </div>
  );
}

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowInstance } from "../workflow/engine.js";
import { handlers } from "../workflow/handlers.js";
import { leaveRequestProcess, processLibrary } from "../workflow/processes/index.js";
import { ProcessDiagram, WorkflowDiagram } from "./ProcessDiagram.js";

/**
 * The diagram is generated from parsed BPMNDI data, so a broken shape kind or
 * a missing coordinate shows up as malformed SVG rather than a type error.
 * Rendering to a string is enough to catch that without a DOM.
 */
function render(visitedIds: string[] = [], activeIds: string[] = []) {
  return renderToStaticMarkup(
    <WorkflowDiagram process={leaveRequestProcess} visitedIds={visitedIds} activeIds={activeIds} />
  );
}

describe("WorkflowDiagram", () => {
  it("draws every shape and edge in the process", () => {
    const svg = render();

    // 4 tasks (3 user + 1 service), 1 exclusive + 2 parallel gateways,
    // start + 2 ends + 1 boundary event.
    expect(svg.match(/<rect class="diagram-shape"/g)).toHaveLength(4);
    expect(svg.match(/<polygon class="diagram-shape"/g)).toHaveLength(3);
    expect(svg.match(/<circle class="diagram-shape/g)).toHaveLength(4);
    expect(svg.match(/markerEnd|marker-end/g)?.length).toBe(
      leaveRequestProcess.layout.edges.length
    );
  });

  it("gives each task type its own icon", () => {
    const svg = render();
    // user task icons have a head + shoulders path, service tasks a spoked
    // circle — one icon group per task shape.
    expect(svg.match(/class="diagram-icon"/g)).toHaveLength(4);
  });

  it("labels the elements with text from the BPMN file", () => {
    const svg = render();
    for (const text of [
      "Manager Review",
      "Escalated Review",
      "HR Processes",
      "Update Leave",
      "Approved?",
      "3-day SLA",
      "Leave Approved",
      "Leave Rejected",
    ]) {
      expect(svg).toContain(text);
    }
  });

  it("marks parked and active elements as current, and the rest as visited", () => {
    const wf = new WorkflowInstance(leaveRequestProcess.definition, { days: "3" }, handlers);
    wf.start();
    wf.completeTask(wf.getActiveTasks()[0].tokenId, { decision: "approved" });

    const svg = renderToStaticMarkup(
      <WorkflowDiagram
        process={leaveRequestProcess}
        visitedIds={wf.getLog().map((entry) => entry.nodeId)}
        activeIds={wf.getActiveNodeIds()}
      />
    );

    // Two elements hold tokens right now: the HR task and the parked join.
    expect(svg.match(/diagram-node diagram-node--current/g)).toHaveLength(2);
    expect(svg).toContain("diagram-node diagram-node--visited");
    // Nothing on the rejected path has been touched.
    expect(svg).toContain("diagram-node diagram-node--pending");
  });
});

/**
 * Every process is laid out by hand in its .bpmn file, so these check the
 * whole library rather than just the leave request: a shape with no renderer,
 * a NaN coordinate or a label that never got wrapped shows up here.
 */
describe("every process in the library draws", () => {
  it.each(processLibrary.map((process) => [process.definition.name, process] as const))(
    "%s",
    (_name, process) => {
      const svg = renderToStaticMarkup(
        <WorkflowDiagram process={process} visitedIds={[]} activeIds={[]} />
      );

      // Every element in the file got a shape of some sort.
      const drawn = (svg.match(/class="diagram-shape/g) ?? []).length;
      expect(drawn).toBeGreaterThanOrEqual(process.layout.shapes.length);

      // Every edge got a path with an arrowhead.
      expect(svg.match(/marker-end/g) ?? []).toHaveLength(process.layout.edges.length);

      // No coordinate came out undefined or NaN.
      expect(svg).not.toMatch(/NaN|undefined/);

      // Every label the layout produced actually made it into the markup.
      for (const shape of process.layout.shapes) {
        for (const line of shape.label?.lines ?? []) {
          expect(svg, `${shape.id} label`).toContain(line);
        }
      }
    }
  );

  it("gives the viewBox of each diagram a positive width and height", () => {
    for (const { definition, layout } of processLibrary) {
      const [, , width, height] = layout.viewBox.split(" ").map(Number);
      expect(width, `${definition.name} width`).toBeGreaterThan(0);
      expect(height, `${definition.name} height`).toBeGreaterThan(0);
    }
  });
});

describe("replay", () => {
  /** An instance that ran all the way to "Leave Approved". */
  function completed() {
    const wf = new WorkflowInstance(leaveRequestProcess.definition, { days: "3" }, handlers);
    wf.start();
    wf.completeTask(wf.getActiveTasks()[0].tokenId, { decision: "approved" });
    wf.completeTask(wf.getActiveTasks()[0].tokenId, {});
    return wf;
  }

  const at = (wf: WorkflowInstance, replayIndex: number | null) =>
    renderToStaticMarkup(
      <ProcessDiagram process={leaveRequestProcess} instance={wf} replayIndex={replayIndex} />
    );

  it("highlights exactly the element each log entry touched", () => {
    const wf = completed();

    const first = at(wf, 0);
    expect(first).toContain("Replaying");
    // Step one is the start event and nothing else.
    expect(first.match(/diagram-node diagram-node--current/g)).toHaveLength(1);
    expect(first.match(/diagram-node diagram-node--visited/g)).toBeNull();
  });

  it("accumulates visited elements as the replay advances", () => {
    const wf = completed();
    const log = wf.getLog();

    const countVisited = (index: number) =>
      (at(wf, index).match(/diagram-node diagram-node--visited/g) ?? []).length;

    expect(countVisited(log.length - 1)).toBeGreaterThan(countVisited(1));
  });

  it("falls back to live state when no replay index is given", () => {
    const svg = at(completed(), null);
    expect(svg).toContain("Completed — full path highlighted below.");
    // Nothing is current once the instance is done.
    expect(svg.match(/diagram-node diagram-node--current/g)).toBeNull();
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowInstance } from "../workflow/engine.js";
import { handlers } from "../workflow/handlers.js";
import { leaveRequestProcess } from "../workflow/processes/index.js";
import { WorkflowDiagram } from "./ProcessDiagram.js";

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

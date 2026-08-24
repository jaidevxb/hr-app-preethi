import { describe, expect, it } from "vitest";
import { BpmnParseError, parseBpmn, parseIsoDuration } from "./bpmnParser.js";
import { ConditionExpressionError, parseCondition } from "./conditionExpression.js";
import { leaveRequestProcess } from "./leaveRequestWorkflow.js";

const { definition, layout } = leaveRequestProcess;

describe("parseBpmn — process semantics", () => {
  it("reads the process identity and start event", () => {
    expect(definition.id).toBe("Process_LeaveRequest");
    expect(definition.name).toBe("Leave Request Approval");
    expect(definition.startNodeId).toBe("start");
  });

  it("wires sequence flows into next pointers", () => {
    expect(definition.nodes.start).toMatchObject({ type: "startEvent", next: "managerReview" });
    expect(definition.nodes.managerReview).toMatchObject({ next: "approvalGateway" });
    expect(definition.nodes.hrProcessing).toMatchObject({ next: "joinApproved" });
  });

  it("reads a parallel gateway's split targets and join arity", () => {
    expect(definition.nodes.splitApproved).toMatchObject({
      type: "parallelGateway",
      joinCount: 1,
      next: ["hrProcessing", "updateBalance"],
    });
    expect(definition.nodes.joinApproved).toMatchObject({
      type: "parallelGateway",
      joinCount: 2,
      next: ["endApproved"],
    });
  });

  it("reads a service task's handler topic", () => {
    expect(definition.nodes.updateBalance).toMatchObject({
      type: "serviceTask",
      name: "Update Leave Balance",
      topic: "leave.updateBalance",
      next: "joinApproved",
    });
  });

  it("reads assignees from camunda:assignee", () => {
    const assignees = Object.values(definition.nodes)
      .filter((node) => node.type === "userTask")
      .map((node) => node.assignee);
    expect(assignees).toEqual(["Manager", "Skip-level Manager", "HR"]);
  });

  it("reads end-event outcomes", () => {
    expect(definition.nodes.endApproved).toMatchObject({ outcome: "approved" });
    expect(definition.nodes.endRejected).toMatchObject({ outcome: "rejected" });
  });

  it("folds the boundary timer onto its host task with the ISO duration in ms", () => {
    const managerReview = definition.nodes.managerReview;
    if (managerReview.type !== "userTask") throw new Error("expected a user task");

    expect(managerReview.timer).toEqual({
      sourceId: "managerReviewTimer",
      label: "3-day SLA",
      durationMs: 3 * 24 * 60 * 60 * 1000,
      next: "escalatedReview",
    });
    // Only the manager review is under an SLA.
    const escalated = definition.nodes.escalatedReview;
    if (escalated.type !== "userTask") throw new Error("expected a user task");
    expect(escalated.timer).toBeUndefined();
  });

  it("builds gateway branches from conditions, with the default flow last", () => {
    const gateway = definition.nodes.approvalGateway;
    if (gateway.type !== "exclusiveGateway") throw new Error("expected a gateway");

    expect(gateway.branches.map((branch) => branch.label)).toEqual(["Approved", "Rejected"]);
    expect(gateway.branches.map((branch) => branch.next)).toEqual(["splitApproved", "endRejected"]);
    expect(gateway.default).toBe("endRejected");

    const [approved, rejected] = gateway.branches;
    expect(approved.condition({ decision: "approved" })).toBe(true);
    expect(approved.condition({ decision: "rejected" })).toBe(false);
    // The default branch matches anything that got past the conditional ones.
    expect(rejected.condition({ decision: "rejected" })).toBe(true);
    expect(rejected.condition({})).toBe(true);
  });
});

describe("parseBpmn — diagram layout", () => {
  it("produces a shape per diagram element, including the boundary event", () => {
    expect(layout.shapes.map((shape) => shape.id)).toEqual([
      "start",
      "managerReview",
      "managerReviewTimer",
      "escalatedReview",
      "approvalGateway",
      "splitApproved",
      "hrProcessing",
      "updateBalance",
      "joinApproved",
      "endApproved",
      "endRejected",
    ]);

    const kindOf = (id: string) => layout.shapes.find((shape) => shape.id === id)?.kind;
    expect(kindOf("managerReviewTimer")).toBe("boundary");
    expect(kindOf("approvalGateway")).toBe("exclusiveGateway");
    expect(kindOf("splitApproved")).toBe("parallelGateway");
    expect(kindOf("hrProcessing")).toBe("userTask");
    expect(kindOf("updateBalance")).toBe("serviceTask");
  });

  it("takes shape geometry straight from dc:Bounds", () => {
    expect(layout.shapes[0]).toMatchObject({ id: "start", kind: "start", x: 140, y: 242, w: 36, h: 36 });
  });

  it("wraps labels to the width declared in the file", () => {
    const linesFor = (id: string) => layout.shapes.find((shape) => shape.id === id)?.label?.lines;

    expect(linesFor("start")).toEqual(["Request", "Submitted"]);
    expect(linesFor("managerReview")).toEqual(["Manager Review"]);
    expect(linesFor("escalatedReview")).toEqual(["Escalated Review", "(Skip-Level)"]);
    expect(linesFor("hrProcessing")).toEqual(["HR Processes", "Leave"]);
    expect(linesFor("updateBalance")).toEqual(["Update Leave", "Balance"]);
    expect(linesFor("managerReviewTimer")).toEqual(["3-day SLA"]);
    expect(linesFor("endApproved")).toEqual(["Leave Approved"]);
    // Unnamed elements (the parallel gateways) get no label at all.
    expect(linesFor("splitApproved")).toBeUndefined();
  });

  it("reads edge waypoints and names conditional edges", () => {
    const edge = layout.edges.find((candidate) => candidate.id === "flow_escalatedReview_gateway");
    expect(edge?.points).toEqual([
      [390, 500],
      [500, 500],
      [500, 260],
    ]);

    const approved = layout.edges.find((candidate) => candidate.id === "flow_gateway_split");
    expect(approved?.label).toEqual({ x: 585, y: 244, text: "Approved" });

    // No name on the flow means no label drawn.
    expect(layout.edges.find((candidate) => candidate.id === "flow_start_managerReview")?.label).toBeUndefined();
  });

  it("derives a viewBox that contains every shape, label and waypoint", () => {
    const [x, y, width, height] = layout.viewBox.split(" ").map(Number);
    expect(x).toBeLessThanOrEqual(115); // leftmost label bounds
    expect(y).toBeLessThanOrEqual(210); // gateway label sits above the diamond
    expect(x + width).toBeGreaterThanOrEqual(1031); // right edge of the approved label
    expect(y + height).toBeGreaterThanOrEqual(556); // bottom of the rejected label
  });
});

// A skeleton with just enough structure to exercise one failure at a time.
function bpmn(processBody: string, diagramBody = '<bpmndi:BPMNShape bpmnElement="s"><dc:Bounds x="0" y="0" width="36" height="36" /></bpmndi:BPMNShape>') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D">
  <bpmn:process id="P" name="Test">${processBody}</bpmn:process>
  <bpmndi:BPMNDiagram id="Dg"><bpmndi:BPMNPlane id="Pl" bpmnElement="P">${diagramBody}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

describe("parseBpmn — failure modes", () => {
  it("rejects a file with no process", () => {
    expect(() => parseBpmn("<?xml version=\"1.0\"?><bpmn:definitions xmlns:bpmn=\"x\" />")).toThrow(
      BpmnParseError
    );
  });

  it("rejects more than one start event", () => {
    const xml = bpmn(`
      <bpmn:startEvent id="s" /><bpmn:startEvent id="s2" />
      <bpmn:endEvent id="e" />`);
    expect(() => parseBpmn(xml)).toThrow(/exactly one <bpmn:startEvent>/);
  });

  it("rejects a start event that doesn't flow anywhere", () => {
    const xml = bpmn(`<bpmn:startEvent id="s" /><bpmn:endEvent id="e" />`);
    expect(() => parseBpmn(xml)).toThrow(/exactly one outgoing sequence flow/);
  });

  it("rejects a flow pointing at an element that doesn't exist", () => {
    const xml = bpmn(`
      <bpmn:startEvent id="s" /><bpmn:endEvent id="e" />
      <bpmn:sequenceFlow id="f" sourceRef="s" targetRef="ghost" />`);
    expect(() => parseBpmn(xml)).toThrow(/unknown element "ghost"/);
  });

  it("rejects a non-timer boundary event", () => {
    const xml = bpmn(`
      <bpmn:startEvent id="s" /><bpmn:userTask id="t" /><bpmn:endEvent id="e" />
      <bpmn:boundaryEvent id="b" attachedToRef="t"><bpmn:messageEventDefinition /></bpmn:boundaryEvent>
      <bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="t" />
      <bpmn:sequenceFlow id="f2" sourceRef="t" targetRef="e" />`);
    expect(() => parseBpmn(xml)).toThrow(/only timer boundary events are supported/);
  });

  it("rejects a gateway that can't decide anything", () => {
    const xml = bpmn(`
      <bpmn:startEvent id="s" /><bpmn:exclusiveGateway id="g" /><bpmn:endEvent id="e" />
      <bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="g" />
      <bpmn:sequenceFlow id="f2" sourceRef="g" targetRef="e" />`);
    expect(() => parseBpmn(xml)).toThrow(/no conditional flows and no default flow/);
  });

  it("rejects a diagram drawing an element the process doesn't contain", () => {
    const xml = bpmn(
      `<bpmn:startEvent id="s" /><bpmn:endEvent id="e" />
       <bpmn:sequenceFlow id="f" sourceRef="s" targetRef="e" />`,
      '<bpmndi:BPMNShape bpmnElement="nope"><dc:Bounds x="0" y="0" width="36" height="36" /></bpmndi:BPMNShape>'
    );
    expect(() => parseBpmn(xml)).toThrow(/isn't an element of the process/);
  });
});

describe("parseIsoDuration", () => {
  it("parses the durations a BPMN timer realistically carries", () => {
    expect(parseIsoDuration("P3D")).toBe(3 * 86_400_000);
    expect(parseIsoDuration("PT30M")).toBe(30 * 60_000);
    expect(parseIsoDuration("PT2H30M")).toBe(2.5 * 3_600_000);
    expect(parseIsoDuration("P1DT12H")).toBe(1.5 * 86_400_000);
    expect(parseIsoDuration("P2W")).toBe(14 * 86_400_000);
  });

  it("rejects anything that isn't an ISO 8601 duration", () => {
    expect(() => parseIsoDuration("3 days")).toThrow(BpmnParseError);
    expect(() => parseIsoDuration("P")).toThrow(BpmnParseError);
  });
});

describe("parseCondition", () => {
  it("compares strings, numbers and booleans", () => {
    expect(parseCondition('decision == "approved"')({ decision: "approved" })).toBe(true);
    expect(parseCondition('decision != "approved"')({ decision: "rejected" })).toBe(true);
    expect(parseCondition("days > 5")({ days: "10" })).toBe(true);
    expect(parseCondition("days > 5")({ days: "2" })).toBe(false);
    expect(parseCondition("days <= 5")({ days: 5 })).toBe(true);
    expect(parseCondition("urgent == true")({ urgent: true })).toBe(true);
  });

  it("unwraps Camunda's ${...} syntax", () => {
    expect(parseCondition('${decision == "approved"}')({ decision: "approved" })).toBe(true);
  });

  it("is false, not throwing, when the variable is missing", () => {
    expect(parseCondition('decision == "approved"')({})).toBe(false);
    expect(parseCondition("days > 5")({})).toBe(false);
  });

  it("refuses anything outside the grammar rather than evaluating it", () => {
    expect(() => parseCondition('alert("pwned")')).toThrow(ConditionExpressionError);
    expect(() => parseCondition("a + b == 2")).toThrow(ConditionExpressionError);
    expect(() => parseCondition("decision == approved")).toThrow(ConditionExpressionError);
  });
});

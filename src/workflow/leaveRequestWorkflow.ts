import bpmnXml from "./leaveRequestWorkflow.bpmn?raw";
import { parseBpmn, type BpmnProcess } from "./bpmnParser.js";

/**
 * The Leave Request process, loaded from the BPMN 2.0 XML at build time.
 *
 * There is no hand-written copy of this process any more: the flow, the
 * assignees, the 3-day SLA and every diagram coordinate come out of
 * leaveRequestWorkflow.bpmn. Edit that file in Camunda Modeler or bpmn.io and
 * both the engine and the on-screen diagram follow.
 *
 * (The `?raw` import is Vite-only; the CLI reads the same file with `fs` —
 * see src/cli.ts.)
 */
export const leaveRequestProcess: BpmnProcess = parseBpmn(bpmnXml);

export const leaveRequestWorkflow = leaveRequestProcess.definition;
export const leaveRequestLayout = leaveRequestProcess.layout;

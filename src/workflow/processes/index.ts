import { parseBpmn, type BpmnProcess } from "../bpmnParser.js";

/**
 * Every .bpmn file in this folder, parsed. Adding a process to the simulator
 * is adding a file here — no registration step, no engine changes.
 *
 * (Vite resolves the glob at build time. The CLI can't use `import.meta.glob`,
 * so it walks the same folder with `fs` — see loadProcessLibrary.node.ts.)
 */
const sources = import.meta.glob("./*.bpmn", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const processLibrary: BpmnProcess[] = Object.keys(sources)
  .sort()
  .map((path) => parseBpmn(sources[path]))
  .sort((a, b) => a.definition.name.localeCompare(b.definition.name));

/** The process the UI opens on — the one the rest of the docs talk about. */
export const DEFAULT_PROCESS_ID = "Process_LeaveRequest";

export function findProcess(id: string): BpmnProcess {
  const match = processLibrary.find((process) => process.definition.id === id);
  if (!match) throw new Error(`No process with id "${id}" in the library`);
  return match;
}

export const leaveRequestProcess = findProcess(DEFAULT_PROCESS_ID);

import { readdirSync, readFileSync } from "node:fs";
import { parseBpmn, type BpmnProcess } from "./bpmnParser.js";

/**
 * The Node-side twin of processes/index.ts: same folder, same parser, but read
 * off disk instead of through Vite's `import.meta.glob`. Used by the CLI.
 */
export function loadProcessLibrary(
  dir: URL = new URL("./processes/", import.meta.url)
): BpmnProcess[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".bpmn"))
    .sort()
    .map((name) => parseBpmn(readFileSync(new URL(name, dir), "utf8")))
    .sort((a, b) => a.definition.name.localeCompare(b.definition.name));
}

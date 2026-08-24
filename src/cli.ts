import { createInterface } from "node:readline";
import { WorkflowInstance } from "./workflow/engine.js";
import { handlers } from "./workflow/handlers.js";
import { loadProcessLibrary } from "./workflow/loadProcessLibrary.node.js";
import { validateProcess } from "./workflow/validate.js";
import type { FormField, StartEventNode, WorkflowContext } from "./workflow/types.js";

const library = loadProcessLibrary();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();

async function ask(promptText: string): Promise<string> {
  process.stdout.write(promptText);
  const { value, done } = await lines.next();
  return done ? "" : value;
}

function printLog(instance: WorkflowInstance) {
  console.log("\n--- Workflow log ---");
  for (const entry of instance.getLog()) {
    const token = entry.tokenId ? `${entry.tokenId} ` : "";
    console.log(`${token}[${entry.nodeName}] ${entry.message}`);
  }
  console.log("--------------------\n");
}

/** Prompt for one field, described entirely by the BPMN file's formData. */
async function askField(field: FormField): Promise<unknown> {
  if (field.type === "enum") {
    const choices = field.options ?? [];
    const list = choices.map((option, i) => `${i + 1}) ${option.name}`).join("  ");
    const answer = (await ask(`${field.label} — ${list}: `)).trim();
    const picked = choices[Number(answer) - 1] ?? choices[0];
    return picked?.id ?? "";
  }

  if (field.type === "boolean") {
    const answer = (await ask(`${field.label} [y/N]: `)).trim().toLowerCase();
    return answer.startsWith("y");
  }

  const suffix = field.defaultValue ? ` [${field.defaultValue}]` : "";
  const answer = (await ask(`${field.label}${suffix}: `)).trim() || field.defaultValue || "";
  return field.type === "long" ? Number(answer) || 0 : answer || "—";
}

async function pickProcess() {
  if (library.length === 1) return library[0];

  console.log("Processes in the library:");
  library.forEach((entry, i) => {
    console.log(`  ${i + 1}) ${entry.definition.name}`);
  });
  const answer = (await ask(`Pick one [1-${library.length}]: `)).trim();
  return library[Number(answer) - 1] ?? library[0];
}

async function main() {
  console.log("=== BPMN Workflow Simulator ===\n");

  const { definition } = await pickProcess();
  console.log(`\n--- ${definition.name} ---`);

  const issues = validateProcess(definition, Object.keys(handlers));
  for (const issue of issues) {
    const mark = issue.severity === "error" ? "✕" : "!";
    const where = issue.nodeName ? `${issue.nodeName}: ` : "";
    console.log(`  ${mark} ${where}${issue.message}`);
  }
  console.log();

  const start = definition.nodes[definition.startNodeId] as StartEventNode;
  const initialContext: WorkflowContext = {};
  for (const field of start.form) {
    initialContext[field.id] = await askField(field);
  }

  const instance = new WorkflowInstance(definition, initialContext, handlers);
  instance.start();

  while (instance.getStatus() === "waiting") {
    const tasks = instance.getActiveTasks();
    if (tasks.length === 0) {
      // Tokens remain but none are on a user task — a join is still waiting on
      // a branch that can't arrive. Nothing a person can do about it here.
      console.log("\n!! Deadlocked: tokens are parked at a join that will never complete.");
      break;
    }

    if (tasks.length > 1) {
      console.log(`\n(${tasks.length} tasks waiting in parallel — handling them in order)`);
    }

    // Take them one at a time; the list refreshes after each completion.
    const { tokenId, node } = tasks[0];
    console.log(`\n>> Current task: "${node.name}" (assignee: ${node.assignee})`);

    // A task that feeds an exclusive gateway is a decision — ask for one.
    // Anything else just needs acknowledging. Both facts come from the parsed
    // process rather than from hardcoded node ids.
    const nextNode = definition.nodes[node.next];

    if (nextNode?.type === "exclusiveGateway") {
      const hasTimer = !!node.timer;
      const prompt = hasTimer
        ? "Decision — [a]pprove / [r]eject / [t]imer expires (escalate): "
        : "Decision — [a]pprove / [r]eject: ";
      const answer = ((await ask(prompt)) || "").trim().toLowerCase();

      if (hasTimer && answer.startsWith("t")) {
        instance.fireTimer(tokenId);
        continue;
      }
      const decision = answer.startsWith("a") ? "approved" : "rejected";
      instance.completeTask(tokenId, { decision });
      continue;
    }

    await ask(`Press Enter to complete "${node.name}"...`);
    instance.completeTask(tokenId, {});
  }

  printLog(instance);
  console.log(`Final status: ${instance.getStatus()}`);
  console.log(`Outcome: ${instance.getEndEvents().map((end) => end.name).join(", ") || "—"}`);
  console.log(JSON.stringify(instance.getContext(), null, 2));

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});

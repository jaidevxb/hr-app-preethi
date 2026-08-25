import { createInterface } from "node:readline";
import { WorkflowInstance } from "./workflow/engine.js";
import { handlers } from "./workflow/handlers.js";
import { loadProcessLibrary } from "./workflow/loadProcessLibrary.node.js";
import { formatDuration } from "./workflow/simulationClock.js";
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

/**
 * Nothing is waiting on a person: the process is parked on message, signal or
 * timer events. Offer them as choices. Returns false when there's nothing at
 * all to do, which means the instance is stuck.
 */
async function handleWaitingState(
  instance: WorkflowInstance,
  setClock: (ms: number) => void
): Promise<boolean> {
  const events = instance.getPendingEvents();
  const timers = instance.getArmedTimers();
  if (events.length === 0 && timers.length === 0) return false;

  console.log("\n>> Nothing for a person to do — the process is waiting on events.");

  const choices: Array<{ label: string; run: () => void }> = [];
  for (const event of events) {
    choices.push({
      label:
        event.kind === "message"
          ? `Deliver message "${event.name}" (${event.nodeName})`
          : `Broadcast signal "${event.name}" (${event.nodeName})`,
      run: () =>
        event.kind === "message"
          ? void instance.deliverMessage(event.name)
          : void instance.broadcastSignal(event.name),
    });
  }
  for (const timer of timers) {
    choices.push({
      label: `Wait out "${timer.nodeName}" (${formatDuration(timer.remainingMs)} left)`,
      run: () => {
        setClock(timer.dueAt);
        instance.tick();
      },
    });
  }

  choices.forEach((choice, i) => console.log(`  ${i + 1}) ${choice.label}`));
  const answer = (await ask(`Pick one [1-${choices.length}]: `)).trim();
  (choices[Number(answer) - 1] ?? choices[0]).run();
  return true;
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

  // The CLI has no ticking clock, so simulated time only moves when the user
  // chooses to wait out a timer.
  let simTime = 0;
  const instance = new WorkflowInstance(definition, initialContext, handlers, () => simTime);
  instance.start();

  while (instance.getStatus() === "waiting") {
    const tasks = instance.getActiveTasks();

    if (tasks.length === 0) {
      const advanced = await handleWaitingState(instance, (ms) => (simTime = ms));
      if (advanced) continue;

      // Nothing for a person to do, no event to send, no timer to run out — a
      // join is waiting on a branch that can never arrive.
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

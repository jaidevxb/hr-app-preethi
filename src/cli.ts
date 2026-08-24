import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseBpmn } from "./workflow/bpmnParser.js";
import { WorkflowInstance } from "./workflow/engine.js";
import { handlers } from "./workflow/handlers.js";

// The web build imports the .bpmn through Vite's `?raw`; under plain Node we
// read the same file off disk. Either way the process comes from the XML.
const { definition } = parseBpmn(
  readFileSync(new URL("./workflow/leaveRequestWorkflow.bpmn", import.meta.url), "utf8")
);

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

async function main() {
  console.log("=== Leave Request Approval (BPMN demo) ===\n");

  const employeeName = (await ask("Employee name: ")) || "Employee";
  const days = (await ask("Number of days: ")) || "1";
  const reason = (await ask("Reason: ")) || "Personal";

  const instance = new WorkflowInstance(definition, { employeeName, days, reason }, handlers);
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

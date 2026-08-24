import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseBpmn } from "./workflow/bpmnParser.js";
import { WorkflowInstance } from "./workflow/engine.js";

// The web build imports the .bpmn through Vite's `?raw`; under plain Node we
// read the same file off disk. Either way the process comes from the XML.
const { definition: leaveRequestWorkflow } = parseBpmn(
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
    console.log(`[${entry.nodeName}] ${entry.message}`);
  }
  console.log("--------------------\n");
}

async function main() {
  console.log("=== Leave Request Approval (BPMN demo) ===\n");

  const employeeName = (await ask("Employee name: ")) || "Employee";
  const days = (await ask("Number of days: ")) || "1";
  const reason = (await ask("Reason: ")) || "Personal";

  const instance = new WorkflowInstance(leaveRequestWorkflow, {
    employeeName,
    days,
    reason,
  });
  instance.start();

  while (instance.getStatus() === "waitingOnTask") {
    const node = instance.getCurrentNode();
    if (node.type !== "userTask") break; // not reachable, but keeps TS happy

    console.log(`\n>> Current task: "${node.name}" (assignee: ${node.assignee})`);

    // A task that feeds an exclusive gateway is a decision — ask for one.
    // Anything else just needs acknowledging. Both facts come from the parsed
    // process rather than from hardcoded node ids.
    const nextNode = leaveRequestWorkflow.nodes[node.next];

    if (nextNode?.type === "exclusiveGateway") {
      const hasTimer = !!node.timer;
      const prompt = hasTimer
        ? "Decision — [a]pprove / [r]eject / [t]imer expires (escalate): "
        : "Decision — [a]pprove / [r]eject: ";
      const answer = ((await ask(prompt)) || "").trim().toLowerCase();

      if (hasTimer && answer.startsWith("t")) {
        instance.fireTimer();
        continue;
      }
      const decision = answer.startsWith("a") ? "approved" : "rejected";
      instance.completeTask({ decision });
      continue;
    }

    await ask(`Press Enter to complete "${node.name}"...`);
    instance.completeTask({});
  }

  printLog(instance);
  const outcome = instance.getContext();
  console.log(`Final status: ${instance.getStatus()}`);
  console.log(`Employee: ${employeeName}, Days: ${days}, Decision path recorded above.`);
  console.log(JSON.stringify(outcome, null, 2));

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});

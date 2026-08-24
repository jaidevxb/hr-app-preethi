import type { WorkflowContext } from "./types.js";

/**
 * A deliberately tiny stand-in for a real expression language (Camunda uses
 * JUEL, Zeebe uses FEEL). It understands exactly one shape:
 *
 *     <identifier> <operator> <literal>
 *
 * e.g. `decision == "approved"`, `days > 5`, `urgent != true`.
 *
 * That is enough for every gateway in this project, and keeping the grammar
 * this small means conditions can be evaluated without `eval` / `new Function`
 * — the process definition is data loaded at runtime, so letting it execute
 * arbitrary JS would be a genuine hole, not a theoretical one.
 */

const OPERATORS = ["==", "!=", ">=", "<=", ">", "<"] as const;
type Operator = (typeof OPERATORS)[number];

// Camunda wraps expressions as ${...}; strip that if present.
const WRAPPED = /^\$\{(.*)\}$/s;

export class ConditionExpressionError extends Error {}

export function parseCondition(source: string): (ctx: WorkflowContext) => boolean {
  const expression = source.trim().replace(WRAPPED, "$1").trim();

  // Longest operators first so ">=" isn't mistaken for ">".
  const operator = OPERATORS.find((op) => expression.includes(op));
  if (!operator) {
    throw new ConditionExpressionError(
      `Unsupported condition "${source}": expected <identifier> <${OPERATORS.join("|")}> <literal>`
    );
  }

  const index = expression.indexOf(operator);
  const variable = expression.slice(0, index).trim();
  const rawLiteral = expression.slice(index + operator.length).trim();

  if (!/^[A-Za-z_$][\w$]*$/.test(variable)) {
    throw new ConditionExpressionError(
      `Unsupported condition "${source}": left side must be a plain variable name, got "${variable}"`
    );
  }

  const literal = parseLiteral(rawLiteral, source);
  return (ctx: WorkflowContext) => compare(ctx[variable], operator, literal);
}

function parseLiteral(raw: string, source: string): unknown {
  if (/^"(.*)"$/s.test(raw) || /^'(.*)'$/s.test(raw)) return raw.slice(1, -1);
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw !== "" && Number.isFinite(Number(raw))) return Number(raw);

  throw new ConditionExpressionError(
    `Unsupported condition "${source}": right side must be a quoted string, number, boolean, or null — got "${raw}"`
  );
}

function compare(actual: unknown, operator: Operator, expected: unknown): boolean {
  switch (operator) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    default:
      break;
  }

  // Ordering comparisons only make sense on numbers. Context values arrive as
  // strings from form inputs, so coerce rather than silently returning false.
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;

  switch (operator) {
    case ">":
      return left > right;
    case "<":
      return left < right;
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
  }
}

/**
 * Validación E2E del contrato del parser Build bug context.
 * Ejecutar: node docs/n8n-build-bug-context-validation.js
 *
 * Usa la misma lógica que docs/n8n-build-bug-context.js (normalizeText, parseReproSections,
 * prioridad de campos, bug_query compacto 800-1200 chars).
 */

const DELIM = "\n\n<!--AZURE_V2-->\n";
const BUG_QUERY_MAX_CHARS = 1000;

function getToolText(payload) {
  if (payload?.result?.content?.[0]?.text) return payload.result.content[0].text;
  if (payload?.body?.result?.content?.[0]?.text) return payload.body.result.content[0].text;
  if (typeof payload === "string") return payload;
  return "";
}

function normalizeText(s) {
  if (s == null || typeof s !== "string") return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function parseReproSections(text) {
  const raw = String(text || "").trim();
  if (!raw) return { steps: "", actual: "", expected: "" };
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const sections = { steps: "", actual: "", expected: "" };
  const headerRe = /^\s*(Steps to Reproduce|Actual result(s)?|Expected result(s)?)\s*:?\s*$/im;
  let current = "steps";
  const lines = normalized.split("\n");
  let buffer = [];
  function flush() {
    const t = buffer.join("\n").trim();
    if (current === "steps") sections.steps = t;
    else if (current === "actual") sections.actual = t;
    else if (current === "expected") sections.expected = t;
    buffer = [];
  }
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      flush();
      const key = m[1].toLowerCase();
      if (key.includes("steps to reproduce")) current = "steps";
      else if (key.includes("actual")) current = "actual";
      else if (key.includes("expected")) current = "expected";
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

function parseAzureV2Envelope(text) {
  const idx = text.indexOf(DELIM);
  if (idx < 0) return null;
  const summaryText = text.slice(0, idx).trim();
  const jsonPart = text.slice(idx + DELIM.length).trim();
  try {
    const envelope = JSON.parse(jsonPart);
    envelope.summary_text = envelope.summary_text || summaryText;
    return envelope;
  } catch {
    return null;
  }
}

function parseLegacyTitle(summaryText, taskId) {
  const lines = String(summaryText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return `#${taskId}`;
  return lines[0].replace(/^#\d+\s*/, "").trim();
}

function summarizeSteps(steps) {
  const t = normalizeText(steps).slice(0, 200);
  if (t.length >= 200) return t + "...";
  return t;
}

function buildCompactBugQuery(taskId, title, expected, actual, reproSteps) {
  const parts = [
    `Bug ${taskId}`,
    title ? String(title).trim().slice(0, 120) : "",
    expected ? `Expected: ${normalizeText(expected).slice(0, 200)}` : "",
    actual ? `Actual: ${normalizeText(actual).slice(0, 200)}` : "",
    reproSteps ? `Steps: ${summarizeSteps(reproSteps)}` : "",
  ].filter(Boolean);
  let out = parts.join(" | ");
  if (out.length > BUG_QUERY_MAX_CHARS) out = out.slice(0, BUG_QUERY_MAX_CHARS - 3) + "...";
  return out;
}

function runParser(taskId, payload) {
  const rawText = getToolText(payload);
  const env = parseAzureV2Envelope(rawText);

  let title = "";
  let description = "";
  let expected = "";
  let actual = "";
  let repro = "";
  let summaryText = rawText;

  if (env?.error) {
    return {
      task_id: taskId,
      error: env.error.message || "Azure tool error",
      error_code: env.error.code || "AZURE_ERROR",
      bug_query: `Bug ${taskId}`,
      title: "",
      description: "",
      expected_behavior: "",
      actual_behavior: "",
      repro_steps: "",
      source: "azure_v2_error",
    };
  }

  if (env?.data) {
    const d = env.data;
    title = normalizeText(d.title ?? "");
    description = normalizeText(d.description_text ?? "");
    expected = normalizeText(d.expected_behavior_text ?? "");
    actual = normalizeText(d.actual_behavior_text ?? "");
    repro = normalizeText(d.repro_steps_text ?? "");
    summaryText = env.summary_text ?? rawText;
    if (!description && !expected && !actual && repro) {
      const sec = parseReproSections(repro);
      if (sec.steps) repro = sec.steps;
      if (sec.expected) expected = normalizeText(sec.expected);
      if (sec.actual) actual = normalizeText(sec.actual);
    }
  } else {
    title = parseLegacyTitle(rawText, taskId);
    const norm = normalizeText(rawText);
    const mDesc = norm.match(/Description\s*:\s*([\s\S]+?)(?=\s+Expected|\s+Actual|$)/i);
    const mExp = norm.match(/Expected\s*(?:Behavior|Result)s?\s*:?\s*([\s\S]+?)(?=\s+Actual|\s+Steps|$)/i);
    const mAct = norm.match(/Actual\s*(?:Behavior|Result)s?\s*:?\s*([\s\S]+?)(?=\s+Expected|\s+Steps|$)/i);
    description = mDesc ? normalizeText(mDesc[1]) : "";
    expected = mExp ? normalizeText(mExp[1]) : "";
    actual = mAct ? normalizeText(mAct[1]) : "";
    const sec = parseReproSections(rawText);
    if (sec.steps && !repro) repro = sec.steps;
    if (sec.expected && !expected) expected = normalizeText(sec.expected);
    if (sec.actual && !actual) actual = normalizeText(sec.actual);
  }

  const bugQuery = buildCompactBugQuery(taskId, title, expected, actual, repro);

  return {
    task_id: taskId,
    title,
    description,
    expected_behavior: expected,
    actual_behavior: actual,
    repro_steps: repro,
    bug_query: bugQuery,
    azure_summary_text: summaryText.slice(0, 80) + (summaryText.length > 80 ? "..." : ""),
    source: env?.data ? "azure_v2" : "legacy_fallback",
    meta: env?.meta ?? null,
  };
}

// --- Casos de prueba ---

const TASK_ID = 132551;

const caseAPayload = {
  result: {
    content: [
      {
        text:
          `#${TASK_ID} [Blue Ivory] Amount is not display correctly on invoice document\n` +
          `Type: Bug  State: In Progress\n` +
          `AssignedTo: Gustavo Grisales\n` +
          `Created: 2026-02-10T13:13:03.483Z  Changed: 2026-03-07T03:01:44.957Z\n` +
          `Area: Magaya Core Project\\Blue Ivory Team  Iteration: Magaya Core Project\\Blue Ivory Backlog\\2026\\Sprint 2026.05` +
          DELIM +
          JSON.stringify({
            summary_text: `#${TASK_ID} [Blue Ivory] Amount is not display correctly on invoice document\nType: Bug  State: In Progress\nAssignedTo: Gustavo Grisales\nCreated: 2026-02-10T13:13:03.483Z  Changed: 2026-03-07T03:01:44.957Z\nArea: Magaya Core Project\\Blue Ivory Team  Iteration: Magaya Core Project\\Blue Ivory Backlog\\2026\\Sprint 2026.05`,
            data: {
              id: TASK_ID,
              title: "[Blue Ivory] Amount is not display correctly on invoice document",
              description_text: "The invoice PDF shows wrong amount in the totals section.",
              expected_behavior_text: "Amount should match the order total.",
              actual_behavior_text: "Amount shows zero or incorrect value.",
              repro_steps_text: "1. Create order. 2. Generate invoice. 3. Open PDF.",
            },
            meta: { tool_version: "v2", elapsed_ms: 120, warnings: [] },
          }),
      },
    ],
  },
};

const caseBPayload = {
  result: {
    content: [
      {
        text:
          `#${TASK_ID} [Blue Ivory] Amount is not display correctly on invoice document\n` +
          `Type: Bug  State: In Progress\n` +
          `AssignedTo: Gustavo Grisales\n` +
          `Created: 2026-02-10T13:13:03.483Z  Changed: 2026-03-07T03:01:44.957Z\n` +
          `Area: Magaya Core Project\\Blue Ivory Team  Iteration: Magaya Core Project\\Blue Ivory Backlog\\2026\\Sprint 2026.05`,
      },
    ],
  },
};

// Caso B2: legacy con repro_steps por secciones (Steps to Reproduce / Actual result / Expected result)
const caseB2Payload = {
  result: {
    content: [
      {
        text:
          `#${TASK_ID} Bug con solo Repro Steps\n` +
          `Type: Bug  State: New\n\n` +
          `Steps to Reproduce:\n1. Open invoice. 2. Check total.\n\n` +
          `Actual result:\nAmount shows zero.\n\n` +
          `Expected result:\nAmount should show order total.`,
      },
    ],
  },
};

const caseCPayload = {
  result: {
    content: [
      {
        text:
          `Azure DevOps error: Azure DevOps HTTP 404 Not Found\n` +
          `URL: https://devops.magaya.com/.../_apis/wit/workitems/999999999` +
          DELIM +
          JSON.stringify({
            error: {
              code: "NOT_FOUND",
              message: "TF401232: Work item 999999999 does not exist, or you do not have permissions to read it.",
              details: {},
            },
            meta: { retryable: false },
          }),
      },
    ],
  },
};

const results = {
  "Caso A (envelope v2 válido)": runParser(TASK_ID, caseAPayload),
  "Caso B (legacy sin delimitador)": runParser(TASK_ID, caseBPayload),
  "Caso B2 (legacy con secciones en repro)": runParser(TASK_ID, caseB2Payload),
  "Caso C (envelope con error)": runParser(999999999, caseCPayload),
};

let failed = 0;

console.log("=== Validación E2E contrato parser Build bug context ===\n");

const a = results["Caso A (envelope v2 válido)"];
const aOk =
  a.source === "azure_v2" &&
  a.title === "[Blue Ivory] Amount is not display correctly on invoice document" &&
  a.description === "The invoice PDF shows wrong amount in the totals section." &&
  a.expected_behavior === "Amount should match the order total." &&
  a.actual_behavior === "Amount shows zero or incorrect value." &&
  a.bug_query.includes("Bug 132551") &&
  (a.bug_query.includes("Expected") || a.bug_query.includes("Amount")) &&
  a.bug_query.length <= BUG_QUERY_MAX_CHARS;
if (!aOk) failed++;
console.log("Caso A: envelope v2 válido");
console.log("  source: azure_v2 →", a.source, aOk ? "✓" : "✗");
console.log("  title, description, expected, actual:", a.title && a.description && a.expected_behavior && a.actual_behavior ? "✓" : "✗");
console.log("  bug_query compacto (≤" + BUG_QUERY_MAX_CHARS + " chars):", a.bug_query.length, a.bug_query.length <= BUG_QUERY_MAX_CHARS ? "✓" : "✗");
console.log("");

const b = results["Caso B (legacy sin delimitador)"];
const bOk = b.source === "legacy_fallback" && b.title && b.title.includes("Amount") && !b.error;
if (!bOk) failed++;
console.log("Caso B: legacy sin delimitador");
console.log("  source: legacy_fallback →", b.source, bOk ? "✓" : "✗");
console.log("  title:", b.title ? b.title.slice(0, 50) + "..." : "(vacío)", b.title ? "✓" : "✗");
console.log("");

const b2 = results["Caso B2 (legacy con secciones en repro)"];
const b2Ok =
  b2.source === "legacy_fallback" &&
  b2.expected_behavior && b2.expected_behavior.includes("order total") &&
  b2.actual_behavior && b2.actual_behavior.includes("zero") &&
  b2.repro_steps && b2.repro_steps.includes("Open invoice");
if (!b2Ok) failed++;
console.log("Caso B2: legacy con Steps/Actual/Expected en texto");
console.log("  source: legacy_fallback →", b2.source, b2Ok ? "✓" : "✗");
console.log("  expected extraído:", b2.expected_behavior ? b2.expected_behavior.slice(0, 40) + "..." : "(vacío)", b2.expected_behavior ? "✓" : "✗");
console.log("  actual extraído:", b2.actual_behavior ? b2.actual_behavior.slice(0, 30) + "..." : "(vacío)", b2.actual_behavior ? "✓" : "✗");
console.log("  repro_steps:", b2.repro_steps ? b2.repro_steps.slice(0, 40) + "..." : "(vacío)", b2.repro_steps ? "✓" : "✗");
console.log("");

const c = results["Caso C (envelope con error)"];
const cOk =
  c.source === "azure_v2_error" &&
  c.error_code === "NOT_FOUND" &&
  c.error && c.error.includes("999999999") &&
  c.bug_query === "Bug 999999999" &&
  !c.title && !c.description;
if (!cOk) failed++;
console.log("Caso C: envelope con error");
console.log("  source: azure_v2_error →", c.source, cOk ? "✓" : "✗");
console.log("  error_code:", c.error_code, c.error_code === "NOT_FOUND" ? "✓" : "✗");
console.log("");

console.log("=== Resumen ===");
console.log("Casos pasados:", 4 - failed, "/ 4");
process.exit(failed > 0 ? 1 : 0);

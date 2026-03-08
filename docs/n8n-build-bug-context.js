/**
 * Nodo Code en n8n: Build bug context (Azure v2 envelope + legacy fallback)
 *
 * Entrada:
 *   - $input.first().json = respuesta de tools/call (azure_get_work_item) con work_item_id = task_id
 *   - $node["Input task id"].json.task_id = task_id (número)
 *
 * Salida: un item con json:
 *   task_id, title, description, expected_behavior, actual_behavior, repro_steps,
 *   bug_query (compacto, máx 800-1200 chars), azure_summary_text, source, meta
 *   Si error: error, error_code, source = azure_v2_error
 *
 * Prioridad de campos: 1) description_text 2) expected_behavior_text 3) actual_behavior_text 4) repro_steps_text (fallback).
 * Si los 3 primeros vacíos, se extrae desde repro_steps_text por secciones (Steps to Reproduce, Actual result, Expected result).
 */

const DELIM = "\n\n<!--AZURE_V2-->\n";
const BUG_QUERY_MAX_CHARS = 1000;

function getToolText(payload) {
  if (payload?.result?.content?.[0]?.text) return payload.result.content[0].text;
  if (payload?.body?.result?.content?.[0]?.text) return payload.body.result.content[0].text;
  if (typeof payload === "string") return payload;
  return "";
}

/** Limpia HTML residual, saltos repetidos, espacios extras. */
function normalizeText(s) {
  if (s == null || typeof s !== "string") return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

/**
 * Parsea repro_steps_text por secciones.
 * Detecta: Steps to Reproduce, Actual result(s), Expected result(s).
 * Variantes: mayúsculas/minúsculas, "result:" / "results:".
 */
function parseReproSections(text) {
  const raw = String(text || "").trim();
  if (!raw) return { steps: "", actual: "", expected: "" };
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const sections = { steps: "", actual: "", expected: "" };
  // Headers case-insensitive; capture until next header or end
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
  flush(); // última sección
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

/** Resumen corto de pasos (primeras 2-3 líneas o ~150 chars). */
function summarizeSteps(steps) {
  const t = normalizeText(steps).slice(0, 200);
  if (t.length >= 200) return t + "...";
  return t;
}

/** bug_query compacto: id, title, expected, actual, pasos resumidos. Máx BUG_QUERY_MAX_CHARS. */
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

const item = $input.first();
const taskId = Number($node["Input task id"].json.task_id);
const rawText = getToolText(item.json);
const env = parseAzureV2Envelope(rawText);

let title = "";
let description = "";
let expected = "";
let actual = "";
let repro = "";
let summaryText = rawText;

if (env?.error) {
  return [{
    json: {
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
    },
  }];
}

if (env?.data) {
  const d = env.data;
  title = normalizeText(d.title ?? "");
  description = normalizeText(d.description_text ?? "");
  expected = normalizeText(d.expected_behavior_text ?? "");
  actual = normalizeText(d.actual_behavior_text ?? "");
  repro = normalizeText(d.repro_steps_text ?? "");
  summaryText = env.summary_text ?? rawText;
  // Prioridad: si los 3 primeros vacíos, extraer desde repro por secciones
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

return [{
  json: {
    task_id: taskId,
    title,
    description,
    expected_behavior: expected,
    actual_behavior: actual,
    repro_steps: repro,
    bug_query: bugQuery,
    azure_summary_text: summaryText,
    source: env?.data ? "azure_v2" : "legacy_fallback",
    meta: env?.meta ?? null,
  },
}];

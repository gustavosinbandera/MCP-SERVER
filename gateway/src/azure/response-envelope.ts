/**
 * Azure tools v2 response envelope and normalization.
 * - summary_text: human-readable short text (backward compatible).
 * - data: structured JSON for n8n/LLM.
 * - meta: tool_version, elapsed_ms, warnings, truncation.
 * Compatible with legacy clients: MCP content can be summary_text only (legacy) or summary + delimiter + JSON (v2).
 */

export const AZURE_V2_DELIMITER = '\n\n<!--AZURE_V2-->\n';

export type AzureMeta = {
  tool_version: string;
  elapsed_ms: number;
  warnings?: string[];
  truncated?: boolean;
  [k: string]: unknown;
};

export type AzureErrorCode =
  | 'AZURE_TIMEOUT'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'AZURE_ERROR';

export type AzureErrorEnvelope = {
  error: {
    code: AzureErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: { retryable: boolean; [k: string]: unknown };
};

export type AzureSuccessEnvelope<T = unknown> = {
  summary_text: string;
  data: T;
  meta: AzureMeta;
};

/** Strip HTML tags and decode common entities to plain text. */
export function htmlToPlainText(html: string | null | undefined): string | null {
  if (html == null || String(html).trim() === '') return null;
  let s = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return s.length === 0 ? null : s;
}

type IdentityLike = { displayName?: string; uniqueName?: string; id?: string; name?: string; [k: string]: unknown };

function formatIdentity(val: unknown): { display_name: string; unique_name: string | null } | null {
  if (val == null) return null;
  const o = val as IdentityLike;
  const display = o?.displayName ?? o?.name ?? (typeof o === 'string' ? o : '');
  const unique = o?.uniqueName ?? (typeof o === 'string' ? o : null);
  return { display_name: String(display || '').trim() || '?', unique_name: unique ? String(unique).trim() : null };
}

export type WorkItemCompact = {
  id: number;
  title: string | null;
  type: string | null;
  state: string | null;
  reason: string | null;
  assigned_to: { display_name: string; unique_name: string | null } | null;
  created_by: { display_name: string; unique_name: string | null } | null;
  changed_by: { display_name: string; unique_name: string | null } | null;
  created_date: string | null;
  changed_date: string | null;
  area_path: string | null;
  iteration_path: string | null;
  severity: string | null;
  priority: string | null;
  description_text: string | null;
  expected_behavior_text: string | null;
  actual_behavior_text: string | null;
  repro_steps_text: string | null;
};

const DESCRIPTION_KEYS = ['System.Description', 'Description'];
const REPRO_STEPS_KEYS = ['Microsoft.VSTS.TCM.ReproSteps', 'Repro Steps', 'System.ReproSteps'];
const EXPECTED_KEYS = ['Microsoft.VSTS.TCM.ExpectedResults', 'Expected Results', 'Custom.ExpectedBehavior'];
const ACTUAL_KEYS = ['Microsoft.VSTS.TCM.SystemInfo', 'Custom.ActualBehavior', 'Actual Behavior'];

function pickFirstRaw(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = fields[k];
    if (v == null) continue;
    const s = typeof v === 'string' ? v : String(v);
    const trimmed = s.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Map raw Azure work item to compact canonical shape (for n8n/LLM). */
export function workItemToCompact(wi: { id: number; fields?: Record<string, unknown> }): WorkItemCompact {
  const f = wi.fields || {};
  const getStr = (key: string): string | null => {
    const v = f[key];
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };
  const getDate = (key: string): string | null => {
    const v = f[key];
    if (v == null) return null;
    const s = String(v);
    return s.slice(0, 19) || s || null;
  };
  const descRaw = pickFirstRaw(f, DESCRIPTION_KEYS);
  const reproRaw = pickFirstRaw(f, REPRO_STEPS_KEYS);
  const expectedRaw = pickFirstRaw(f, EXPECTED_KEYS);
  const actualRaw = pickFirstRaw(f, ACTUAL_KEYS);
  return {
    id: wi.id,
    title: getStr('System.Title') ?? null,
    type: getStr('System.WorkItemType') ?? null,
    state: getStr('System.State') ?? null,
    reason: getStr('System.Reason') ?? null,
    assigned_to: formatIdentity(f['System.AssignedTo']) ?? null,
    created_by: formatIdentity(f['System.CreatedBy']) ?? null,
    changed_by: formatIdentity(f['System.ChangedBy']) ?? null,
    created_date: getDate('System.CreatedDate') ?? null,
    changed_date: getDate('System.ChangedDate') ?? null,
    area_path: getStr('System.AreaPath') ?? null,
    iteration_path: getStr('System.IterationPath') ?? null,
    severity: getStr('Microsoft.VSTS.Common.Severity') ?? getStr('System.Severity') ?? null,
    priority: getStr('Microsoft.VSTS.Common.Priority') ?? getStr('System.Priority') ?? null,
    description_text: descRaw ? htmlToPlainText(descRaw) : null,
    expected_behavior_text: expectedRaw ? htmlToPlainText(expectedRaw) : null,
    actual_behavior_text: actualRaw ? htmlToPlainText(actualRaw) : null,
    repro_steps_text: reproRaw ? htmlToPlainText(reproRaw) : null,
  };
}

/** Build human-readable summary for a single work item (get_work_item). */
export function workItemSummaryLines(compact: WorkItemCompact): string[] {
  const a = compact.assigned_to?.display_name ?? '?';
  return [
    `#${compact.id} ${compact.title ?? '(untitled)'}`,
    `Type: ${compact.type ?? '?'}  State: ${compact.state ?? '?'}`,
    `AssignedTo: ${a}`,
    `Created: ${compact.created_date ?? '?'}  Changed: ${compact.changed_date ?? '?'}`,
    `Area: ${compact.area_path ?? '?'}  Iteration: ${compact.iteration_path ?? '?'}`,
  ];
}

export type WorkItemListItem = {
  id: number;
  title: string | null;
  state: string | null;
  type: string | null;
  assigned_to: string | null;
  changed_date: string | null;
  created_date?: string | null;
};

export function workItemToListItem(wi: { id: number; fields?: Record<string, unknown> }): WorkItemListItem {
  const f = wi.fields || {};
  const assigned = (f['System.AssignedTo'] as IdentityLike)?.displayName ?? (f['System.AssignedTo'] as string) ?? null;
  const changed = f['System.ChangedDate'] != null ? String(f['System.ChangedDate']).slice(0, 10) : null;
  const created = f['System.CreatedDate'] != null ? String(f['System.CreatedDate']).slice(0, 10) : null;
  return {
    id: wi.id,
    title: (f['System.Title'] as string) ?? null,
    state: (f['System.State'] as string) ?? null,
    type: (f['System.WorkItemType'] as string) ?? null,
    assigned_to: assigned != null ? String(assigned).trim() : null,
    changed_date: changed,
    created_date: created ?? null,
  };
}

/** Relevant field names for updates (exclude noisy System.* when only_relevant_fields). */
const RELEVANT_UPDATE_FIELDS = new Set([
  'System.State',
  'System.Reason',
  'System.AssignedTo',
  'System.Title',
  'System.Description',
  'System.IterationPath',
  'System.AreaPath',
  'System.History',
  'Microsoft.VSTS.TCM.ReproSteps',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Common.Severity',
]);

export type WorkItemUpdateEvent = {
  rev: number;
  author: string;
  changed_at: string;
  change_type: 'field';
  field: string;
  old: unknown;
  new: unknown;
};

export type WorkItemUpdatesData = {
  work_item_id: number;
  events: WorkItemUpdateEvent[];
  summary_only: boolean;
};

export function normalizeUpdates(
  workItemId: number,
  updates: Array<{
    rev?: number;
    revisedBy?: IdentityLike | unknown;
    revisedDate?: string;
    fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
  }>,
  options: { summary_only?: boolean; only_relevant_fields?: boolean; include_comments?: boolean }
): WorkItemUpdateEvent[] {
  const onlyRelevant = options.only_relevant_fields !== false;
  const includeComments = options.include_comments !== false;
  const events: WorkItemUpdateEvent[] = [];
  for (const u of updates) {
    const by = u.revisedBy as IdentityLike | undefined;
    const author = by?.displayName ?? by?.uniqueName ?? '?';
    const changedAt = u.revisedDate ? String(u.revisedDate).slice(0, 19) : '?';
    const fields = u.fields || {};
    for (const [field, change] of Object.entries(fields)) {
      if (onlyRelevant && !RELEVANT_UPDATE_FIELDS.has(field)) continue;
      if (field === 'System.History' && !includeComments) continue;
      const oldV = (change as { oldValue?: unknown }).oldValue;
      const newV = (change as { newValue?: unknown }).newValue;
      events.push({
        rev: u.rev ?? 0,
        author: String(author).trim() || '?',
        changed_at: changedAt,
        change_type: 'field',
        field,
        old: oldV,
        new: newV,
      });
    }
  }
  return events;
}

/** Changelog-style summary (top N changes). */
export function updatesSummaryText(workItemId: number, events: WorkItemUpdateEvent[], top: number = 15): string {
  const lines: string[] = [`# Update history - Work Item #${workItemId}`, ''];
  const slice = events.slice(0, top);
  const byRev = new Map<number, WorkItemUpdateEvent[]>();
  for (const e of slice) {
    if (!byRev.has(e.rev)) byRev.set(e.rev, []);
    byRev.get(e.rev)!.push(e);
  }
  for (const [rev, revEvents] of byRev) {
    const first = revEvents[0];
    const by = first?.author ?? '?';
    const date = first?.changed_at ?? '?';
    lines.push(`## Rev ${rev} — ${by} — ${date}`);
    for (const e of revEvents) {
      const short = (v: unknown) =>
        v == null ? '(empty)' : String(v).length > 80 ? String(v).slice(0, 77) + '...' : String(v);
      lines.push(`  - ${e.field}: ${short(e.old)} → ${short(e.new)}`);
    }
    lines.push('');
  }
  if (events.length > top) lines.push(`... and ${events.length - top} more changes.`);
  return lines.join('\n').trim();
}

/** Build MCP content text: human-readable first, then optional v2 JSON (so legacy clients see summary only when displaying). */
export function formatMcpContent(envelope: AzureSuccessEnvelope<unknown>, useV2Envelope: boolean): string {
  if (!useV2Envelope) return envelope.summary_text;
  return envelope.summary_text + AZURE_V2_DELIMITER + JSON.stringify(envelope);
}

/** Build MCP content for errors: human message first, then optional error envelope JSON. */
export function formatMcpErrorContent(
  humanMessage: string,
  envelope: AzureErrorEnvelope,
  useV2Envelope: boolean
): string {
  if (!useV2Envelope) return humanMessage;
  return humanMessage + AZURE_V2_DELIMITER + JSON.stringify(envelope);
}

/** Parse content text: if it contains AZURE_V2_DELIMITER, return { summary_text, data, meta } or error. */
export function parseMcpContentText(text: string): AzureSuccessEnvelope<unknown> | AzureErrorEnvelope | null {
  const idx = text.indexOf(AZURE_V2_DELIMITER);
  if (idx === -1) return null;
  try {
    return JSON.parse(text.slice(idx + AZURE_V2_DELIMITER.length)) as AzureSuccessEnvelope<unknown> | AzureErrorEnvelope;
  } catch {
    return null;
  }
}

/** Classify error and build error envelope. */
export function toAzureErrorEnvelope(err: unknown): AzureErrorEnvelope {
  const msg = err instanceof Error ? err.message : String(err);
  let code: AzureErrorCode = 'AZURE_ERROR';
  let retryable = false;
  if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found')) code = 'NOT_FOUND';
  else if (msg.includes('401') || msg.includes('403') || msg.includes('PAT') || msg.includes('Auth')) code = 'AUTH_ERROR';
  else if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('timed out')) {
    code = 'AZURE_TIMEOUT';
    retryable = true;
  } else if (msg.includes('Invalid') || msg.includes('YYYY-MM-DD') || msg.includes('required')) code = 'VALIDATION_ERROR';
  return {
    error: { code, message: msg, details: {} },
    meta: { retryable },
  };
}

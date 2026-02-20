/**
 * Lightweight metrics exporter to InfluxDB v2 line protocol.
 * If env vars are missing or InfluxDB is unavailable, it degrades silently.
 */
import { warn } from './logger';

type MetricFields = Record<string, number | boolean | string>;
type MetricTags = Record<string, string>;

const INFLUXDB_URL = process.env.INFLUXDB_URL?.trim();
const INFLUXDB_ORG = process.env.INFLUXDB_ORG?.trim();
const INFLUXDB_BUCKET = process.env.INFLUXDB_BUCKET?.trim();
const INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN?.trim();

let warnedDisabled = false;
let warnedError = false;

function isEnabled(): boolean {
  return !!(INFLUXDB_URL && INFLUXDB_ORG && INFLUXDB_BUCKET);
}

function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/ /g, '\\ ').replace(/=/g, '\\=');
}

function fieldValue(value: number | boolean | string): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function toLine(measurement: string, tags: MetricTags, fields: MetricFields): string {
  const tagPairs = Object.entries(tags)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${esc(k)}=${esc(v)}`);
  const fieldPairs = Object.entries(fields)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${esc(k)}=${fieldValue(v)}`);
  const tagPart = tagPairs.length > 0 ? ',' + tagPairs.join(',') : '';
  return `${esc(measurement)}${tagPart} ${fieldPairs.join(',')}`;
}

async function writeMetric(measurement: string, tags: MetricTags, fields: MetricFields): Promise<void> {
  if (!isEnabled()) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      warn('Metrics disabled (set INFLUXDB_URL/INFLUXDB_ORG/INFLUXDB_BUCKET to enable)');
    }
    return;
  }
  const line = toLine(measurement, tags, fields);
  const url = `${INFLUXDB_URL}/api/v2/write?org=${encodeURIComponent(INFLUXDB_ORG!)}&bucket=${encodeURIComponent(INFLUXDB_BUCKET!)}&precision=s`;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (INFLUXDB_TOKEN) headers.Authorization = `Token ${INFLUXDB_TOKEN}`;
    const res = await fetch(url, { method: 'POST', headers, body: line });
    if (!res.ok && !warnedError) {
      warnedError = true;
      warn('Metrics write failed', { status: res.status, statusText: res.statusText });
    }
  } catch (err) {
    if (!warnedError) {
      warnedError = true;
      warn('Metrics write error', { err: err instanceof Error ? err.message : String(err) });
    }
  }
}

export function recordSearchMetric(input: {
  durationMs: number;
  limit: number;
  queryLength: number;
  resultCount: number;
}): void {
  void writeMetric(
    'search_requests',
    { service: 'gateway' },
    {
      duration_ms: input.durationMs,
      limit: input.limit,
      query_length: input.queryLength,
      result_count: input.resultCount,
    }
  );
}

export function recordIndexingEventMetric(input: {
  source: 'inbox' | 'shared' | 'url';
  indexed: number;
  inbox?: number;
  shared_new?: number;
  shared_reindexed?: number;
  url?: number;
}): void {
  void writeMetric(
    'indexing_events',
    { service: 'gateway', source: input.source },
    {
      indexed: input.indexed,
      inbox: input.inbox ?? 0,
      shared_new: input.shared_new ?? 0,
      shared_reindexed: input.shared_reindexed ?? 0,
      url: input.url ?? 0,
    }
  );
}

export function recordIndexingDailyMetric(input: {
  date: string;
  total: number;
  inbox: number;
  shared_new: number;
  shared_reindexed: number;
  url: number;
}): void {
  void writeMetric(
    'indexing_daily',
    { service: 'gateway', date: input.date },
    {
      total_today: input.total,
      inbox: input.inbox,
      shared_new: input.shared_new,
      shared_reindexed: input.shared_reindexed,
      url: input.url,
    }
  );
}

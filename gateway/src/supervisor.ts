/**
 * Supervisor: checks INDEX_INBOX_DIR and SHARED_DIRS every 2 minutes (or the configured interval),
 * and indexes into Qdrant. URLs (INDEX_URLS / INDEX_SITE) are not handled here: only on demand
 * via MCP tools index_url, index_url_with_links, index_site.
 *
 * Usage:
 *   node dist/supervisor.js           → loop every 2 minutes (inbox + shared)
 *   node dist/supervisor.js --once     → run one cycle and exit (on demand)
 */
import 'dotenv/config';
import { processInbox, getInboxPathOrNull, indexSharedDirs, indexUserKbRoots } from './inbox-indexer';
import { recordInbox, recordShared, getStatsByDay } from './indexing-stats';
import { info } from './logger';
import { recordIndexingDailyMetric, recordIndexingEventMetric } from './metrics';

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const POLL_INTERVAL_MS = Number(process.env.SUPERVISOR_INTERVAL_MS) ||
  Number(process.env.POLL_INTERVAL_MS) ||
  DEFAULT_INTERVAL_MS;
const RESTART_DELAY_MS = Number(process.env.RESTART_DELAY_MS) || 10000;

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ${msg}`);
}

export async function runCycle(): Promise<void> {
  let inboxIndexed = 0;
  const inboxPath = getInboxPathOrNull();
  if (inboxPath) {
    const result = await processInbox();
    if (result.indexed > 0) {
      recordInbox(result.indexed);
      inboxIndexed = result.indexed;
      recordIndexingEventMetric({ source: 'inbox', indexed: result.indexed, inbox: result.indexed });
    }
    if (result.indexed > 0 || result.processed > 0) {
      log(`Inbox ${result.inboxPath}: processed=${result.processed}, indexed=${result.indexed}`);
    }
    if (result.errors.length > 0) {
      result.errors.forEach((e: string) => log(`Error: ${e}`));
    }
  } else {
    log('INDEX_INBOX_DIR is not configured.');
  }

  const sharedResult = await indexSharedDirs();
  if (sharedResult.indexed > 0) {
    recordShared(sharedResult.newCount, sharedResult.reindexedCount);
    recordIndexingEventMetric({
      source: 'shared',
      indexed: sharedResult.indexed,
      shared_new: sharedResult.newCount,
      shared_reindexed: sharedResult.reindexedCount,
    });
  }
  if (sharedResult.indexed > 0 || sharedResult.errors.length > 0) {
    const parts = [`indexed=${sharedResult.indexed}`];
    if (sharedResult.newCount > 0) parts.push(`new=${sharedResult.newCount}`);
    if (sharedResult.reindexedCount > 0) parts.push(`reindexed=${sharedResult.reindexedCount}`);
    log(`SHARED_DIRS: ${parts.join(', ')}, errors=${sharedResult.errors.length}`);
    sharedResult.errors.forEach((e: string) => log(`  SHARED_DIRS: ${e}`));
  }

  const userKbResult = await indexUserKbRoots();
  if (userKbResult.indexed > 0 || userKbResult.errors.length > 0) {
    log(`USER_KB: indexed=${userKbResult.indexed}, errors=${userKbResult.errors.length}`);
    userKbResult.errors.forEach((e: string) => log(`  USER_KB: ${e}`));
  }

  if (inboxIndexed > 0 || sharedResult.indexed > 0 || userKbResult.indexed > 0) {
    const today = getStatsByDay(1);
    if (today.length > 0) {
      const t = today[0];
      info('indexing_daily', {
        date: t.date,
        total_today: t.total,
        inbox: t.inbox,
        shared_new: t.shared_new,
        shared_reindexed: t.shared_reindexed,
        url: t.url,
      });
      recordIndexingDailyMetric({
        date: t.date,
        total: t.total,
        inbox: t.inbox,
        shared_new: t.shared_new,
        shared_reindexed: t.shared_reindexed,
        url: t.url,
      });
    }
  }
}

function isRunOnceArg(arg: string): boolean {
  const a = arg.toLowerCase();
  return a === '--once' || a === 'run' || a === 'once';
}

async function main(): Promise<void> {
  const runOnce = process.argv.slice(2).some(isRunOnceArg);

  log('Supervisor started (inbox + SHARED_DIRS every ' + (POLL_INTERVAL_MS / 60000) + ' min). URLs are on-demand only (MCP: index_url, index_site).');
  log(`Interval: ${POLL_INTERVAL_MS} ms, RESTART_DELAY_MS=${RESTART_DELAY_MS}`);
  if (runOnce) {
    log('On-demand mode: one cycle then exit.');
  }

  if (runOnce) {
    await runCycle();
    log('On-demand cycle finished.');
    process.exit(0);
  }

  while (true) {
    try {
      await runCycle();
    } catch (err) {
      log(`Cycle failure: ${err instanceof Error ? err.message : String(err)}`);
      log(`Restarting in ${RESTART_DELAY_MS} ms...`);
      await new Promise((r) => setTimeout(r, RESTART_DELAY_MS));
      continue;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

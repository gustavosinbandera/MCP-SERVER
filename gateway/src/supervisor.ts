/**
 * Supervisor: revisa INDEX_INBOX_DIR y SHARED_DIRS cada 2 min (o el intervalo configurado),
 * indexa en Qdrant. Las URLs (INDEX_URLS / INDEX_SITE) no se tocan aquí: solo bajo demanda
 * con las herramientas MCP index_url, index_url_with_links, index_site.
 *
 * Uso:
 *   node dist/supervisor.js           → bucle cada 2 min (inbox + shared)
 *   node dist/supervisor.js --once     → un ciclo y termina (bajo demanda)
 */
import 'dotenv/config';
import { processInbox, getInboxPathOrNull, indexSharedDirs } from './inbox-indexer';
import { recordInbox, recordShared, getStatsByDay } from './indexing-stats';
import { info } from './logger';
import { recordIndexingDailyMetric, recordIndexingEventMetric } from './metrics';

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
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
      log(`Inbox ${result.inboxPath}: procesados=${result.processed}, indexados=${result.indexed}`);
    }
    if (result.errors.length > 0) {
      result.errors.forEach((e: string) => log(`Error: ${e}`));
    }
  } else {
    log('INDEX_INBOX_DIR no configurado.');
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
    const parts = [`indexados=${sharedResult.indexed}`];
    if (sharedResult.newCount > 0) parts.push(`nuevos=${sharedResult.newCount}`);
    if (sharedResult.reindexedCount > 0) parts.push(`reindexados=${sharedResult.reindexedCount}`);
    log(`SHARED_DIRS: ${parts.join(', ')}, errores=${sharedResult.errors.length}`);
    sharedResult.errors.forEach((e: string) => log(`  SHARED_DIRS: ${e}`));
  }

  if (inboxIndexed > 0 || sharedResult.indexed > 0) {
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

  log('Supervisor iniciado (inbox + SHARED_DIRS cada ' + (POLL_INTERVAL_MS / 60000) + ' min). URLs solo bajo demanda (MCP: index_url, index_site).');
  log(`Intervalo: ${POLL_INTERVAL_MS} ms, RESTART_DELAY_MS=${RESTART_DELAY_MS}`);
  if (runOnce) {
    log('Modo bajo demanda: un ciclo y salir.');
  }

  if (runOnce) {
    await runCycle();
    log('Ciclo bajo demanda terminado.');
    process.exit(0);
  }

  while (true) {
    try {
      await runCycle();
    } catch (err) {
      log(`Fallo del ciclo: ${err instanceof Error ? err.message : String(err)}`);
      log(`Reinicio en ${RESTART_DELAY_MS} ms...`);
      await new Promise((r) => setTimeout(r, RESTART_DELAY_MS));
      continue;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  log(`Error fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

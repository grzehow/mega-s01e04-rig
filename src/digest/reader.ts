import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, NightDigest, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  instant: number;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (
    typeof value !== 'object' || value === null || Array.isArray(value) ||
    !('at' in value) || typeof value.at !== 'string' ||
    !('job' in value) || typeof value.job !== 'string' ||
    !('status' in value) ||
    (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail') ||
    !('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')
  ) {
    return null;
  }

  const error = 'error' in value ? value.error : undefined;
  if (error !== undefined && typeof error !== 'string') return null;
  const instant = Date.parse(value.at);
  if (!Number.isFinite(instant)) return null;

  return {
    at: value.at,
    instant,
    job: value.job,
    status: value.status,
    owner: value.owner,
    error,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: NightDigest = {
    rows: [],
    malformedLines: 0,
    counts: { ok: 0, retry: 0, fail: 0 },
  };
  const events: RunEvent[] = [];
  for (const line of contents.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (event === null) {
      digest.malformedLines++;
    } else {
      events.push(event);
    }
  }

  // Stable sorting preserves file order for equal instants, including offset variants.
  events.sort((a, b) => a.instant - b.instant);
  const rows = new Map<string, DigestRow>();
  for (const event of events) {
    digest.counts[event.status]++;
    const row = rows.get(event.job);
    if (row === undefined) {
      rows.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstAt: event.at,
        lastAt: event.at,
      });
    } else {
      row.owner = event.owner;
      row.runs++;
      if (event.status === 'retry') row.retries++;
      row.lastStatus = event.status;
      row.lastError = event.error ?? row.lastError;
      row.lastAt = event.at;
    }
  }

  digest.rows = [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};

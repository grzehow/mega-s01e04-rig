export type DigestStatus = 'ok' | 'retry' | 'fail';

/** Counts of valid events, not counts of jobs by their final status. */
export type DigestCounts = {
  ok: number;
  retry: number;
  fail: number;
};

/** One job's valid events aggregated in chronological order. */
export type DigestRow = {
  job: string;
  /** Owner from the latest event; null owners are retained, not dropped. */
  owner: string | null;
  /** Total valid events for this job, including retry events. */
  runs: number;
  /** Number of this job's events whose status is retry. */
  retries: number;
  lastStatus: DigestStatus;
  /** Latest chronologically supplied error, retained across later success; null if none. */
  lastError: string | null;
  /** Earliest event instant, using its original timestamp string and offset. */
  firstAt: string;
  /** Latest event instant, using its original timestamp string and offset. */
  lastAt: string;
};

export type NightDigest = {
  /** One row per job, ascending by ordinal string comparison (not locale sorting). */
  rows: DigestRow[];
  /** Nonblank lines rejected as invalid JSON or invalid event data. */
  malformedLines: number;
  /** All valid events in the night; counts.ok + counts.retry + counts.fail = total runs. */
  counts: DigestCounts;
};

/**
 * Contract for the later runtime export in src/digest/reader.ts:
 *   export const readNight: ReadNight = (runsDir, night) => ...;
 * Import only types from this module; it does not export a runtime reader.
 *
 * Synchronously read runsDir/<night>.jsonl. A night must match YYYY-MM-DD;
 * an invalid night or absent file returns null. Other I/O errors propagate.
 * A present empty (or blank-only) file returns empty rows, zero malformedLines,
 * and zero counts, so callers can distinguish "nothing ran" from a missing night.
 *
 * Each nonblank line must contain an object with a parseable timestamp string
 * `at`, string `job`, status ok/retry/fail, owner string or null, and optional
 * string `error`. Invalid JSON or event data increments malformedLines and is
 * skipped without throwing; whitespace-only lines are ignored.
 *
 * Aggregate valid events by job. Order events by their timestamp instants, not
 * timestamp text or file position; file order breaks equal-instant ties.
 * firstAt/lastAt preserve the selected original strings (including offsets).
 * The latest event supplies owner and lastStatus; the latest event with an
 * error supplies lastError, even if a later event succeeds without an error.
 * Runs count all valid events, retries count retry events, and night-wide counts
 * count events of each status. Return rows sorted by ordinal job comparison.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;

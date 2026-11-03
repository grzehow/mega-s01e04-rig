import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const at = '2026-10-28T23:00:00+01:00';

function event(overrides: Record<string, unknown> = {}) {
  return { at, job: 'job', status: 'ok', owner: 'rook', ...overrides };
}

describe('readNight', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  function writeLines(lines: unknown[]) {
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
  }

  it('reads the unchanged reference night: five jobs and one malformed line', () => {
    expect(readNight('runs', night)).toEqual({
      malformedLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
          lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('uses chronological instants, preserves offsets, and retains the latest supplied error', () => {
    writeLines([
      event({ at: '2026-10-29T02:00:00+02:00', status: 'retry', error: 'newest error' }),
      event({ at: '2026-10-29T01:00:00+00:00', owner: null }),
      event({ at: '2026-10-29T01:30:00+03:00', status: 'fail', error: 'older error' }),
    ]);

    expect(readNight(runsDir, night)).toEqual({
      malformedLines: 0,
      counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{
        job: 'job', owner: null, runs: 3, retries: 1,
        lastStatus: 'ok', lastError: 'newest error',
        firstAt: '2026-10-29T01:30:00+03:00', lastAt: '2026-10-29T01:00:00+00:00',
      }],
    });
  });

  it('breaks equal-instant ties by file order, including supplied errors and null owners', () => {
    writeLines([
      event({ at: '2026-10-29T01:00:00+01:00', status: 'retry', error: 'first' }),
      event({ at: '2026-10-29T00:00:00Z', status: 'fail', error: 'last error' }),
      event({ at: '2026-10-29T02:00:00+02:00', owner: null }),
    ]);

    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1,
      lastStatus: 'ok', lastError: 'last error',
      firstAt: '2026-10-29T01:00:00+01:00', lastAt: '2026-10-29T02:00:00+02:00',
    }]);
  });

  it('sorts jobs ordinally and treats object-property names as ordinary jobs', () => {
    const jobs = ['z', 'a', '__proto__', 'Z', 'constructor', 'A'];
    writeLines(jobs.map((job) => event({ job })));

    const digest = readNight(runsDir, night);
    expect(digest?.rows.map((row) => row.job)).toEqual(['A', 'Z', '__proto__', 'a', 'constructor', 'z']);
    expect(digest?.counts).toEqual({ ok: 6, retry: 0, fail: 0 });
    expect(readNight(runsDir, night)).toEqual(digest);
  });

  it('retains empty string fields and errors allowed by the contract', () => {
    writeLines([event({ job: '', owner: '', error: '' }), event({ job: '', owner: null })]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: '', owner: null, runs: 2, retries: 0, lastStatus: 'ok', lastError: '',
      firstAt: at, lastAt: at,
    }]);
  });

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'text'],
    ['number', 42],
    ['boolean', true],
    ['empty object', {}],
    ['missing timestamp', { job: 'job', status: 'ok', owner: null }],
    ['missing job', { at, status: 'ok', owner: null }],
    ['missing status', { at, job: 'job', owner: null }],
    ['missing owner', { at, job: 'job', status: 'ok' }],
    ['numeric timestamp', event({ at: 0 })],
    ['unparseable timestamp', event({ at: 'not a date' })],
    ['numeric job', event({ job: 123 })],
    ['unknown status', event({ status: 'pending' })],
    ['numeric owner', event({ owner: 123 })],
    ['null error', event({ error: null })],
    ['numeric error', event({ error: 123 })],
  ])('counts invalid record shape: %s', (_name, invalid) => {
    writeLines([event(), invalid, event({ status: 'retry' })]);
    const digest = readNight(runsDir, night);
    expect(digest?.malformedLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].runs).toBe(2);
  });

  it('counts every malformed JSON line, ignores blank lines, and accepts CRLF records', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      '', ' \t', JSON.stringify(event()), '{broken', '{"at":', JSON.stringify(event({ owner: null })), '',
    ].join('\r\n'));
    const digest = readNight(runsDir, night);
    expect(digest?.malformedLines).toBe(2);
    expect(digest?.rows[0]).toMatchObject({ owner: null, runs: 2 });
    expect(digest?.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
  });

  it('returns a present digest even if every nonblank line is malformed', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '{broken\nnull\n');
    expect(readNight(runsDir, night)).toEqual({
      rows: [], malformedLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it.each(['', '\n \t\r\n'])('distinguishes present empty/blank files from missing files (%j)', (contents) => {
    expect(readNight(runsDir, night)).toBeNull();
    writeFileSync(join(runsDir, `${night}.jsonl`), contents);
    expect(readNight(runsDir, night)).toEqual({
      rows: [], malformedLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns null when the runs directory is absent', () => {
    expect(readNight(join(runsDir, 'missing'), night)).toBeNull();
  });

  it.each([
    '../2026-10-28', '..\\2026-10-28', '/2026-10-28', '2026-10-28/../2026-10-28',
    '2026-10-28.jsonl', '2026-1-28', '', '2026-10-28\n', '2026-10-28\0',
  ])('rejects invalid night input: %j', (invalidNight) => {
    writeLines([event()]);
    expect(readNight(runsDir, invalidNight)).toBeNull();
  });

  it('does not read an existing night through traversal or relative path segments', () => {
    writeLines([event()]);
    const nestedDir = join(runsDir, 'nested');
    mkdirSync(nestedDir);
    expect(readNight(nestedDir, `../${night}`)).toBeNull();
    expect(readNight(runsDir, `./${night}`)).toBeNull();
  });

  it('propagates other I/O errors instead of treating them as missing or malformed data', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrowError(expect.objectContaining({ code: 'EISDIR' }));
  });
});

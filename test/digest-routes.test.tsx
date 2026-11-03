import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { NightDigest } from '../src/digest/types.js';

const night = '2026-10-28';
const firstAt = '2026-10-28T21:00:00-04:00';
const lastAt = '2026-10-29T03:30:00+02:00';
const error = '<script>alert("failed")</script> & retry';
const job = 'alpha<&>';
const escapedJob = 'alpha&lt;&amp;&gt;';

const successfulDigest: NightDigest = {
  rows: [
    {
      job: 'Zeta', owner: 'Ada', runs: 1, retries: 0, lastStatus: 'ok',
      lastError: null, firstAt, lastAt: firstAt,
    },
    {
      job, owner: null, runs: 4, retries: 3, lastStatus: 'ok',
      lastError: error, firstAt, lastAt,
    },
    {
      job: 'beta', owner: 'Bo <ops> & co', runs: 1, retries: 0, lastStatus: 'fail',
      lastError: 'disk full', firstAt, lastAt: firstAt,
    },
  ],
  malformedLines: 0,
  counts: { ok: 2, retry: 3, fail: 1 },
};

// Locate a job's table row without depending on the number or ordering of cells.
function rowFor(html: string, escapedJobName: string): string {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const matches = rows.filter((row) => row.includes(`>${escapedJobName}</`));
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function hasWarning(row: string): boolean {
  const classes = /^<tr\b[^>]*\bclass="([^"]*)"/.exec(row)?.[1] ?? '';
  return classes.split(/\s+/).includes('warn');
}

describe('digest routes', () => {
  let runsDir: string;
  let config: RigConfig;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    config = {
      adapter: 'shim', installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60, runsDir,
    };
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  function writeNight(lines: unknown[]) {
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
  }

  function writeSuccessfulNight() {
    // Deliberately neither job-sorted nor chronological; the original offsets matter.
    writeNight([
      { at: lastAt, job, owner: null, status: 'ok' },
      { at: firstAt, job: 'beta', owner: 'Bo <ops> & co', status: 'fail', error: 'disk full' },
      { at: '2026-10-29T01:20:00+00:00', job, owner: 'old owner', status: 'retry', error },
      { at: firstAt, job: 'Zeta', owner: 'Ada', status: 'ok' },
      { at: firstAt, job, owner: 'old owner', status: 'retry' },
      { at: '2026-10-29T01:10:00+00:00', job, owner: 'old owner', status: 'retry' },
    ]);
  }

  it('serves HTML and the exact shared JSON digest with the same ordinal-sorted jobs', async () => {
    writeSuccessfulNight();
    const app = createApp(config);
    const htmlResponse = await app.request(`/digest/${night}`);
    const jsonResponse = await app.request(`/api/digest/${night}`);
    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    expect(await jsonResponse.json()).toEqual(successfulDigest);

    const html = await htmlResponse.text();
    expect(html.match(/<table\b/g)).toHaveLength(1);
    const rows = ['Zeta', escapedJob, 'beta'].map((name) => rowFor(html, name));
    const positions = rows.map((row) => html.indexOf(row));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).not.toMatch(/<script\b/i);
  });

  it('shows null owners, original timestamp offsets, escaped data, and retry/fail warnings', async () => {
    writeSuccessfulNight();
    const response = await createApp(config).request(`/digest/${night}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const retryRow = rowFor(html, escapedJob);
    expect(retryRow).toMatch(/<td\b[^>]*>\s*—\s*<\/td>/);
    expect(retryRow).toContain(firstAt);
    expect(retryRow).toContain(lastAt);
    expect(retryRow).toContain('&lt;script&gt;');
    expect(retryRow).toContain('&lt;/script&gt;');
    expect(retryRow).toContain('&amp; retry');
    expect(rowFor(html, 'beta')).toContain('Bo &lt;ops&gt; &amp; co');
    expect(html).not.toContain(error);
    expect(html).not.toContain(job);
    expect(hasWarning(retryRow)).toBe(true);
    expect(hasWarning(rowFor(html, 'beta'))).toBe(true);
    expect(hasWarning(rowFor(html, 'Zeta'))).toBe(false);
  });

  it.each(['/digest/', '/api/digest/'])('returns 404 for an absent night via %s', async (route) => {
    const response = await createApp(config).request(`${route}${night}`);
    expect(response.status).toBe(404);
  });

  it.each(['', ' \n\t\n'])('distinguishes an empty or blank-only night from a missing night (%j)', async (contents) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), contents);
    const app = createApp(config);
    const htmlResponse = await app.request(`/digest/${night}`);
    const jsonResponse = await app.request(`/api/digest/${night}`);
    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toMatch(/nothing ran/i);
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      rows: [], malformedLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    } satisfies NightDigest);
  });

  it('keeps valid jobs after malformed JSON and invalid events without counting blank lines', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      '{broken json',
      JSON.stringify({ at: firstAt, job: 'invalid', owner: null, status: 'unknown' }),
      '  ',
      JSON.stringify({ at: firstAt, job: 'survivor', owner: null, status: 'ok' }),
      '',
    ].join('\n'));
    const app = createApp(config);
    const htmlResponse = await app.request(`/digest/${night}`);
    const jsonResponse = await app.request(`/api/digest/${night}`);
    expect(htmlResponse.status).toBe(200);
    const html = await htmlResponse.text();
    expect(rowFor(html, 'survivor')).toContain('—');
    expect(html).not.toContain('>invalid<');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      rows: [{
        job: 'survivor', owner: null, runs: 1, retries: 0, lastStatus: 'ok',
        lastError: null, firstAt, lastAt: firstAt,
      }],
      malformedLines: 2,
      counts: { ok: 1, retry: 0, fail: 0 },
    } satisfies NightDigest);
  });
});

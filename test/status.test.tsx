import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readStatus } from '../src/status.js';
import { StatusBoard } from '../src/views/status.js';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok 10 / retry 4 / fail 1');
    expect(html).toContain('ok 7 / retry 0 / fail 0');
    expect(html.indexOf('/digest/2026-10-28')).toBeLessThan(html.indexOf('/digest/2026-10-27'));
  });

  it('keeps empty nights with zero counts and ignores unrelated files', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    try {
      writeFileSync(join(runsDir, '2026-10-30.jsonl'), '\n');
      writeFileSync(join(runsDir, 'notes.txt'), 'not a night');
      const status = readStatus({ ...config, runsDir });
      expect(status.nights).toEqual(['2026-10-30']);
      expect(status.nightCounts['2026-10-30']).toEqual({ ok: 0, retry: 0, fail: 0 });
      const res = await createApp({ ...config, runsDir }).request('/');
      expect(await res.text()).toContain('ok 0 / retry 0 / fail 0');
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  it('renders the existing empty message when the runs directory is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rig-status-'));
    try {
      const res = await createApp({ ...config, runsDir: join(root, 'missing') }).request('/');
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('nothing in runs/');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the link and shows missing counts when a night disappears', () => {
    const html = StatusBoard({ status: {
      adapter: 'shim', installed: config.installed, lastBeat: null,
      nights: ['2026-10-28'], nightCounts: { '2026-10-28': null },
    } }).toString();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok — / retry — / fail —');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});

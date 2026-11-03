import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { DigestRow, NightDigest } from '../src/digest/types.js';
import { Digest } from '../src/views/digest.js';
import { Layout } from '../src/views/layout.js';

const row: DigestRow = {
  job: 'alpha', owner: null, runs: 4, retries: 3, lastStatus: 'ok', lastError: null,
  firstAt: '2026-10-28T01:00:00+02:00', lastAt: '2026-10-28T02:00:00+02:00',
};

async function render(digest: NightDigest) {
  const app = new Hono();
  app.get('/', (c) => c.html(
    <Layout title="digest" lane={{ id: 'test', marker: null }}>
      <Digest night="2026-10-28" digest={digest} />
    </Layout>,
  ));
  return (await app.request('/')).text();
}

describe('digest view', () => {
  it('shows all fields, sorts jobs, marks retries and failures, and escapes log content', async () => {
    const html = await render({
      rows: [
        { ...row, job: 'zeta', owner: '<script>owner</script>', retries: 0, lastStatus: 'fail', lastError: '<img src=x>' },
        row,
        { ...row, job: 'beta', retries: 2 },
      ],
      malformedLines: 1,
      counts: { ok: 2, retry: 3, fail: 1 },
    });
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(html.indexOf('<td>alpha</td>')).toBeLessThan(html.indexOf('<td>beta</td>'));
    expect(html.indexOf('<td>beta</td>')).toBeLessThan(html.indexOf('<td>zeta</td>'));
    expect(html).toContain('<tr class="warn"><td>alpha</td><td>—</td><td>4</td><td>3</td><td>ok</td><td>—</td>');
    expect(html).toContain('<tr class="warn"><td>zeta</td>');
    expect(html).toContain('<tr><td>beta</td>');
    expect(html).toContain(row.firstAt);
    expect(html).toContain(row.lastAt);
    expect(html).toContain('malformed lines: 1');
    expect(html).toContain('&lt;script&gt;owner&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toMatch(/<script|<link|<img/);
    expect(html).toContain('<style>');
  });

  it('distinguishes an empty night and still reports malformed lines', async () => {
    const html = await render({ rows: [], malformedLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    expect(html).toContain('nothing ran');
    expect(html).toContain('malformed lines: 0');
    expect(html).not.toContain('<table>');
  });
});

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [source = 'http://127.0.0.1:8787/digest/2026-10-28', output = '.challenge/preview/index.html', ...extra] = process.argv.slice(2);

try {
  const url = new URL(source);
  if (extra.length || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.username || url.password || url.pathname !== '/digest/2026-10-28' || url.search || url.hash) {
    throw new Error('Expected http://127.0.0.1:<port>/digest/2026-10-28 and an optional output path.');
  }

  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  if (response.status !== 200) {
    throw new Error(`Expected HTTP 200; received ${response.status}.`);
  }
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/html') {
    throw new Error('Expected a text/html response.');
  }

  // Keep the server's bytes, including its banner; never parse or reserialize the HTML.
  const html = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log('Preview saved. Keep this file private until publication is approved.');
} catch (error) {
  console.error(`Preview export failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
}

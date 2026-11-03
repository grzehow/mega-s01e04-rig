import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const script = resolve('scripts/save-preview.mjs');
const servers: Server[] = [];
const directories: string[] = [];

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), 'rig-preview-'));
  directories.push(directory);
  return directory;
}

async function endpoint(status: number, contentType: string, body: Buffer) {
  const server = createServer((request, response) => {
    expect(request.url).toBe('/digest/2026-10-28');
    response.writeHead(status, { 'Content-Type': contentType, Location: 'https://example.invalid/' });
    response.end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  return `http://127.0.0.1:${address.port}/digest/2026-10-28`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('save-preview HTTP command', () => {
  it('saves exact bytes and the fake banner at the ignored default location without printing them', async () => {
    const body = Buffer.concat([
      Buffer.from('<!doctype html><style>body{color:black}</style><aside>FAKE-PREVIEW-ONLY</aside>'),
      Buffer.from([0xff, 0x0d, 0x0a]),
    ]);
    const url = await endpoint(200, 'text/html; charset=UTF-8', body);
    const cwd = await workspace();
    const result = await exec(process.execPath, [script, url], { cwd });
    expect(await readFile(join(cwd, '.challenge/preview/index.html'))).toEqual(body);
    expect(result.stdout + result.stderr).not.toContain('FAKE-PREVIEW-ONLY');
    expect(result.stdout + result.stderr).not.toContain('<');
  });

  it.each([
    [302, 'text/html'],
    [404, 'text/html'],
    [200, 'application/json'],
    [200, 'text/html-not-really'],
  ])('rejects status %s / %s without overwriting an existing preview', async (status, contentType) => {
    const url = await endpoint(status, contentType, Buffer.from('FAKE-REJECTED-BODY'));
    const cwd = await workspace();
    const output = join(cwd, 'index.html');
    await writeFile(output, 'existing copy');
    await expect(exec(process.execPath, [script, url, output], { cwd })).rejects.toMatchObject({ code: 1 });
    expect(await readFile(output, 'utf8')).toBe('existing copy');
  });

  it.each([
    'https://127.0.0.1/digest/2026-10-28',
    'http://example.invalid/digest/2026-10-28',
    'http://127.0.0.1.example.invalid/digest/2026-10-28',
    'http://user:password@127.0.0.1/digest/2026-10-28',
    'http://127.0.0.1/other',
    'http://127.0.0.1/digest/2026-10-28?query=value',
    'not-a-url',
  ])('rejects unsupported source %s without writing a file', async (url) => {
    const cwd = await workspace();
    await expect(exec(process.execPath, [script, url], { cwd })).rejects.toMatchObject({ code: 1 });
    await expect(stat(join(cwd, '.challenge/preview/index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

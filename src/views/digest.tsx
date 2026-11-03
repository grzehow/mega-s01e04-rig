import type { NightDigest } from '../digest/types.js';

export function Digest({ night, digest }: { night: string; digest: NightDigest }) {
  const rows = [...digest.rows].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);

  return (
    <>
      <h1>digest · {night}</h1>
      <p class={digest.malformedLines > 0 ? 'warn' : 'mute'}>
        malformed lines: {digest.malformedLines}
      </p>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">job</th>
              <th scope="col">owner</th>
              <th scope="col">runs</th>
              <th scope="col">retries</th>
              <th scope="col">last status</th>
              <th scope="col">last error</th>
              <th scope="col">first at</th>
              <th scope="col">last at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr class={row.retries >= 3 || row.lastStatus === 'fail' ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

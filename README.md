# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

## Local review copy

With rig running (bound only to `127.0.0.1`), save the server-rendered digest:

```sh
pnpm save-preview
# For a different local PORT or output path:
pnpm save-preview http://127.0.0.1:8787/digest/2026-10-28 .challenge/preview/index.html
```

The dependency-free Node command fetches only that digest path over HTTP from
`127.0.0.1`, requires HTTP 200 and `text/html`, and does not follow redirects.
It saves the response bytes unchanged as one self-contained HTML file, including
the existing lane banner and inline stylesheet; it does not print the HTML or marker.
The default `.challenge/preview/index.html` is git-ignored. Keep custom output paths
under `.challenge/` too: never commit previews, markers, or credentials.

This command only prepares a local copy. Publication to an owned, overwriteable
public HTTPS host and reviewer submission require separate approval; issue #6
stays open until the link is actually submitted. After review, restart rig with
`LANE_MARKER` unset, export again, and (after approval) overwrite the same public
link so the banner reads "no marker set" (ADR 0003).

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

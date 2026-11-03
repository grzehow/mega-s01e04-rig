---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-11-03
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

| Issue | Source section | Dependencies | Worker (harness · model · effort) |
|-------|----------------|--------------|-----------------------------------|
| [#1 Run log reader](https://github.com/grzehow/mega-s01e04-rig/issues/1) | §1 | None; types-only commit unblocks §2 | pi · openai/gpt-6.1-sol · high |
| [#2 Digest HTML page](https://github.com/grzehow/mega-s01e04-rig/issues/2) | §2a | #1 types for implementation; reader for verification | pi · openai/gpt-6.1-sol · medium |
| [#3 Digest JSON endpoint](https://github.com/grzehow/mega-s01e04-rig/issues/3) | §2b | #1 types for implementation; reader and #2 for parity verification | pi · openai/gpt-6.1-sol · low |
| [#4 Status board digest links](https://github.com/grzehow/mega-s01e04-rig/issues/4) | §2c | #1 types for implementation; reader and #2 for verification | pi · openai/gpt-6.1-sol · low |
| [#5 Digest route tests](https://github.com/grzehow/mega-s01e04-rig/issues/5) | §2d | #1 types for authoring; #2 and #3 for final verification | pi · openai/gpt-6.1-sol · medium |
| [#6 Public review preview](https://github.com/grzehow/mega-s01e04-rig/issues/6) | §3 | #1–#5 and separate human publication approval | pi · openai/gpt-6.1-sol · medium |
| [#7 Preview cleanup and plan archive](https://github.com/grzehow/mega-s01e04-rig/issues/7) | §4 | #6 review received and separate human cleanup approval | pi · openai/gpt-6.1-sol · low |

Worker details for #1–#6 come from their GitHub closing records; #7 records the archive
worker. GitHub is the source of issue state.

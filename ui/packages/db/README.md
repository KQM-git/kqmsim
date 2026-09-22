# KQM Sim Database

Production: https://db.kqm.gg

This app serves a public copy of the simulation database with KQM branding.
The Cloudflare Worker serves the site, D1 stores searchable simulation records,
and the private R2 bucket stores result JSON and game images. The Worker reads
the bucket through its binding; the bucket does not need a public URL.

## Resources

- Cloudflare account: KQM (`c102bcadcefa0897a01701fd28bed543`).
- Worker, D1 database, and R2 bucket: `kqm-sim-database`.
- D1 ID: `ecbe003b-158b-4b47-90d6-83f596eb4179`.
- Domain: `db.kqm.gg`.
- Source branch: `codex/kqm-db` in `KQM-git/kqmsim`.

The schemas were applied in the Cloudflare D1 console from
`migrations/0001_database.sql` and `migrations/0002_submissions.sql`, and recorded
in `d1_migrations`.
The existing KQM Sim and Compendium services use separate resources.

## Data updates

The Worker imports public metadata from `simpact.app/api/db`. Each record keeps
its original ID, author, tags, configuration, and result share key. Results are
copied from the immutable `gcsim.app/api/share/<share_key>` URL to R2. Subsequent
requests use R2. Images are also stored in R2 on first access.

A scheduled trigger runs every five minutes. It imports up to 500 records per
call and resumes from the saved cursor. After a complete import, it waits at
least 24 hours before starting another import. Failed requests retain the
previous records and cursor. Entries removed from the source are hidden only
after a complete import; their records remain in D1.

Approved KQM submissions and replaced entries have `source='local'`. The public
source import cannot overwrite or hide these records.

This deployment supports public browsing, filters, sorting, configuration copy,
and result charts. It does not run the upstream Discord submission/review bots,
MQTT queues, or simulation compute workers. Users can run configurations at
https://sim.kqm.gg/simulator.

## Submissions and reviews

- `/submit` is public. A contributor provides a completed KQM or gcsim result
  link, display name, and description. The Worker validates the saved result,
  stores an immutable copy in R2, and creates a pending D1 record.
- `/submission/<id>` is an unlisted receipt. Anyone with this link can read the
  submission, result, and review note. The public database does not list pending
  or rejected submissions. Contributors must keep the receipt link.
- `/review` requires the reviewer username and password. The page sends HTTP
  Basic Auth to every review API request. Credentials stay in page memory, not
  cookies or browser storage. Sign out, reload, or leave the review flow to clear
  access. Result and comparison links open in new tabs to retain the review.
- Reviewers can check characters, gear, DPS, and saved results; compare published
  entries with the same team; then approve, reject, or replace an entry. Reject
  and replace require a note. Each action has a confirmation dialog.
- Approval adds the saved simulation to the public database. Replacement retains
  the existing viewer ID and tags. The previous entry is retained in
  `submissions.previous_document`. Rejection retains the submission and note.
  Decisions are atomic: a second reviewer cannot overwrite a completed review.
- The queue can import an existing `taghelper.simpact.app/id/<id>` link. Import
  keeps the author, description, and completed result. It does not change the
  original Discord queue. The upstream public API does not list pending entries,
  so import them by link.

This flow accepts completed results. It does not rerun configurations or validate
game assumptions. Reviewers must inspect the saved result before approval.
No Discord bot is required for new submissions.

Set `REVIEW_USER` and `REVIEW_PASSWORD` as Cloudflare Worker secrets. Use a strong,
random password. The sign-in form accepts ASCII credentials. Do not put these
values in `wrangler.jsonc`, source files, or deployment logs. Add separate test
credentials to the ignored `.dev.vars` file for local review checks.

The Worker limits submission and failed sign-in requests to 10 per IP per minute
at each Cloudflare location. It accepts only known KQM/gcsim result hosts, rejects
redirects, and limits result files to 8 MB. Write requests require the site's own
Origin and JSON content type. Review APIs have no public CORS access, and review
responses are not cached.

## Public card endpoint

Use `GET https://db.kqm.gg/api/db?q=<URL-encoded JSON>` to display simulation
cards on another site. The response is `{ "data": [Entry, ...] }`, with the same
entry format as the original database. No API key is required. This endpoint
allows public browser reads through CORS. It does not accept writes.

The original **Shared by others** component requests data once when the page
loads. It selects each record with a 2% probability, sorts that sample by newest
first, then returns up to three records. It does not poll on a timer.

```js
const query = {
  query: { $sampleRate: 0.02 },
  limit: 3,
  skip: 0,
  sort: { create_date: -1 },
};
const response = await fetch(
  `https://db.kqm.gg/api/db?q=${encodeURIComponent(JSON.stringify(query))}`,
);
if (!response.ok) throw new Error("Could not load simulation cards.");
const { data: entries } = await response.json();
```

For the three latest records, use `query: {}` instead. The random sample can
contain fewer records than the limit. Supported sample rates are 0 through 1.

Use these entry fields and URLs in the cards:

| Card value | Field or URL |
| --- | --- |
| Viewer link | `https://db.kqm.gg/db/${encodeURIComponent(entry._id)}` |
| Title | `entry.description` |
| Author | `entry.submitter` |
| Characters and gear | `entry.summary.team` |
| Character image | `https://db.kqm.gg/api/assets/avatar/${character.name}.png` |
| DPS per target | `entry.summary.mean_dps_per_target` |
| Mode | `entry.summary.mode` |
| View all | `https://db.kqm.gg/database` |

## Local use and deployment

Use the repository's pinned Node, pnpm, and Wrangler versions. From `ui`:

```sh
pnpm install --frozen-lockfile --filter '@gcsim/db...'
pnpm --filter @gcsim/db build
cd packages/db
pnpm exec wrangler d1 migrations apply kqm-sim-database --local
pnpm run dev:worker
```

Store a random `SYNC_TOKEN` in `.dev.vars` for local use. Set the same value as a
Worker secret for the environment that the import script will use. Never commit
this file or the token. The public API cannot start source imports or publish
records; public writes only create pending submissions.

```sh
node scripts/sync-public.mjs http://localhost:8787
node scripts/sync-public.mjs https://db.kqm.gg
node scripts/sync-public.mjs https://db.kqm.gg --warm
```

The `--warm` command copies all result files in small batches. It saves a local
checkpoint under `.wrangler` and can resume after interruption. New result files
are also copied when a user first opens them.

For deployment, use credentials for the KQM account. This machine has unrelated
Cloudflare environment credentials, so deployment must clear those overrides:

```sh
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID pnpm exec wrangler deploy
```

`GET /api/status` reports the visible record count and the last complete import.
Cloudflare Worker logs report import and storage failures.

## Checks

From `ui`:

```sh
pnpm --filter @gcsim/db typecheck
pnpm --filter @gcsim/db test:worker
pnpm --filter @gcsim/db build
pnpm --filter @gcsim/e2e exec playwright test --config playwright.db.config.ts
```

Keep the repository license and source notices. The site footer links to this
deployment's source branch.

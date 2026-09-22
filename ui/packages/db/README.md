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

The first schema was applied in the Cloudflare D1 console from
`migrations/0001_database.sql` and recorded in `d1_migrations`.
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

This deployment supports public browsing, filters, sorting, configuration copy,
and result charts. It does not run the upstream Discord submission/review bots,
MQTT queues, or simulation compute workers. Users can run configurations at
https://sim.kqm.gg/simulator.

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
this file or the token. The public API cannot start imports or write records.

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

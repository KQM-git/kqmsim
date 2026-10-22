# Review interface check — 17 October 2026

## Scope and coverage

Scope: reviewer sign-in, the review queue, a submission review, and decision
dialogs. This includes loading, error, empty, and narrow layouts.
Public submission and simulation result pages were outside this interface check.

The app uses React, Wouter, Tailwind 4, Gauge components, and KQM color tokens.
The check used the project README, `CLAUDE.md`, `CONTRIBUTING.md`, and
`docs/adr/0001-design-system-migration.md`. The user supplied the working
instructions. There was no repository `AGENTS.md` file.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | `src/Pages/Review.tsx`, keyboard navigation, dialog focus, labels, Browser accessibility tree | Route focus corrected; checked paths pass |
| Layout | `packages/tailwind.css`, `src/index.css`, live missing margins, production bundle tests at 320 pixels | Missing spacing corrected; controls fit |
| Writing | Queue labels, loading messages, empty search, error retry, decision confirmations | Clear; each empty or error state gives a next action |
| Typography | Computed heading sizes, field size, number alignment, wrapping, text at 200% size | Heading hierarchy corrected; text fits |
| Colors | Computed field colors, KQM tokens, measured text and border pairs | Form border contrast corrected |
| UI polish | Existing panels, buttons, hover rules, focus styles, native dialog, reduced-motion rules | Clear in the inspected flow |

## Findings and corrections

All findings below are corrected.

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Colors | `src/index.css:69` | Input boundary `#66576e` against `#423745`: 1.69:1 | Review boundary `#97869f`: 3.34:1 | The boundary now passes the 3:1 requirement in WCAG 1.4.11 |
| MEDIUM | Layout | `../tailwind.css:18`; queue and review in `src/Pages/Review.tsx` | The shared style build did not scan `kqmdb`. Review section and heading margins computed to zero | Add the KQM database source to the shared build | One fix restores the spacing utilities throughout these pages |
| MEDIUM | Layout | `src/Pages/Review.tsx:138`; `worker/submissions.mjs:552` | Status was the only queue control; dates always ran oldest first | Search all matching records, select date order, then paginate | Reviewers can find a submission without going through every page |
| MEDIUM | Accessibility | `src/Pages/Review.tsx:39` | Client navigation did not move focus to the new review | Focus the new heading; keep filters when returning to the queue | Keyboard users can continue from the new page |
| MEDIUM | Typography | `src/index.css:69` | Some section headings were 15 pixels beside 16-pixel body text | Use 18-pixel subsection headings and relative text sizes in reviews | Headings and body text have a clear order and scale with text size |

## Verification

Passed from `ui`:

- `pnpm --filter @gcsim/kqmdb typecheck`.
- `pnpm --filter @gcsim/kqmdb test:worker`: 21 tests. Search tests cover the full
  queue, both date orders, pagination, status, spaces in character names,
  punctuation, and invalid input.
- `pnpm --filter @gcsim/kqmdb build`.
- `pnpm --filter @gcsim/e2e exec playwright test --config playwright.kqmdb.config.ts`:
  3 tests against the production bundle. These cover filter retention, empty
  results, retry, 320-pixel layout, 200% text size, required review notes, Escape,
  and focus return. Review decisions use test data.
- Biome checks for the changed JavaScript and TypeScript files.
- Wrangler deployment dry run with the existing KQM bindings.

Browser checks: sign in, search for a spaced character name, open a review,
inspect the saved team and decision panel. No console errors were observed.

Measured contrast ratios: input text 10.61:1, secondary text 8.78:1, primary
button text 8.99:1, rejection text 5.51:1, and focus ring 6.29:1 against the
control surface. The review input font is 16 pixels at the default text size.

The production bundle checks confirm a 32-pixel gap before the import panel,
a 40-pixel gap before matching teams, and a 20-pixel gap before rejection help.

Not verified: a full screen-reader speech test, RTL translation, and native
browser zoom. The 200% test changes the root text size; it is not browser zoom.

## Verdict

Approve for the inspected scope. No HIGH findings remain. All six domains were
reviewed. The verification limits above still apply.

## Simulation deletion — 23 October 2026

Scope: the protected simulation management page, its deletion confirmation,
and its loading, error, conflict, and deleted states. The existing KQM tokens,
native dialog, buttons, and review layout are reused. Other pages were not
part of this additional interface check.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | `src/Pages/ManageSimulation.tsx`; dialog name, Cancel focus, Escape, focus after deletion, required note | Pass in the browser and focused UI test |
| Layout | Management page and dialog at 320 pixels and with 200% text | Controls remain available; no horizontal overflow |
| Writing | Reason, confirmation, record ID, conflict reload, removed-state message | The action and its effect are explicit |
| Typography | Existing review heading and body tokens; long reason and ID wrapping | Consistent with the review flow |
| Colors | Existing KQM text, focus, form-border, and destructive-button tokens; browser screenshot | No new color values introduced |
| UI polish | Existing panels and buttons; native dialog; busy and disabled states | Reused without new animation |

Findings: no unresolved issue in the inspected flow. The delete action requires
a reason and a separate confirmation. The confirmation identifies the team and
record. Conflicting edits block deletion and provide a reload action.

Verification: typecheck; 23 Worker tests; four UI tests, including a deletion
test with confirmation, conflict recovery, Escape, and narrow and enlarged
text; production build; deployment dry run. Browser testing against the local
Worker and local D1 completed an actual deletion of a disposable test record.
Public list, metadata, and result API checks confirmed the removal. The archive
import SQL was also executed against a local database to check that it cannot
restore a deleted record.

Verdict: approve for this flow. A full screen-reader speech test and native
browser zoom were not run. The 200% check changes the root text size.

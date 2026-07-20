# Build Week submission checklist

This separates repository evidence from actions that require GitHub, Appwrite, a recorder, Devpost, or the Build Week `/feedback` flow. Do not mark an external gate complete from source code alone.

## Repository

- [x] Make `receipt/` the actual Git repository root before publishing.
- [ ] Review the complete diff and confirm only intended product files are included.
- [x] Confirm `README.md` gives setup, run, sample, architecture, security, and verification paths.
- [x] Confirm `LICENSE` is MIT and names Artur Ferreira Cruz, 2026.
- [x] Enable GitHub private vulnerability reporting and link it from `docs/SECURITY.md`.
- [x] Search the current tree before the first commit for `.env` files, Azure/Appwrite keys, raw proposal links, client data, local paths, and generated logs; repeat against Git history before submission.
- [ ] Create the public repository and verify it while signed out.
- [ ] Public repository URL: https://github.com/arturict/receipt (created; verify content after the first push)
- [ ] Confirm GitHub Actions discovers `.github/workflows/ci.yml` and the Node 22 job passes.
- [ ] Pin or protect the submission revision as appropriate.

## Local verification

- [x] Frontend lint, 26 tests, and production build passed on 20 July 2026.
- [x] Function type-check and 18 tests passed on 20 July 2026.
- [x] `npm audit` reported 0 vulnerabilities in `apps/web` on 20 July 2026.
- [x] `npm audit` reported 0 vulnerabilities in `functions/scope-api` on 20 July 2026.
- [x] Re-run on supported Node `22.13.0` immediately before the initial public revision:

```bash
npm ci --prefix apps/web
npm ci --prefix functions/scope-api
npm run verify
npm audit --prefix apps/web
npm audit --prefix functions/scope-api
```

The checked tests are a dated local snapshot. They do not cover live permissions, deployment, or browser behavior.

## Appwrite and Azure — external gates

- [x] Confirm the production project is `receipt-buildweek` at the FRA endpoint.
- [x] Confirm the current `receipt-web` and `scope-api` deployments are active.
- [x] Confirm only the production hostname, `localhost`, and `127.0.0.1` are Appwrite Web platforms.
- [x] Confirm anonymous auth, function execute access, row scopes, and table permissions match the manifests.
- [x] Set `AZURE_AI_ENDPOINT` and `AZURE_AI_API_KEY` only as server-side function variables.
- [x] Confirm the deployment is `gpt-5.4-mini`, the completion cap is 2,000, the evidence bound is 24 items, and API version is `2024-10-21`.
- [ ] Preserve the 20 July 2026 function log and AI receipt for the measured sample: 2.36 seconds, 314 prompt tokens, and 315 completion tokens; label it as a sample result rather than a general benchmark.
- [x] Confirm the live defaults are user/hour 3, project/month 20, and global/month 100.
- [ ] Exercise a limit/conflict path and confirm the three-counter transaction does not leave a partial quota reservation.
- [ ] Add an independent Azure quota or cost alert.
- [x] With anonymous session A, create and read a room; with session B, verify it cannot read A's owner state or request row.
- [x] Exercise a live Azure comparison and confirm Azure source, non-empty evidence, AI receipt path, and bounded smoke output.
- [ ] Force or simulate Azure failure and confirm the manual-review fallback.
- [ ] Leave or simulate a request in `analyzing`, confirm recovery is blocked before 45 seconds, then confirm manual recovery preserves the complete request after the lease.
- [x] Verify a fresh proposal link, a rotated old link, an expired disposable link, an idempotent repeated decision, and a conflicting opposite decision.
- [ ] Confirm the client-facing projection contains no owner ID, token hash, AI budgets, or unrelated project data.
- [ ] Review Appwrite/Azure logging, retention, deletion, and data-processing settings.
- [x] Verify HTTPS, HSTS, `X-Content-Type-Options`, restrictive CSP meta policy, no-referrer policy, and the application frame guard. Response-header CSP remains required before real client data.
- [x] Live app URL: https://6a5e2a17001ae35f5c10.appwrite.network/

## Demo video — external gate

- [ ] Follow `docs/DEMO_SCRIPT.md` with fictional data and a disposable link.
- [ ] Keep the final cut under three minutes.
- [ ] Include audible narration that explains both Codex and GPT-5.6's contribution.
- [ ] Explicitly distinguish runtime Azure `gpt-5.4-mini` from build-time Codex/GPT-5.6 assistance.
- [ ] Show Appwrite in the product flow, not only on a slide.
- [ ] Check text legibility and audio on a second device.
- [ ] Confirm no credentials, personal data, notifications, or reusable capability URL are visible.
- [ ] Confirm all video visuals, music, and other material are original or properly licensed, with no unauthorized third-party marks.
- [ ] Upload to YouTube with visibility set to **Public**, then verify playback while signed out.
- [ ] Demo video URL: **TODO**

## Devpost and feedback — external gates

- [ ] Copy `docs/DEVPOST.md` into the submission form and remove all creator notes and TODOs.
- [ ] Confirm every claim against the public revision and live app.
- [ ] Add the public repository, live app, and video links.
- [x] Choose and record the eligible Build Week track: **Work and Productivity**.
- [ ] Select only technologies and challenge categories actually used.
- [ ] Run the required `/feedback` flow from the primary task that performed the majority of the core build work.
- [ ] Paste the exact returned session ID here and into Devpost; never invent one.
- [ ] Build Week feedback session ID: **TODO**
- [ ] Verify the session ID format and submission field once more.
- [ ] Preview the submission while signed out and test every link.
- [ ] Submit before the deadline and save the confirmation URL or screenshot.
- [ ] Devpost URL: **TODO**

## Final honesty pass

- [ ] No placeholder remains in the submitted README, Devpost entry, or video description.
- [ ] No metric lacks a date and either retained evidence or a reproducible method.
- [ ] No statement turns anonymous sessions into verified identity.
- [ ] No statement calls a bearer link private without explaining possession-based access.
- [ ] No statement claims AI decides price, date, or the final classification.
- [ ] No source-only check is presented as proof of live deployment state.

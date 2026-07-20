# Receipt

> Every small change gets a clear answer and a receipt.

Receipt is a scope decision room for small agencies. It places an accepted scope beside a new client request, drafts a comparison with exact citations, lets the operator correct it, and turns the result into an expiring client decision link.

The model can classify work. It cannot set the price or delivery date. Those stay with a person.

## Submission links

- Live fictional-data demo: [receipt on Appwrite Sites](https://6a5e2a17001ae35f5c10.appwrite.network/)
- Source: [github.com/arturict/receipt](https://github.com/arturict/receipt)

The public build uses isolated anonymous workspaces for evaluation. Do not enter real client material: access is not recoverable after browser data is cleared, and Azure processes text during a live comparison.

## From request to receipt

1. Record the accepted baseline and the incoming request in one scope room.
2. Ask Azure `gpt-5.4-mini` for an `included`, `additional`, or `unclear` draft.
3. Verify every request quote and scope excerpt against the submitted source text on the server.
4. Require the operator to edit or confirm the draft—including its exact excerpts and evidence items—and save a human review.
5. Only after that review, let the operator set the fee, currency, delivery date, note, and link lifetime.
6. Give the client an expiring capability link to accept or decline; record the decision in the audit timeline.

If Azure is unavailable or returns invalid evidence, Receipt keeps the request usable and produces an explicit manual-review fallback.

## System at a glance

| Layer | Role |
| --- | --- |
| React 19 + Vite | Operator workspace and client decision view |
| Appwrite Account | Isolated anonymous demo sessions |
| Appwrite Functions | Node 22 API and the only application write path |
| Appwrite TablesDB | Projects, scope versions, requests, audit events, AI receipts, and budget counters |
| Appwrite Realtime | Refreshes the operator workspace when rows change |
| Azure OpenAI | Grounded scope-comparison draft using `gpt-5.4-mini` |

The checked-in Appwrite configuration targets the FRA endpoint and project `receipt-buildweek`. See [Architecture](docs/ARCHITECTURE.md) for the request and data flows, and [Security](docs/SECURITY.md) before using real client material.

### Bounded model route

The runtime route uses `gpt-5.4-mini` for one grounded comparison. Production requests cap completion at 2,000 tokens and the server accepts at most 24 evidence items. Invalid, ungrounded, or truncated output falls back to complete manual segmentation instead of becoming a proposal.

## How Codex contributed

Codex with GPT-5.6 was used as a build-time engineering partner—not as the runtime model. It helped turn the product constraints into concrete React and Appwrite changes, inspect the full data path, challenge authorization and failure cases, and run the repository verification. The most consequential decisions from that loop are visible in code: server-checked citations, a required human-review timestamp, locked analysis after publication, atomic state/audit/AI-receipt writes, hash-only capability tokens, and all-or-nothing AI budget reservations.

The author remained responsible for the product premise, constraints, model-routing decision, and final review. Receipt's runtime comparison uses the bounded Azure `gpt-5.4-mini` route above.

## Run the sample

### Prerequisites

- Node.js `22.13.0` (the version in `.nvmrc`; Node 23+ is intentionally outside the declared engine range)
- npm
- A reachable Appwrite deployment with the current tables and `scope-api` function
- The local origin added as an Appwrite Web platform when running against your own project

Install each locked package tree, then start the web app:

```bash
npm ci --prefix apps/web
npm ci --prefix functions/scope-api
npm run dev --prefix apps/web
```

Open the URL printed by Vite. The frontend defaults to these public identifiers:

```text
endpoint: https://fra.cloud.appwrite.io/v1
project:  receipt-buildweek
function: scope-api
database: receipt
```

To target another deployment, copy `apps/web/.env.example` to `apps/web/.env.local` and change only the public Appwrite identifiers. The checked-in Content Security Policy intentionally permits the FRA endpoint only; update both Appwrite origins in `apps/web/index.html` before building for another region or a self-hosted endpoint. Never put an API key in a `VITE_` variable.

### Walkthrough

1. Keep the prefilled **Northstar Coffee** case unchanged and select **Open scope room**.
2. Inspect the verified sample comparison: booking and extra revision rounds are additional work; the launch target is cited from the baseline.
3. Change a classification or question and select **Save human review**.
4. Enter a fee and future delivery date, choose a link lifetime, and select **Publish proposal**.
5. Copy the new link once, open it in another browser context, and record an accept or decline decision.
6. Return to the operator workspace and inspect the Realtime-backed audit timeline.

The unchanged Northstar case uses a deterministic cited comparison so the sample remains demonstrable without spending an AI request. **Compare again** exercises the live Azure `gpt-5.4-mini` path and its configured budgets.

## Reproduce the backend

The declarative Appwrite resources live in `appwrite.config.json` and `appwrite/`. For a separate deployment:

1. Create an Appwrite project in the intended region and update the project, organization, and public IDs for that deployment.
2. Sign in with the Appwrite CLI using `appwrite login`.
3. Review the resource definitions, then run `appwrite push all` from the repository root.
4. Add the deployed site and local development hosts as Appwrite Web platforms.
5. Configure the following **server-side function variables** in Appwrite:

```text
AZURE_AI_ENDPOINT=https://your-azure-endpoint.example
AZURE_AI_API_KEY=secret
AZURE_AI_DEPLOYMENT=gpt-5.4-mini
AZURE_AI_API_VERSION=2024-10-21
AZURE_AI_USER_HOURLY_LIMIT=3
AZURE_AI_PROJECT_MONTHLY_LIMIT=20
AZURE_AI_MONTHLY_REQUEST_LIMIT=100
APPWRITE_DATABASE_ID=receipt
```

`AZURE_AI_ENDPOINT` and `AZURE_AI_API_KEY` are required for live analysis. The other Azure values shown are the application defaults. Appwrite supplies the function execution context; do not copy its execution key into frontend configuration or source control.

## Verify

```bash
npm run verify
npm audit --prefix apps/web
npm audit --prefix functions/scope-api
# Uses the deployed backend, creates disposable fictional rows, and spends one AI request:
npm run smoke:live --prefix functions/scope-api
```

`verify` runs frontend linting, 26 frontend tests, the production web build, function type-checking, and 18 function tests. The verified snapshot on 20 July 2026 is 44 passing tests and zero vulnerabilities reported by both npm audits. The live smoke additionally verifies Azure analysis, two-session tenant isolation, row permissions, human review, zero-fee proposals, token rotation, post-publication locks, decision idempotency, manual fallback, and audit attribution against the active Appwrite project. These checks are not a penetration test.

CI repeats the locked installs and root verification on Node 22, then builds and checks the function's configured `dist/main.js` entrypoint. Live Appwrite permissions, deployments, and Azure behavior still require the smoke tests in the [submission checklist](docs/SUBMISSION_CHECKLIST.md).

## Build Week notes

- [Devpost draft](docs/DEVPOST.md)
- [Under-three-minute demo script](docs/DEMO_SCRIPT.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Contributor guidance](AGENTS.md)

## License

MIT © 2026 Artur Ferreira Cruz. See [LICENSE](LICENSE).

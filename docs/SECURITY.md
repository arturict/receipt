# Security model

Receipt handles contract-like text and bearer proposal links. The public Build Week deployment is a fictional-data demo, not a client portal. Keep secrets server-side, disclose external AI processing, and do not confuse a demo identity with verified identity.

## Trust boundaries

### Operator sessions

The operator workspace uses Appwrite anonymous sessions. Rows are isolated by Appwrite user ID and owner read permissions, and the function repeats ownership checks before sensitive operations.

Anonymous sessions are not named accounts. This repository provides no recovery, cross-device access, organization membership, or durable identity proof. Clearing browser state may remove access to that workspace. A new anonymous identity can also bypass per-user demo friction, so the global AI counter remains the hard cost ceiling.

The product UI therefore tells evaluators to use fictional data only. Verified operator accounts, deletion/export, retention automation, and additional abuse controls are required before real client use.

### Client proposal links

A proposal URL is a bearer capability. Anyone with a live link can read its public projection and submit one accept or decline decision; Receipt does not verify the client's identity.

New links contain a 256-bit random token in the URL fragment. The server stores only a SHA-256 hash, enforces a 1–168-hour expiry, and returns responses with `cache-control: no-store`. Rotation replaces the stored hash and invalidates the prior link.

The fragment keeps the token out of the site's initial HTTP request, but it still exists in browser history and the clipboard, and the SPA sends it in the function request body. Browser extensions, same-origin scripts, a compromised device, or platform-level telemetry may expose it. Do not send capability links through untrusted channels. Legacy `?share=` links are scrubbed by the SPA, but the query may already have reached hosting logs; generate a new fragment link instead.

The public projection includes the project and client labels, accepted scope, incoming request, reviewed analysis, proposal terms, and final decision. Do not put material in a proposal that the link holder should not see.

## AI boundary

Azure receives the accepted scope and incoming request. Use Receipt only when that processing is permitted by the relevant client agreement, privacy notice, data-location requirements, and Azure configuration.

The application reduces model risk in four ways:

- source documents are framed as untrusted evidence, not instructions;
- the model must return bounded structured JSON;
- the server rejects request quotes and baseline excerpts that are not present in the submitted text;
- price and delivery date are absent from the AI schema and remain human inputs;
- the server requires a saved human review before proposal publication and locks analysis after publication or a final decision.

These controls establish provenance, not truth. A cited classification or rationale can still be wrong. The operator must review it. If Azure fails or returns invalid evidence, the system produces an explicit low-confidence manual-review draft.

## Authorization and storage

- TablesDB row security is enabled for every table; table-level permissions are empty.
- Project, scope, request, event, and AI-run rows receive an owner read permission.
- AI-budget rows have no browser permissions.
- Application writes use the function's scoped Appwrite execution key.
- Owner state responses remove `ownerUserId` and `shareTokenHash`.
- Public actions look up only the hash of the presented token and return a bounded projection.
- Case creation, analysis records, proposals, and final decisions pair state changes with audit events in Appwrite transactions.

## Secrets and logging

Required Azure credentials belong in Appwrite function variables:

```text
AZURE_AI_ENDPOINT
AZURE_AI_API_KEY
```

Do not place credentials in `VITE_` variables. The repository ignores local `.env` files and Appwrite's local state, while the function deployment excludes `.env`. Before publishing, inspect the full Git history as well as the current tree.

Application logs record bounded operational fields such as status, model, latency, token counts, and error type. The code does not intentionally log source documents, request bodies, raw capability tokens, or credentials. Appwrite function logging is enabled; confirm the platform's execution-log and retention behavior for the target environment rather than assuming request bodies are never retained.

## Budget controls

AI requests are counted with atomic TablesDB increments at three scopes:

- per anonymous user per UTC hour (default 3);
- per project per UTC month (default 20);
- globally per UTC month (default 100).

All three increments commit in one Appwrite transaction. A limit failure rolls back the complete reservation, and transaction conflicts receive exponential backoff with jitter and at most five attempts, preventing partial quota consumption. The counters limit request count, not exact spend. User and project limits are abuse friction because new anonymous sessions or projects can be created. The global monthly limit is the final application-level ceiling; Azure-side quotas and alerts should provide an independent ceiling.

## Operational checklist

Before a public deployment:

- allow only intended Web platform hostnames in Appwrite and keep the frontend CSP `connect-src` aligned with the selected Appwrite region;
- keep function execution restricted to Appwrite users and preserve the minimal row scopes;
- set Azure credentials and conservative budgets server-side;
- verify row permissions with two unrelated anonymous sessions;
- verify an expired link, a rotated link, and a repeated final decision;
- check Appwrite and Azure log/retention settings;
- add appropriate site security headers, including a tested Content Security Policy;
- define data deletion and retention procedures;
- rotate disposable demo links after recording.

The public Appwrite Site has been checked for HTTPS, HSTS, and `X-Content-Type-Options`; the frontend uses a restrictive CSP meta policy, a no-referrer policy, and refuses to render inside a frame. Response-header CSP and a formal penetration test remain deployment work. The Node 22 live smoke verifies two-session isolation and direct row permissions but is not a substitute for continuous authorization tests. No retention mechanism is implemented.

## Reporting a vulnerability

Do not include client data, tokens, or credentials in a public issue. Use [GitHub private vulnerability reporting](https://github.com/arturict/receipt/security/advisories/new), including the affected version, reproduction steps, impact, and a safe proof of concept. Private reporting is enabled on the repository.

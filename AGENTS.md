# Receipt contributor guide

These instructions apply to the entire repository.

## Product contract

Receipt turns an accepted scope and a later request into a reviewable, cited change record. Preserve these invariants:

- AI output is a draft. A person owns the final classification, price, delivery date, note, and client proposal.
- Every `requestQuote` must occur in the request. Every non-null `sourceExcerpt` must occur in the accepted baseline. An `included` item requires a baseline excerpt.
- Scope and request text are untrusted evidence, never model instructions.
- Azure failure must leave a useful manual-review path; it must not silently manufacture a confident result.
- A proposal requires a persisted `reviewedAt` from an operator save. Normal analysis changes may start only from `ready`, `review`, or retryable `error`; an expired `analyzing` state may move only through the 45-second manual-recovery path. Lock analysis after proposal publication and after either final decision.
- The measured runtime route is Azure `gpt-5.4-mini` with a 2,000-token completion cap, sized for the 24-item evidence bound. Do not change the model, cap, or evidence bound without remeasuring latency, structured-output reliability, grounding, completeness, and cost in the Appwrite execution path.
- Browser code must never receive Appwrite execution keys or Azure credentials.
- Operator data is scoped to the Appwrite user ID and read permissions. Check ownership again in the function before sensitive reads or writes.
- New proposal links use a 256-bit random token in the URL fragment. Store only its SHA-256 hash, enforce expiry, and return only the minimum public projection.
- Treat anyone holding a live proposal link as authorized to read and respond. Do not describe it as identity-verified.
- AI request counters for user/hour, project/month, and global/month must commit in one Appwrite transaction, with bounded conflict retry and no partial quota consumption. Defaults are 3, 20, and 100 respectively; the global counter is the hard cost ceiling.
- Multi-row state transitions and their audit events belong in Appwrite transactions.

## Repository map

- `apps/web/` — React/Vite operator and client UI
- `functions/scope-api/` — Node 22 Appwrite Function
- `appwrite/` and `appwrite.config.json` — declarative cloud resources
- `docs/` — architecture, security, demo, and submission material
- `.github/workflows/ci.yml` — deterministic pull-request verification

Read `docs/ARCHITECTURE.md` and `docs/SECURITY.md` before changing authentication, storage, AI, links, or public projections.

## Development

Use Node `22.13.0` from `.nvmrc`.

```bash
npm ci --prefix apps/web
npm ci --prefix functions/scope-api
npm run verify
```

Run the relevant focused tests while iterating, then run the root verification before handoff. If dependencies change, update the corresponding nested lockfile. If test counts change, update any time-stamped count in the public docs.

Keep frontend variables public and prefixed with `VITE_`. Keep Azure and Appwrite execution credentials in server-side function variables. Never commit `.env` files, tokens, proposal URLs, customer material, or execution logs containing sensitive data.

## Change discipline

- Prefer small changes that keep the API schema and TypeScript types aligned.
- Add a regression test for authorization, validation, state-transition, token, or citation changes.
- Keep logs structured and free of source text, request bodies, capability tokens, and secrets.
- Do not weaken the manual fallback to make an AI demo look successful.
- Do not claim that a deployment, audit, public repository, demo link, or `/feedback` session exists unless it was verified in the current task.
- Do not commit, push, deploy, publish, submit, rotate live credentials, or change Appwrite resources unless the user explicitly authorizes that action.

## Definition of done

A code change is ready only when the relevant focused tests pass, `npm run verify` passes on supported Node 22, documentation still matches behavior, and any live-service limitation is called out instead of inferred away.

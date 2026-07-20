# Receipt web

Receipt is a scope-control room for agencies. It keeps the accepted baseline beside an incoming client request, groups exact cited excerpts into included, additional, and unclear work, and turns the reviewed comparison into a client capability link.

## Runtime

- React 19 + TypeScript + Vite
- Appwrite Web SDK with anonymous sessions
- `scope-api` Appwrite Function for every mutation and public read
- TablesDB Realtime channels for workspace refreshes
- No client-side API keys and no fake persistence

The checked-in defaults target:

```text
https://fra.cloud.appwrite.io/v1
project: receipt-buildweek
function: scope-api
database: receipt
```

Copy `.env.example` only when a deployment needs different public IDs. Secrets do not belong in Vite variables.

## Run

Use the repository-supported Node version, then:

```bash
npm ci
npm run dev
```

The first visit creates an isolated anonymous Appwrite session. The Northstar content is an editable deterministic prefill; it reaches Appwrite only after **Open scope room** is pressed.

Client links use `#share=<64 lowercase hex characters>`. URL fragments are not sent in the HTTP request, which reduces accidental server-side access logging; the bearer token is still visible to anyone holding the link and may remain in browser history. Legacy query links are accepted once and immediately scrubbed with `history.replaceState`. Receipt stores only the token hash after returning the raw link to the operator, so rotating a proposal creates a new capability.

## Verify

```bash
npm run verify
```

This runs Oxlint, 26 focused domain/execution tests, TypeScript, and the production Vite build.

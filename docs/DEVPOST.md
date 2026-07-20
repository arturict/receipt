# Devpost draft

Replace every **TODO** and confirm the Codex paragraph against the actual build history before submitting. The copy below intentionally contains no invented users, revenue, performance numbers, deployment status, or feedback session ID.

## Project name

Receipt

## Tagline

Every small change gets a clear answer and a receipt.

## Links

- Try it: https://6a5e2a17001ae35f5c10.appwrite.network/ (fictional demo data only)
- Source: https://github.com/arturict/receipt
- Demo: **TODO — public YouTube URL, under three minutes with audible narration**
- Build Week feedback session ID: **TODO — paste the real ID returned by `/feedback` in the primary build task**

## Build Week track

Work and Productivity

## Inspiration

The dangerous agency request is often the one that sounds harmless: “Can we add one small thing before Friday?” The original promise is in one document, the new request is in another conversation, and the commercial decision gets made from memory.

Receipt makes that boundary visible. It keeps the accepted words beside the new words, asks AI for a cited draft, and leaves the consequential decisions with a person.

## What it does

An operator opens a scope room with an accepted baseline and a client request. Receipt groups the request into work that is already included, additional, or unclear. Each item shows the exact client wording and, when available, the exact accepted-scope excerpt behind the classification.

The operator can correct classifications and exact excerpts, add or remove evidence items, and save a human-reviewed record. The server revalidates grounding on save. Only then do they add the commercial terms: fee, currency, delivery date, note, and link lifetime. Receipt creates an expiring client link where the client can inspect the evidence and accept or decline. The result returns to the operator's audit timeline through Appwrite Realtime.

When the model is unavailable or its evidence fails validation, Receipt does not pretend. It creates a low-confidence manual-review draft so the workflow can continue honestly.

## How we built it

The frontend is React 19, TypeScript, and Vite, deployed as an Appwrite Site. Appwrite anonymous sessions isolate fictional demo workspaces without collecting sign-up details. The UI warns that access is not recoverable and disallows real client data. The browser invokes one Node 22 Appwrite Function for state and mutations, while TablesDB stores projects, scope versions, requests, audit events, AI usage receipts, and budget counters. Realtime change notifications trigger a fresh owner-scoped state read.

The function sends the accepted scope and request to an Azure deployment of `gpt-5.4-mini`. The model returns structured JSON with classifications, rationale, confidence, and citations. Zod bounds the shape, then server code verifies that every quote exists in the original request or baseline. The analysis, audit event, and AI usage receipt commit together. The model schema has no price or delivery fields.

The server requires a saved human review before it will create a proposal. Once a proposal is published—or a client has made a final decision—the comparison is locked.

Proposal links use 32 random bytes in a URL fragment. Only a SHA-256 hash is stored, access expires, and rotation invalidates the previous token. Appwrite transactions keep important state changes and audit events together. The user/hour, project/month, and global/month AI counters are reserved together in one transaction with bounded conflict retry, so a failed limit does not consume only part of the quota.

## How we used Appwrite

- **Account:** anonymous demo sessions with per-user ownership
- **Functions:** the Node 22 trust boundary and Azure integration
- **TablesDB:** six row-secured tables for workflow state, audit records, and AI controls
- **Transactions:** case creation, reviewed analysis, proposals, and final decisions
- **Realtime:** workspace refreshes after row changes
- **Sites:** active static React deployment on the FRA project
- **Configuration as code:** project settings, site, function, tables, columns, and indexes live in the repository

## How we used OpenAI and Codex

Azure `gpt-5.4-mini` handles one narrow runtime job: draft a grounded comparison between accepted scope and incoming request. Deterministic server validation and enforced human review surround that call.

Codex with GPT-5.6 was my build-time engineering partner. I supplied the product premise and constraints; Codex helped implement and review the React/Appwrite path, including citation validation, server-enforced human review, transactional proposal and decision guards, all-or-nothing AI budgets, and repository verification. I made the product and routing decisions and reviewed the result. GPT-5.6 is not the runtime model—the product analysis path uses Azure `gpt-5.4-mini`.

## Challenges

### Grounding a generative answer

Prompting for citations was not enough. Receipt validates exact normalized excerpts after the model responds and rejects the entire analysis if evidence cannot be traced to the submitted text.

### Bounding the runtime path

The Azure route is deliberately narrow. `gpt-5.4-mini` receives only the accepted baseline and incoming request, the response is capped at 2,000 completion tokens, and the server accepts at most 24 evidence items. Invalid, ungrounded, or truncated output falls back to complete manual segmentation instead of becoming a proposal.

### Sharing without publishing a secret

The client needs a link without a sign-up or named account; the app creates an anonymous Appwrite session behind the scenes. Receipt uses an expiring bearer capability, keeps new tokens in the URL fragment, stores only the hash, and exposes a limited proposal projection. The UI is explicit that anyone holding the link can respond.

### Failing usefully

An AI timeout should not erase a real request. The fallback preserves the complete request in up to 24 bounded, exact segments for manual comparison, records the failed automation, and keeps the operator in control. If an execution is stranded in `analyzing`, a 45-second lease enables the same manual recovery without another AI call.

### Bounding a public demo

Anonymous sessions are convenient but renewable. Receipt combines defaults of 3 requests per user/hour and 20 per project/month with a 100-request global monthly ceiling. All three counters commit together in an Appwrite transaction, with bounded retry for conflicts, avoiding both race-prone read-then-write limits and partial reservations.

## What we are proud of

- Exact-citation validation is enforced in server code, not only promised in a prompt.
- AI cannot produce the commercial terms.
- The deterministic Northstar sample is honest about being a sample and uses real Appwrite persistence.
- Proposal tokens are high-entropy, hash-only at rest, expiring, and rotatable.
- The current repository check covers 26 frontend and 18 function tests; both npm package trees reported zero audit vulnerabilities on 20 July 2026.

The Node 22 production smoke also covered a successful Azure comparison, unrelated-session isolation, row permissions, human review, token rotation, analysis locking, final-decision idempotency, manual fallback, and audit attribution. These checks are not a penetration test. The submission checklist keeps the remaining external gates separate.

## What we learned

Trustworthy AI UX is less about making a model sound certain and more about preserving the chain from source words to human decision. Appwrite made it practical to keep that chain—state, transaction, permission, event, and live update—in one compact stack.

## What's next

- Recoverable operator accounts and agency teams
- Multiple accepted scope versions and explicit supersession
- Attachments with a documented retention and deletion policy
- Revocation controls and optional client identity verification
- Live authorization integration tests and browser end-to-end coverage
- Azure cost alerts alongside the in-app global ceiling

## Built with

Appwrite, React, TypeScript, Vite, Node.js, Azure OpenAI, `gpt-5.4-mini`, Zod, Vitest, Oxlint, and Codex with GPT-5.6.

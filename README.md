# LISA Frontend

A Next.js App Router frontend for the LISA network operations assistant.

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `LISA_API_URL` in `.env.local` to the backend origin. The chat page streams from `/api/v1/chat/stream`. Conversation history is currently stored in browser local storage. For compatibility with existing local setups, `NEXT_PUBLIC_LISA_API_URL` remains a fallback when `LISA_API_URL` is unset.

The browser obtains the API origin from the frontend's `/api/runtime-config` endpoint at runtime. In Docker deployments, set `LISA_API_URL` to an address reachable by each user's browser (for example, the host-published API address); a Docker service name such as `lisa-api` is only resolvable inside the Docker network.

## Routes

- `/` landing page
- `/sign-in`, `/sign-up`, `/forgot-password` authentication screens
- `/app` new chat workspace
- `/app/chat/[conversationId]` a stored conversation
- `/app/settings` workspace settings

Authentication forms are scaffolds and remain disabled until an identity provider is integrated. The app layout is the integration point for route protection.

## Project Structure

- `src/app`: routes, layouts, loading states, and error boundaries
- `src/components`: landing, authentication, layout, chat, and UI components
- `src/lib`: API client, LISA endpoints, auth configuration, shared utilities
- `src/hooks`: chat and conversation state hooks
- `src/providers`: shared React providers
- `src/types`: user, chat, and conversation types
- `src/config`: public site metadata

## Checks

```bash
npm run lint
npm run build
```
## HITL Approvals

The chat workspace now displays a temporary approval extension immediately above
the existing composer. Read-only tool calls do not trigger it. Approval details
come from the authenticated backend, not from model-generated descriptions.

Known memory proposals use readable summaries and bounded content/type/scope
editors. Unknown operations use neutral, structured summaries with sensitive
fields redacted and additional information under Details. Backend-advertised
editable fields are necessary but not sufficient: a known safe editor must also
exist. No raw JSON editor or model-visible authorization data is exposed.

Approve records a decision only. Run approved action explicitly resumes execution;
rejection/cancellation/expiry can continue with a negative tool receipt. Only new
resumed content is appended to chat. The existing Stop button also cancels a
resume stream, after which the UI refreshes authoritative status rather than
assuming the operation did or did not run.

The UI uses cookie authentication and the existing runtime API URL. Configure the
backend's `LISA_CORS_ALLOWED_ORIGINS` to include the actual browser origin. The
browser supplies Origin; the UI sends no role/ownership claims. All eligibility,
deadline, revision/hash, editing, and execution checks remain on the backend.
Jira writes remain disabled; this UI does not enable tools or change policy.

Pending panels use the thinking button's purple palette and an isolated pulse;
reduced-motion users receive a static highlight. No approval means no reserved
panel space. Existing composer controls and red error styling are unchanged.

Run the dependency-free approval tests with Node 24 (no new packages required):

```bash
node --experimental-strip-types --test tests/approval-api.test.ts tests/approval-presentation.test.ts tests/approval-lifecycle.test.ts tests/approval-panel.test.ts tests/approval-page.test.ts
```

Tests cover presentation/redaction, API contracts, lifecycle/expiry, notification
deduplication and conversation scoping, NDJSON continuation, Stop cleanup, panel
states, reduced motion, and additive chat-page wiring. Browser verification uses
mocked APIs, not live writes. Full deployed backend/model certification remains
separate from frontend validation.

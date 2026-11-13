# lisa-ui

The web client for **LISA** (Level 1 Intelligent System and Assistant). It is a
Next.js App Router application that provides the chat workspace, approval panels
for tool actions, account settings and user administration.

The UI talks only to [`lisa-api`](https://github.com/jemuelbjeroham/lisa-api),
using cookie-based sessions. See the
[LISA README](https://github.com/jemuelbjeroham/LISA#system-overview) for the full
system diagram.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Routes](#routes)
- [Project layout](#project-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [How the chat works](#how-the-chat-works)
- [HITL approvals](#hitl-approvals)
- [Testing and checks](#testing-and-checks)
- [Docker](#docker)
- [Continuous integration](#continuous-integration)

---

## Features

- **Streaming chat** with Markdown rendering (GitHub-flavoured), a Stop button
  and an optional **Think** mode for extended reasoning.
- **Conversation history** loaded from the API, with rename, delete and
  shareable conversation links.
- **Reply actions** on LISA's messages: **Copy** on every reply and
  **Regenerate** on the latest one.
- **Approval panels** for proposed tool actions (Jira tickets, memory saves),
  shown above the message box with a live expiry countdown.
- **Accounts**: sign-in, sign-out and change password. Accounts are created by
  administrators; there is no public sign-up.
- **Admin tools**: a **Manage users** page to create users, generate temporary
  passwords, change roles and deactivate accounts.
- **Live status chip** showing Ready / Thinking / Generating / Error.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, `standalone` output) and React 19
- TypeScript 5
- Tailwind CSS 4 with `@tailwindcss/typography`
- `react-markdown` + `remark-gfm`

## Routes

| Route | Description |
| --- | --- |
| `/` | Landing page |
| `/sign-in` | Sign in |
| `/sign-up` | Explains that accounts are created by an administrator |
| `/forgot-password` | Password-reset guidance (contact an administrator) |
| `/change-password` | Standalone change-password page |
| `/app` | Chat workspace (new conversation) |
| `/app/chat/[conversationId]` | An existing conversation |
| `/app/settings` | Account settings |
| `/app/settings/password` | Change password |
| `/app/admin/users` | User administration (admins only) |
| `/api/runtime-config` | Returns the API origin to the browser at runtime |

## Project layout

```text
src/
├── app/                    # Routes, layouts, loading states and error boundaries
│   ├── app/page.tsx        # Main chat workspace (sidebar, messages, composer)
│   └── api/runtime-config/ # Runtime API URL endpoint
├── components/
│   ├── approvals/          # ApprovalPanel and the useApprovals hook
│   ├── chat/               # Chat building blocks
│   ├── landing/, layout/, ui/
├── lib/
│   ├── api-url.ts          # Resolves the API origin via /api/runtime-config
│   ├── conversations.ts    # Conversation API calls
│   ├── approvals.ts        # Approval API client
│   ├── approval-lifecycle.ts       # Approval state machine (refresh, decide, resume, expiry)
│   └── approvalPresentation/       # Safe, readable rendering of approval payloads
├── providers/AppProviders.tsx      # Session/auth context
├── config/site.ts                  # Site name and metadata
└── types/
tests/                      # Dependency-free approval tests (node:test)
```

## Getting started

Requirements: Node.js **22** (Node **24** to run the approval tests) and a running
`lisa-api`.

```sh
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Add `http://localhost:3000` to `LISA_CORS_ALLOWED_ORIGINS` on `lisa-api`, then
sign in with an account created by an administrator (the first admin is created
with `lisa-api-bootstrap-admin`).

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `LISA_API_URL` | `http://localhost:8008` | API origin **as reachable from the user's browser**. Read at runtime, so one image works in every environment |
| `NEXT_PUBLIC_LISA_API_URL` | — | Legacy fallback when `LISA_API_URL` is unset |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Public site URL used in metadata |

The browser fetches the API origin from `/api/runtime-config` rather than having
it baked in at build time. In Docker, set `LISA_API_URL` to the host-published API
address (for example `http://localhost:8008`); a Compose service name such as
`lisa-api` resolves only inside the Docker network, not in the browser.

## How the chat works

1. Sending a message posts to `POST /api/v1/chat/stream` with
   `credentials: "include"`, so the session cookie is sent.
2. The response is newline-delimited JSON. Only `content`-type events are
   appended to the visible answer; reasoning and status events are not mixed in.
3. Approval events (`approval_required`, `approval_updated`,
   `tool_execution_status`, `execution_suspended`, `execution_completed`) are
   routed to the approval panel instead of the chat.
4. **Regenerate** re-sends the latest prompt and replaces the latest reply in
   the UI. The backend has no regenerate endpoint, so the server-side history
   keeps both the original and the regenerated reply.

## HITL approvals

The chat workspace shows an approval panel immediately above the message box
whenever LISA proposes an action that needs approval. Read-only tool calls never
trigger it. Approval details come from the authenticated backend, not from
model-generated descriptions.

- **Readable summaries.** Known operations (memory saves, Jira create, comment
  and close) get readable titles and fields. Unknown operations use neutral,
  structured summaries with sensitive values redacted and extra information
  under **Details**.
- **Safe editing.** A field is editable only if the backend allows it *and* the
  UI has a known safe editor for it. For new Jira tickets these are subject,
  description, project key, issue type and priority; optional fields that were
  left to backend defaults are not shown. There is no raw JSON editor.
- **Explicit execution.** **Approve** records a decision only; **Run approved
  action** resumes execution. Rejection, cancellation or expiry continues the
  conversation with a negative tool result. Only newly resumed content is
  appended to the chat.
- **Stop.** The Stop button also cancels a resume stream; the UI then refreshes
  the authoritative status rather than assuming whether the action ran.

The UI sends no role or ownership claims. All eligibility, deadline,
revision/hash, editing and execution checks happen on the backend. Configure
`LISA_CORS_ALLOWED_ORIGINS` on `lisa-api` to include the exact browser origin,
because approval mutations are rejected without a matching `Origin` header.

Pending panels use the Think button's purple palette with a subtle pulse;
users who prefer reduced motion get a static highlight.

## Testing and checks

```sh
npm run lint
npm run build
npx tsc --noEmit
```

Approval tests use Node's built-in test runner and TypeScript stripping, with no
extra packages (Node 24):

```sh
node --experimental-strip-types --test tests/*.test.ts
```

They cover presentation and redaction, API contracts, lifecycle and expiry,
notification de-duplication and conversation scoping, NDJSON continuation, Stop
cleanup, panel states, reduced motion and the chat-page wiring. They use mocked
APIs, never live writes.

## Docker

The multi-stage [`Dockerfile`](Dockerfile) builds a Next.js standalone server and
runs it as a non-root user on port 3000:

```sh
docker build -t lisa-ui:local .
docker run --rm -p 3000:3000 -e LISA_API_URL=http://localhost:8008 lisa-ui:local
```

For the full stack, use [`lisa-cicd`](https://github.com/jemuelbjeroham/lisa-cicd),
which publishes the UI on `127.0.0.1:8443`.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) calls the shared
`node-ci.yml` workflow from `lisa-cicd` (pinned to a commit SHA), which runs
`npm ci` and `npm run build` on Node 22.

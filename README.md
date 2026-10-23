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

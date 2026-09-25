# Personal AI — Phase 1

A personal long-term memory system: chat with an assistant that remembers what you tell it,
classifies what it learns by risk, and asks for your approval before anything consequential,
inferred, low-confidence, or contradictory becomes a permanent fact. See the Phase 1 plan in the
project's task tracker for the full design rationale.

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn, Drizzle ORM over Postgres+pgvector, NextAuth
credentials auth (single seeded user), Zod validation everywhere, Ollama as the default local
LLM/embedding provider (Anthropic/OpenAI available via `LLM_PROVIDER`), Vitest.

## Prerequisites

- Node.js 20+
- Docker (for Postgres+pgvector via `docker-compose.yml`)
- [Ollama](https://ollama.com) running locally, with a chat model and `nomic-embed-text` pulled:

  ```bash
  ollama pull nomic-embed-text
  ollama pull qwen3:8b   # or any other chat-capable model; set OLLAMA_CHAT_MODEL to match
  ```

## Setup

```bash
cp .env.example .env.local
# edit .env.local: generate AUTH_SECRET/NEXTAUTH_SECRET (openssl rand -base64 32),
# set ADMIN_EMAIL/ADMIN_PASSWORD for the single seeded user, adjust OLLAMA_* if needed

npm install

docker compose up -d          # starts Postgres with the pgvector extension
npm run db:migrate            # creates the 16 tables + enables pgvector
npm run db:seed               # creates/updates the single admin user from .env.local

npm run dev                   # http://localhost:3000
```

Sign in with `ADMIN_EMAIL`/`ADMIN_PASSWORD` at `/login`.

## What's here

- **Chat** (`/chat`) — every message is stored as an immutable `sources` row before anything else
  touches it. The response is generated from retrieved memory context and returned immediately;
  memory formation runs afterward, in the background (`InMemoryJobQueue`), and never blocks the
  reply.
- **Memory browser** (`/memory`) — every memory's full explainability panel: statement, type,
  domain, origin, confidence, importance, status, temporal type, timestamps, linked entities, view
  source, view version history, edit, archive.
- **Review inbox** (`/review`) — anything the risk policy (`src/server/memory/policy.ts`) flagged as
  `PENDING_REVIEW`, plus open contradictions between memories. Approve, edit-then-approve, or reject;
  resolve contradictions by keeping one side, both, or dismissing.
- **Sources** (`/sources`) — the immutable raw evidence (chat turns and imported documents) that
  memories are traceable back to, plus a file importer (.txt/.md/.pdf/.json/.csv) and a manual-note
  form.
- **Explicit commands** — say "remember that...", "forget that...", "actually, it's...", or "why do
  you think/remember..." in chat and it's handled directly (`src/server/memory/commands.ts`) instead
  of going through the general extraction pipeline.

## How memory formation decides what to trust

`src/server/memory/policy.ts` classifies every candidate memory by its `origin` (explicit command,
stated-in-passing, extracted, inferred, system-derived, or imported), `confidence`, `importance`, and
whether it contradicts an existing active memory. Low-risk, high-confidence candidates go straight to
`ACTIVE`; anything high-importance, inferred, low-confidence, a `DECISION`, or contradictory waits in
the review inbox. An imported document is treated the same as extracted/inferred chat content — it
can never bypass review the way an explicit "remember that" command can, so a prompt-injected
instruction inside a document can at most produce a low-trust pending candidate a human has to
approve.

## Tests

```bash
npm run test
```

Covers the policy classification table, the contradiction-detection id guard, retrieval scoring
(status/recency/importance weighting), the importers, and Zod validation of formation/command
output.

## Other scripts

```bash
npm run db:generate   # generate a new Drizzle migration after changing src/server/db/schema.ts
npm run db:studio     # Drizzle Studio, a GUI over the local database
npm run lint
npm run build
```

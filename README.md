# Rematch Tier List

Rematch Tier List is a greenfield monorepo for a tier-list website and Discord sync integration based on the uploaded ruleset, design brief, and mockup.

## Workspace

- `apps/web`: Next.js app for the public site, admin dashboard, result logging, settings, and API routes
- `packages/shared-types`: domain models shared across the app
- `packages/rules-engine`: tier rules, eligibility, inactivity, and snapshot derivation
- `packages/import-adapters`: import-source parsing and preview normalization contracts
- `packages/discord-sync`: Discord summary/message formatting and sync job helpers
- `supabase/migrations`: initial schema for Supabase/Postgres

## Phase 1 Included Here

- Mockup-driven public and admin UI scaffold
- Shared rules engine and sample snapshot generation
- Import preview/confirm contracts for Battlefy and start.gg
- Discord sync contracts for pinned summary and movement posts
- Supabase-ready schema and service boundaries

## Screenshot Policy

Phase 2 screenshot parsing is designed as transient processing input. Images do not need durable storage; if temporary upload/storage is used later for Anthropic parsing, the implementation should delete the file immediately after a successful parse.

## Local Setup

1. Copy `.env.example` to `.env.local`
2. Install dependencies with `npm.cmd install`
3. Run the web app with `npm.cmd run dev`

## Notes

- Admin auth is username-first in the UI and intended to map to Supabase Auth identities under the hood.
- Discord v1 is sync-only and does not require a persistent gateway bot.
- Battlefy fetching is behind an adapter contract because the ruleset relies on an unofficial API.

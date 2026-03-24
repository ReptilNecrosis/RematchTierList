# Rematch Tier List Setup Checklist

## 1. Supabase Schema

The app can now connect to Supabase, but the database schema must be created once in the Supabase SQL Editor.

1. Open your Supabase project
2. Go to `SQL Editor`
3. Open [0001_init.sql](/C:/Users/Tjalfe/Desktop/RematchTierList/RematchTierList/supabase/migrations/0001_init.sql)
4. Paste the full file into the SQL editor
5. Run it

After that, the app can start reading and writing the project tables instead of falling back to demo data.

## 2. Discord Bot

You still need:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CHANNEL_ID`
- optional `DISCORD_PINNED_MESSAGE_ID`

The bot needs permission to:

- View Channels
- Send Messages
- Manage Messages
- Read Message History

## 3. Local Environment

Add these to `.env.local` or your Vercel project env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_CHANNEL_ID`
- `DISCORD_PINNED_MESSAGE_ID`

## 4. Deployment

For the free-first setup:

- Host the app on Vercel
- Keep Supabase as the database/auth backend
- Keep Discord bot credentials in Vercel environment variables
- Use the same Next.js app for REST-based Discord sync

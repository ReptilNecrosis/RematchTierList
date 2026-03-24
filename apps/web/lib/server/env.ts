export function getServerEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    startGgApiKey: process.env.START_GG_API_KEY,
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordChannelId: process.env.DISCORD_CHANNEL_ID,
    discordPinnedMessageId: process.env.DISCORD_PINNED_MESSAGE_ID,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest"
  };
}

export function hasSupabaseEnv() {
  const env = getServerEnv();
  return Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceRoleKey);
}

export function hasDiscordEnv() {
  const env = getServerEnv();
  return Boolean(env.discordBotToken && env.discordChannelId);
}

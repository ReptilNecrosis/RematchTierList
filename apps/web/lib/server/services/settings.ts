import { getSettingsData } from "../repository";
import { getServiceSupabase } from "../supabase";

const APP_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export async function getSettingsSummary() {
  const result = await getSettingsData();
  return result.data;
}

export async function upsertSettings(values: {
  discordChannelId?: string | null;
  pinnedMessageId?: string | null;
}) {
  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Supabase is not configured in the environment yet."
    };
  }

  const payload: Record<string, string | null> = {
    id: APP_SETTINGS_ID,
    updated_at: new Date().toISOString()
  };

  if (values.discordChannelId !== undefined) {
    payload.discord_channel_id = values.discordChannelId;
  }

  if (values.pinnedMessageId !== undefined) {
    payload.discord_pinned_message_id = values.pinnedMessageId;
  }

  const { error } = await client.from("app_settings").upsert(payload as never, {
    onConflict: "id"
  });

  if (error) {
    return {
      ok: false,
      message: `Could not save settings to Supabase yet: ${error.message}`
    };
  }

  return {
    ok: true,
    message: "Settings saved to Supabase. Keep secret tokens in environment variables for now."
  };
}

export async function saveSettings(payload: Record<string, unknown>) {
  const discordChannelId =
    typeof payload.discordChannelId === "string" && payload.discordChannelId.trim()
      ? payload.discordChannelId.trim()
      : null;
  const pinnedMessageId =
    typeof payload.pinnedMessageId === "string" && payload.pinnedMessageId.trim()
      ? payload.pinnedMessageId.trim()
      : null;

  return upsertSettings({
    discordChannelId,
    pinnedMessageId
  });
}

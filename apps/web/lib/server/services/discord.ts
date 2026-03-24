import { buildDiscordTierSummary, createDiscordSyncJobs } from "@rematch/discord-sync";

import { getDashboardData, getSettingsData } from "../repository";
import { getServerEnv } from "../env";
import { getServiceSupabase } from "../supabase";
import { upsertSettings } from "./settings";

function buildDiscordErrorMessage(status: number, text: string) {
  if (text.includes('"code": 50013') || text.includes("Missing Permissions")) {
    return `Discord sync failed: ${status} Missing Permissions. Grant the bot View Channels, Send Messages, Read Message History, and Manage Messages in the target channel.`;
  }

  return `Discord sync failed: ${status} ${text}`;
}

async function sendDiscordJson(url: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
  const env = getServerEnv();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bot ${env.discordBotToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(buildDiscordErrorMessage(response.status, text));
  }

  return response.json().catch(() => null);
}

async function sendDiscordRequest(url: string, method: "PUT") {
  const env = getServerEnv();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bot ${env.discordBotToken}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(buildDiscordErrorMessage(response.status, text));
  }
}

async function getDiscordConfig() {
  const env = getServerEnv();
  const settingsResult = await getSettingsData();
  const storedSettings = settingsResult.data.settings;

  return {
    botToken: env.discordBotToken,
    channelId: storedSettings.discordChannelId ?? env.discordChannelId,
    pinnedMessageId: storedSettings.pinnedMessageId ?? env.discordPinnedMessageId
  };
}

async function recordDiscordJob(jobType: "resync_summary" | "test_post", payload: Record<string, unknown>) {
  const client = getServiceSupabase();
  if (!client) {
    return;
  }

  await client.from("discord_sync_jobs").insert({
    job_type: jobType,
    payload,
    status: "completed"
  } as never);
}

export async function resyncDiscordSummary(mode: "summary" | "test" = "summary") {
  const dashboardResult = await getDashboardData();
  const snapshot = dashboardResult.data.snapshot;
  const jobs = createDiscordSyncJobs(snapshot, mode);
  const message = mode === "summary" ? buildDiscordTierSummary(snapshot) : "Discord test sync from Rematch Tier List.";
  const config = await getDiscordConfig();

  if (!config.botToken || !config.channelId) {
    return {
      ok: true,
      dryRun: true,
      message: "Discord env vars are not configured yet. Returning the sync payload as a dry run.",
      jobs,
      preview: message
    };
  }

  const apiBase = `https://discord.com/api/v10/channels/${config.channelId}/messages`;

  if (mode === "summary" && config.pinnedMessageId) {
    await sendDiscordJson(`${apiBase}/${config.pinnedMessageId}`, "PATCH", {
      content: message
    });
  } else {
    const createdMessage = await sendDiscordJson(apiBase, "POST", {
      content: message
    });

    if (mode === "summary") {
      const createdMessageId =
        createdMessage && typeof createdMessage.id === "string" ? createdMessage.id : null;

      if (!createdMessageId) {
        throw new Error("Discord sync failed: the created summary message did not return a message ID.");
      }

      await sendDiscordRequest(
        `https://discord.com/api/v10/channels/${config.channelId}/pins/${createdMessageId}`,
        "PUT"
      );

      const persistResult = await upsertSettings({
        discordChannelId: config.channelId,
        pinnedMessageId: createdMessageId
      });

      if (!persistResult.ok) {
        throw new Error(persistResult.message);
      }
    }
  }

  await recordDiscordJob(mode === "summary" ? "resync_summary" : "test_post", {
    message,
    channelId: config.channelId
  });

  return {
    ok: true,
    dryRun: false,
    message:
      mode === "summary" && !config.pinnedMessageId
        ? "Discord sync completed. The bot created and pinned a new summary message."
        : "Discord sync completed.",
    jobs,
    preview: message
  };
}

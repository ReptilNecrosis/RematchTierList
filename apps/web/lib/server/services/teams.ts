import { currentSnapshot, teams } from "../../sample-data/demo";
import { getServiceSupabase } from "../supabase";

export async function moveTeam(teamId: string, movementType: "promotion" | "demotion") {
  const team = teams.find((entry) => entry.id === teamId);
  if (!team) {
    return {
      ok: false,
      message: "Team not found."
    };
  }

  return {
    ok: true,
    message: `${team.name} marked for ${movementType}. Persist the actual tier transition and Discord sync in one transaction when Supabase is connected.`,
    pendingFlags: currentSnapshot.pendingFlags.filter((flag) => flag.teamId === teamId)
  };
}

export async function clearInactivity(teamId: string) {
  const team = teams.find((entry) => entry.id === teamId);
  if (!team) {
    return {
      ok: false,
      message: "Team not found."
    };
  }

  return {
    ok: true,
    message: `Inactivity clear requested for ${team.name}. This is a service contract endpoint until persistence is connected.`
  };
}

export async function deleteTeam(teamId: string, actorAdminId: string) {
  const normalizedTeamId = teamId.trim();
  if (!normalizedTeamId) {
    return {
      ok: false,
      message: "teamId is required."
    };
  }

  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Team deletion requires live Supabase data."
    };
  }

  const { data, error } = await client.rpc(
    "delete_team_atomic",
    {
      target_team_id: normalizedTeamId,
      actor_admin_id: actorAdminId
    } as never
  );

  if (error) {
    if (error.message === "TEAM_NOT_FOUND") {
      return {
        ok: false,
        message: "Team not found."
      };
    }

    if (error.message === "ADMIN_NOT_FOUND") {
      throw new Error("Your admin session is no longer valid.");
    }

    throw new Error(`Could not delete team: ${error.message}`);
  }

  const payload = (data ?? {}) as {
    teamId?: string;
    teamName?: string;
  };

  return {
    ok: true,
    message: `${payload.teamName ?? "The team"} has been deleted.`
  };
}

export async function confirmUnverifiedTeam(normalizedName: string, actorAdminId: string) {
  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Supabase is not configured. Cannot confirm unverified team."
    };
  }

  const { data: teamRows, error: fetchError } = await client
    .from("teams")
    .select("id, name")
    .eq("verified", false)
    .ilike("name", normalizedName.replace(/-/g, " "));

  if (fetchError) {
    throw new Error(`Could not find team: ${fetchError.message}`);
  }

  const team = ((teamRows ?? []) as Array<Record<string, string>>).find(
    (t) => t.name.trim().toLowerCase() === normalizedName
  );

  if (!team) {
    return {
      ok: false,
      message: `No unverified team found matching "${normalizedName}".`
    };
  }

  const { error: updateError } = await client
    .from("teams")
    .update({ verified: true } as never)
    .eq("id", team.id);

  if (updateError) {
    throw new Error(`Could not confirm team: ${updateError.message}`);
  }

  const { error: deleteError } = await client
    .from("unverified_appearances")
    .delete()
    .eq("normalized_name", normalizedName);

  if (deleteError) {
    throw new Error(`Could not clear appearances: ${deleteError.message}`);
  }

  await client.from("activity_log").insert({
    admin_account_id: actorAdminId,
    verb: "confirmed",
    subject: `Unverified team ${team.name}`
  } as never);

  return { ok: true, teamName: team.name };
}

export async function rejectUnverifiedTeam(normalizedName: string, actorAdminId: string) {
  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Supabase is not configured. Cannot reject unverified team."
    };
  }

  const { data: teamRows } = await client
    .from("teams")
    .select("id, name")
    .eq("verified", false);

  const team = ((teamRows ?? []) as Array<Record<string, string>>).find(
    (t) => t.name.trim().toLowerCase() === normalizedName
  );

  if (team) {
    const { error: deleteTeamError } = await client.from("teams").delete().eq("id", team.id);
    if (deleteTeamError) {
      throw new Error(`Could not delete team: ${deleteTeamError.message}`);
    }
  }

  const { error: deleteError } = await client
    .from("unverified_appearances")
    .delete()
    .eq("normalized_name", normalizedName);

  if (deleteError) {
    throw new Error(`Could not clear appearances: ${deleteError.message}`);
  }

  await client.from("activity_log").insert({
    admin_account_id: actorAdminId,
    verb: "rejected",
    subject: `Unverified team ${normalizedName}`
  } as never);

  return { ok: true };
}

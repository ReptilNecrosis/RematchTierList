import { currentSnapshot, teams } from "../../sample-data/demo";

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

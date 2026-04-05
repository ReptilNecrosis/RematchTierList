"use client";

import { useEffect, useState } from "react";

import type { HeadToHeadTeam, SeriesResult } from "@rematch/shared-types";

import { HeadToHeadSearch } from "./head-to-head-search";

type HistoryHeadToHeadState =
  | { status: "loading"; teams: HeadToHeadTeam[]; series: SeriesResult[]; message: string }
  | { status: "ready"; teams: HeadToHeadTeam[]; series: SeriesResult[]; message: string }
  | { status: "error"; teams: HeadToHeadTeam[]; series: SeriesResult[]; message: string };

export function HistoryHeadToHead() {
  const [state, setState] = useState<HistoryHeadToHeadState>({
    status: "loading",
    teams: [],
    series: [],
    message: "Loading all-time head-to-head data..."
  });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/history/head-to-head", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const body = (await response.json()) as {
          ok?: boolean;
          teams?: HeadToHeadTeam[];
          series?: SeriesResult[];
        };

        if (!active || !body.ok || !Array.isArray(body.teams) || !Array.isArray(body.series)) {
          throw new Error("Invalid head-to-head payload.");
        }

        setState({
          status: "ready",
          teams: body.teams,
          series: body.series,
          message: ""
        });
      } catch {
        if (!active) {
          return;
        }

        setState({
          status: "error",
          teams: [],
          series: [],
          message: "Head-to-head data could not be loaded right now. Please refresh and try again."
        });
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return <div className="empty-copy">{state.message}</div>;
  }

  if (state.status === "error") {
    return <div className="empty-copy">{state.message}</div>;
  }

  return <HeadToHeadSearch teams={state.teams} allSeries={state.series} />;
}

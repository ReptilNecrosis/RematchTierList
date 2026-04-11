"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { HeadToHeadTeam, SeriesResult, TierId } from "@rematch/shared-types";

const tierColors: Record<TierId, string> = {
  tier1: "var(--t1)",
  tier2: "var(--t2)",
  tier3: "var(--t3)",
  tier4: "var(--t4)",
  tier5: "var(--t5)",
  tier6: "var(--t6)",
  tier7: "var(--t7)"
};

type ResolvedTeam = HeadToHeadTeam;

function getCandidates(teams: HeadToHeadTeam[], query: string): HeadToHeadTeam[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return teams.filter((t) => t.name.toLowerCase().includes(q));
}

function TeamInput({
  label,
  value,
  onChange,
  selected,
  onSelect,
  onClear,
  candidates,
  seriesCounts,
  disabled
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  selected: ResolvedTeam | null;
  onSelect: (t: ResolvedTeam) => void;
  onClear: () => void;
  candidates: HeadToHeadTeam[];
  seriesCounts?: Map<string, number>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showDropdown = open && candidates.length > 0;

  return (
    <div ref={ref} className="h2h-team-input">
      <div className="h2h-input-label">{label}</div>
      {selected ? (
        <div className="h2h-selected-team">
          <span className="h2h-selected-name">{selected.name}</span>
          {!disabled && (
            <button type="button" className="h2h-clear-btn" onClick={onClear}>
              ✕
            </button>
          )}
        </div>
      ) : (
        <input
          className="search-input"
          value={value}
          disabled={disabled}
          placeholder={`Search team…`}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      )}
      {showDropdown && (
        <div className="h2h-dropdown">
          {candidates.map((t) => {
            const count = seriesCounts?.get(t.id) ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                className="h2h-dropdown-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(t);
                  setOpen(false);
                }}
              >
                <span>{t.name}</span>
                {count > 0 && (
                  <span className="h2h-dropdown-count">{count} series</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HeadToHeadSearch({
  teams,
  allSeries,
  prefilledTeam
}: {
  teams: HeadToHeadTeam[];
  allSeries: SeriesResult[];
  prefilledTeam?: { id: string; name: string };
}) {
  const [queryA, setQueryA] = useState("");
  const [queryB, setQueryB] = useState("");
  const [selectedA, setSelectedA] = useState<ResolvedTeam | null>(
    prefilledTeam ? { id: prefilledTeam.id, name: prefilledTeam.name, slug: "" } : null
  );
  const [selectedB, setSelectedB] = useState<ResolvedTeam | null>(null);

  const deferredA = useDeferredValue(queryA);
  const deferredB = useDeferredValue(queryB);

  const candidatesA = selectedA ? [] : getCandidates(teams, deferredA);

  // Count series played by Team A against each opponent
  const opponentSeriesCounts = useMemo(() => {
    if (!selectedA) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const s of allSeries) {
      const opponentId =
        s.teamOneId === selectedA.id ? s.teamTwoId :
        s.teamTwoId === selectedA.id ? s.teamOneId :
        null;
      if (opponentId) counts.set(opponentId, (counts.get(opponentId) ?? 0) + 1);
    }
    return counts;
  }, [selectedA, allSeries]);

  const candidatesB = useMemo(() => {
    if (selectedB) return [];
    const trimmed = deferredB.trim();
    if (trimmed) {
      // Filtered by query, sorted by series count against Team A
      return getCandidates(teams, trimmed).sort(
        (a, b) => (opponentSeriesCounts.get(b.id) ?? 0) - (opponentSeriesCounts.get(a.id) ?? 0)
      );
    }
    if (selectedA) {
      // No query — show top 10 opponents by series count
      return [...teams]
        .sort((a, b) => (opponentSeriesCounts.get(b.id) ?? 0) - (opponentSeriesCounts.get(a.id) ?? 0))
        .slice(0, 10);
    }
    return [];
  }, [selectedB, selectedA, deferredB, teams, opponentSeriesCounts]);

  const matches =
    selectedA && selectedB
      ? allSeries
          .filter(
            (s) =>
              (s.teamOneId === selectedA.id && s.teamTwoId === selectedB.id) ||
              (s.teamOneId === selectedB.id && s.teamTwoId === selectedA.id)
          )
          .sort((x, y) => y.playedAt.localeCompare(x.playedAt))
      : [];

  const aWins = matches.filter(
    (s) =>
      (s.teamOneId === selectedA?.id && s.teamOneScore > s.teamTwoScore) ||
      (s.teamTwoId === selectedA?.id && s.teamTwoScore > s.teamOneScore)
  ).length;
  const bWins = matches.length - aWins;

  function summaryLine() {
    if (!selectedA || !selectedB) return null;
    if (aWins === bWins) return `Tied ${aWins}–${bWins} all-time`;
    if (aWins > bWins) return `${selectedA.name} leads ${aWins}–${bWins} all-time`;
    return `${selectedB.name} leads ${bWins}–${aWins} all-time`;
  }

  function matchWinLoss(s: SeriesResult) {
    if (!selectedA || !selectedB) return { aWon: false, bWon: false };
    const aIsOne = s.teamOneId === selectedA.id;
    const aScore = aIsOne ? s.teamOneScore : s.teamTwoScore;
    const bScore = aIsOne ? s.teamTwoScore : s.teamOneScore;
    return { aWon: aScore > bScore, bWon: bScore > aScore };
  }

  function matchScoreLabel(s: SeriesResult) {
    if (!selectedA) return `${s.teamOneScore}–${s.teamTwoScore}`;
    const aIsOne = s.teamOneId === selectedA.id;
    const aScore = aIsOne ? s.teamOneScore : s.teamTwoScore;
    const bScore = aIsOne ? s.teamTwoScore : s.teamOneScore;
    return `${aScore}–${bScore}`;
  }

  return (
    <div className="h2h-widget">
      <div className="h2h-inputs">
        <TeamInput
          label="Team A"
          value={queryA}
          onChange={setQueryA}
          selected={selectedA}
          onSelect={(t) => { setSelectedA(t); setQueryA(""); }}
          onClear={() => { if (!prefilledTeam) { setSelectedA(null); setQueryA(""); } }}
          candidates={candidatesA}
          disabled={!!prefilledTeam}
        />
        <div className="h2h-versus">vs</div>
        <TeamInput
          label="Team B"
          value={queryB}
          onChange={setQueryB}
          selected={selectedB}
          onSelect={(t) => { setSelectedB(t); setQueryB(""); }}
          onClear={() => { setSelectedB(null); setQueryB(""); }}
          candidates={candidatesB}
          seriesCounts={opponentSeriesCounts}
        />
      </div>

      {selectedA && selectedB && (
        <div className="h2h-results">
          <div className="h2h-summary">{summaryLine()}</div>
          {matches.length === 0 ? (
            <div className="empty-copy">No matches found between these two teams.</div>
          ) : (
            <div className="h2h-match-list">
              {matches.map((s) => {
                const { aWon, bWon } = matchWinLoss(s);
                return (
                  <div key={s.id} className="history-item">
                    <div className="history-line">
                      <div className="h2h-match-info">
                        <div className="p-name">
                          {selectedA.name} <span className="versus">vs</span> {selectedB.name}
                        </div>
                        <div className="p-reason">
                          {new Date(s.playedAt).toDateString()}
                        </div>
                      </div>
                      <div className="h2h-match-right">
                        <div
                          className="season-record-pill h2h-score-pill"
                          style={{ "--tc": tierColors[selectedA.tierId] } as CSSProperties}
                        >
                          {matchScoreLabel(s)}
                        </div>
                        <div className="h2h-wl">
                          <span className={aWon ? "h2h-w" : "h2h-l"}>{aWon ? "W" : "L"}</span>
                          <span className="h2h-sep">/</span>
                          <span className={bWon ? "h2h-w" : "h2h-l"}>{bWon ? "W" : "L"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const PARTY_CONTRIBUTION_KEYS = [
  "weapon-vulnerability",
  "status-vulnerability",
  "melee-vulnerability",
  "bulls-eye",
  "fortress",
  "healing",
  "shield",
  "control",
  "mobility",
  "supplies",
] as const;

export type PartyContributionKey = (typeof PARTY_CONTRIBUTION_KEYS)[number];
export type PartyVulnerabilityType = "weapon" | "status" | "melee";

/** A participant's declared setup, rather than a fixed combat role or measured DPS. */
export interface PartyContribution {
  keys: PartyContributionKey[];
  loadoutNote: string;
  vulnerability: Record<PartyVulnerabilityType, number | null>;
}

export function emptyPartyContribution(): PartyContribution {
  return {
    keys: [],
    loadoutNote: "",
    vulnerability: { weapon: null, status: null, melee: null },
  };
}

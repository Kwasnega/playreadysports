import { describe, expect, it } from "vitest";
import { getActiveCoreCount, getSpotsLeft, getGalaTeamsIn } from "../lib/matchHelpers";

describe("matchHelpers", () => {
  it("handles matches without participant data safely", () => {
    const match = {
      participants: null as any,
      max_core_players: 10,
      players_per_side: 5,
    };

    expect(getActiveCoreCount(match as any)).toBe(0);
    expect(getSpotsLeft(match as any)).toBe(10);
    expect(getGalaTeamsIn(match as any)).toBe(0);
  });
});

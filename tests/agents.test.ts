import { describe, expect, test } from "bun:test";
import { AGENTS } from "../lib/agents/registry";

const REQUIRED = [
  "assistant",
  "kidstory",
  "studybuddy",
  "worksheet",
  "dataanalyst",
  "doctor",
  "psycho",
  "spiritual",
  "translator",
  "codementor",
  "docvision",
  "travelplanner",
  "recipechef",
  "fitnesscoach",
  "financehelper",
  "mailwriter",
  "errandelf",
  "legalguide",
  "fixitfox",
  "gistgenie",
  "careerclimb",
];

describe("agent registry", () => {
  test("ships every requested agent, plus the default assistant", () => {
    const ids = AGENTS.map((a) => a.id);
    for (const id of REQUIRED) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every persona has a distinct fancy display name", () => {
    const names = AGENTS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("every persona is complete enough to select in the UI", () => {
    for (const agent of AGENTS) {
      expect(agent.name.length).toBeGreaterThan(1);
      expect(agent.emoji.length).toBeGreaterThan(0);
      expect(agent.tagline.length).toBeLessThanOrEqual(70);
      expect(agent.system.length).toBeGreaterThan(600);
      expect(agent.starters).toHaveLength(3);
    }
  });

  test("vision agents are exactly the document and image ones", () => {
    const vision = AGENTS.filter((a) => a.vision).map((a) => a.id).sort();
    expect(vision).toEqual(
      [
        "assistant",
        "careerclimb",
        "codementor",
        "dataanalyst",
        "docvision",
        "doctor",
        "errandelf",
        "financehelper",
        "fitnesscoach",
        "fixitfox",
        "gistgenie",
        "kidstory",
        "legalguide",
        "recipechef",
        "translator",
        "travelplanner",
        "worksheet",
      ].sort(),
    );
  });

  test("doctor and psycho carry their safety rails", () => {
    const doctor = AGENTS.find((a) => a.id === "doctor");
    const psycho = AGENTS.find((a) => a.id === "psycho");
    expect(doctor?.system).toContain("not a doctor");
    expect(doctor?.system).toContain("Never prescribe");
    expect(psycho?.system).toContain("14416");
    expect(psycho?.system).toContain("AASRA");
  });
});

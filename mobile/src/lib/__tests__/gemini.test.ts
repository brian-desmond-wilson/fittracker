import {
  buildPromptDataFromForm,
  buildWODImagePrompt,
  extractMovementData,
  getPlaceholderImageUrl,
} from "../gemini";

describe("buildWODImagePrompt", () => {
  const base = {
    wodName: "Fran",
    formatName: "For Time",
    movements: [{ name: "Thruster", category: "barbell" }, { name: "Pull-up" }],
  };

  it("names the WOD and every movement", () => {
    const prompt = buildWODImagePrompt(base);
    expect(prompt).toContain("Fran");
    expect(prompt).toContain("Thruster (barbell)");
    expect(prompt).toContain("Pull-up");
  });

  it("leaves the parentheses off a movement with no category", () => {
    expect(buildWODImagePrompt({ ...base, movements: [{ name: "Run" }] }))
      .toContain("Movements: Run");
  });

  it("folds the time cap and rep scheme into the format line", () => {
    const prompt = buildWODImagePrompt({ ...base, timeCap: 12, repScheme: "21-15-9" });
    expect(prompt).toContain("For Time (12 min)");
    expect(prompt).toContain("21-15-9");
  });

  it("says nothing about a cap it wasn't given", () => {
    expect(buildWODImagePrompt(base)).not.toContain("min)");
  });

  it("still describes a WOD with no movements at all", () => {
    const prompt = buildWODImagePrompt({ ...base, movements: [] });
    expect(prompt).toContain("Fran");
    expect(prompt.length).toBeGreaterThan(0);
  });
});

describe("extractMovementData", () => {
  it("takes the name and first equipment from a wizard movement", () => {
    const out = extractMovementData([
      { exercise_name: "Thruster", equipment_types: ["barbell", "plate"] },
    ] as never);
    expect(out).toEqual([{ name: "Thruster", category: "barbell" }]);
  });

  it("leaves the category off when no equipment is named", () => {
    const out = extractMovementData([{ exercise_name: "Burpee" }] as never);
    expect(out).toEqual([{ name: "Burpee", category: undefined }]);
  });

  it("falls back to a placeholder for the API shape, which carries no name", () => {
    const out = extractMovementData([{ exercise_id: "abc" }] as never);
    expect(out).toEqual([{ name: "Movement" }]);
  });

  it("has nothing to extract from nothing", () => {
    expect(extractMovementData([])).toEqual([]);
  });
});

describe("buildPromptDataFromForm", () => {
  const form = {
    name: "Murph",
    movements: [{ exercise_name: "Run", equipment_types: [] }],
    time_cap_minutes: 60,
    rep_scheme: "1 round",
  };

  it("carries the form through", () => {
    const data = buildPromptDataFromForm(form as never, "Rounds For Time");
    expect(data.wodName).toBe("Murph");
    expect(data.formatName).toBe("Rounds For Time");
    expect(data.timeCap).toBe(60);
    expect(data.repScheme).toBe("1 round");
    expect(data.movements).toEqual([{ name: "Run", category: undefined }]);
  });

  it("assumes For Time when the format is unknown", () => {
    expect(buildPromptDataFromForm(form as never).formatName).toBe("For Time");
  });
});

describe("getPlaceholderImageUrl", () => {
  it("is a self-contained data URL, so it needs no network", () => {
    const url = getPlaceholderImageUrl();
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(50);
  });
});

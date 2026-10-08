import { sessionFocus, sessionTitle } from "../dailyFocus";
import { roundsBadge, roundsCount } from "../dailyRounds";

describe("sessionFocus", () => {
  it("reads the coach's leading focus phrase", () => {
    expect(
      sessionFocus("Pull emphasis for the stalest groups: biceps 20 days, lats 15 days."),
    ).toBe("Pull Emphasis");
  });

  it("takes the earliest focus and ignores yesterday's", () => {
    expect(
      sessionFocus(
        "Pull emphasis for the stalest groups: biceps 20 days; yesterday's push session completed. Energy 7.",
      ),
    ).toBe("Pull Emphasis");
    expect(sessionFocus("Yesterday's push session landed well, so legs day today.")).toBe("Legs Day");
    // The exact sentence the coach stored on 2026-10-08, curly apostrophe and all.
    expect(
      sessionFocus(
        "Pull emphasis for the stalest groups: biceps 20 days, lats/upper/lower back 15 days since trained; yesterday’s push session completed. Energy 7, no soreness. 60 min at Trans Bay.",
      ),
    ).toBe("Pull Emphasis");
  });

  it("reads a framing noun later in the sentence", () => {
    expect(sessionFocus("With no soreness, today is a push day built around pressing.")).toBe(
      "Push Day",
    );
  });

  it("prefers the longer compound over its parts", () => {
    expect(
      sessionFocus("Use your solid energy for a full-body strength day that gives neglected hips attention."),
    ).toBe("Full Body");
  });

  it("does not mistake a movement word for the focus", () => {
    expect(sessionFocus("Chest today; pull-ups stay out while the elbow settles.")).toBeNull();
    expect(sessionFocus("Core work after yesterday's pressing.")).toBe("Core Work");
  });

  it("is null when the sentence names no focus", () => {
    expect(sessionFocus("Nothing yesterday and mild soreness, so a measured session.")).toBeNull();
    expect(sessionFocus(null)).toBeNull();
    expect(sessionFocus("")).toBeNull();
  });
});

describe("sessionTitle", () => {
  it("joins the focus onto the base with an em dash", () => {
    expect(sessionTitle("Pull emphasis for the stalest groups.")).toBe("Today's Session — Pull Emphasis");
  });
  it("falls back to the base alone", () => {
    expect(sessionTitle(null)).toBe("Today's Session");
  });
});

describe("roundsCount / roundsBadge", () => {
  it("reads the app's own notes", () => {
    expect(roundsCount("Do 3 of 4 rounds")).toBe(3);
    expect(roundsCount("Do 11 rounds (written: 7)")).toBe(11);
  });
  it("reads the coach's long protocol note by its leading count only", () => {
    expect(
      roundsCount("Do 4 rounds (written: 8x KB Curl, 8R/8L Cross Body SL RDL; REPEAT 4x)"),
    ).toBe(4);
  });
  it("has no count for a cap or nothing", () => {
    expect(roundsCount("Cap at 30 min")).toBeNull();
    expect(roundsCount(null)).toBeNull();
  });
  it("pluralises the badge", () => {
    expect(roundsBadge("Do 4 rounds (written: 8)")).toBe("4 ROUNDS");
    expect(roundsBadge("Do 1 round")).toBe("1 ROUND");
    expect(roundsBadge("Cap at 30 min")).toBeNull();
  });
});

import {
  adHocCandidates,
  adHocSummary,
  AD_HOC_MIN_TIMES,
  type AdHocLogRow,
} from "../adHocMeals";

const log = (over: Partial<AdHocLogRow> = {}): AdHocLogRow => ({
  name: "Chipotle Bowl",
  date: "2026-08-01",
  calories: 900,
  protein: 42,
  carbs: 80,
  fats: 30,
  sugars: 4,
  sodium_mg: 1200,
  fiber_g: 11,
  saved_food_id: null,
  ...over,
});

describe("adHocCandidates", () => {
  it("promotes a habit, ignores a one-off", () => {
    const rows = [
      ...Array.from({ length: AD_HOC_MIN_TIMES }, (_, i) => log({ date: `2026-08-0${i + 1}` })),
      log({ name: "Airport sandwich", date: "2026-07-04" }),
    ];
    const out = adHocCandidates(rows);
    expect(out.map((c) => c.name)).toEqual(["Chipotle Bowl"]);
    expect(out[0].timesLogged).toBe(AD_HOC_MIN_TIMES);
  });

  it("groups case-insensitively — the same dinner typed twice", () => {
    const out = adHocCandidates([
      log({ name: "chipotle bowl" }),
      log({ name: "Chipotle Bowl", date: "2026-08-02" }),
      log({ name: "CHIPOTLE BOWL ", date: "2026-08-03" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].timesLogged).toBe(3);
    // Named as last written, so the suggestion reads back in your own words.
    expect(out[0].name).toBe("CHIPOTLE BOWL");
    expect(out[0].lastLoggedDate).toBe("2026-08-03");
  });

  it("takes the median, so one fat-fingered entry cannot define the meal", () => {
    const out = adHocCandidates([
      log({ calories: 900 }),
      log({ calories: 910, date: "2026-08-02" }),
      log({ calories: 9000, date: "2026-08-03" }), // typo
    ]);
    expect(out[0].calories).toBe(910);
  });

  it("counts a log with no numbers, but does not let it drag the medians", () => {
    const out = adHocCandidates([
      log({ calories: 900, protein: 40 }),
      log({ calories: 900, protein: 40, date: "2026-08-02" }),
      log({ calories: null, protein: null, date: "2026-08-03" }),
    ]);
    expect(out[0].timesLogged).toBe(3);
    expect(out[0].calories).toBe(900);
  });

  it("carries the source food only when every log agrees on it", () => {
    const same = adHocCandidates([
      log({ saved_food_id: "sf-1" }),
      log({ saved_food_id: "sf-1", date: "2026-08-02" }),
      log({ saved_food_id: "sf-1", date: "2026-08-03" }),
    ]);
    expect(same[0].savedFoodId).toBe("sf-1");

    // A mixture means the name has covered more than one product; picking one
    // would be a guess.
    const mixed = adHocCandidates([
      log({ saved_food_id: "sf-1" }),
      log({ saved_food_id: "sf-2", date: "2026-08-02" }),
      log({ saved_food_id: null, date: "2026-08-03" }),
    ]);
    expect(mixed[0].savedFoodId).toBeNull();
  });

  it("skips names already in the library", () => {
    const rows = Array.from({ length: 4 }, (_, i) => log({ date: `2026-08-0${i + 1}` }));
    expect(adHocCandidates(rows, { exclude: new Set(["chipotle bowl"]) })).toEqual([]);
  });

  it("ignores blank names rather than proposing an unnamed meal", () => {
    const rows = Array.from({ length: 4 }, (_, i) => log({ name: "   ", date: `2026-08-0${i + 1}` }));
    expect(adHocCandidates(rows)).toEqual([]);
  });

  it("most eaten first", () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => log({ name: "Burrito", date: `2026-08-0${i + 1}` })),
      ...Array.from({ length: 5 }, (_, i) => log({ name: "Pizza", date: `2026-07-0${i + 1}` })),
    ];
    expect(adHocCandidates(rows).map((c) => c.name)).toEqual(["Pizza", "Burrito"]);
  });
});

describe("adHocSummary", () => {
  it("says how often and roughly how big", () => {
    const [c] = adHocCandidates(Array.from({ length: 6 }, (_, i) => log({ date: `2026-08-0${i + 1}` })));
    expect(adHocSummary(c)).toBe("6× logged · ~900 cal");
  });

  it("omits calories it does not have", () => {
    const [c] = adHocCandidates(
      Array.from({ length: 3 }, (_, i) => log({ calories: null, date: `2026-08-0${i + 1}` })),
    );
    expect(adHocSummary(c)).toBe("3× logged");
  });
});

import { buildNutritionLabel, DAILY_VALUES, type LabelSource } from "../nutritionLabel";

const src = (over: Partial<LabelSource> = {}): LabelSource => ({
  serving_size: "1 bowl (210g)",
  calories: 290,
  protein: 6,
  carbs: 67,
  fats: 0.5,
  sugars: null,
  ...over,
});

describe("buildNutritionLabel", () => {
  it("keeps the regulated panel order: fat, carbohydrate, sugars, protein", () => {
    const label = buildNutritionLabel(src({ sugars: 2 }));
    expect(label.rows.map((r) => r.label)).toEqual([
      "Total Fat", "Total Carbohydrate", "Total Sugars", "Protein",
    ]);
  });

  it("computes %DV from the FDA reference amounts", () => {
    const label = buildNutritionLabel(src());
    expect(label.rows.find((r) => r.label === "Total Fat")?.dv)
      .toBe(Math.round((0.5 / DAILY_VALUES.totalFat) * 100));
    expect(label.rows.find((r) => r.label === "Total Carbohydrate")?.dv)
      .toBe(Math.round((67 / DAILY_VALUES.totalCarbohydrate) * 100));
  });

  it("matches the printed panel on the real product", () => {
    // The bibigo rice panel: 0.5g fat = 1%, 67g carbohydrate = 24%.
    const label = buildNutritionLabel(src());
    expect(label.rows.find((r) => r.label === "Total Fat")?.dv).toBe(1);
    expect(label.rows.find((r) => r.label === "Total Carbohydrate")?.dv).toBe(24);
  });

  it("prints no %DV for protein or total sugars", () => {
    // Protein's is optional and conventionally omitted; sugars' is defined
    // only for the ADDED portion, which this column cannot distinguish.
    const label = buildNutritionLabel(src({ sugars: 5 }));
    expect(label.rows.find((r) => r.label === "Protein")?.dv).toBeNull();
    expect(label.rows.find((r) => r.label === "Total Sugars")?.dv).toBeNull();
  });

  it("indents sub-nutrients only", () => {
    const label = buildNutritionLabel(src({ sugars: 5 }));
    expect(label.rows.find((r) => r.label === "Total Sugars")?.indented).toBe(true);
    expect(label.rows.find((r) => r.label === "Total Fat")?.indented).toBeUndefined();
  });

  it("omits rows it has no value for rather than printing zero", () => {
    // A missing figure is not a zero figure — a panel is read literally.
    const label = buildNutritionLabel(src({ fats: null, sugars: null }));
    expect(label.rows.map((r) => r.label)).toEqual(["Total Carbohydrate", "Protein"]);
    expect(label.missing).toContain("total fat");
  });

  it("keeps a genuine zero", () => {
    const label = buildNutritionLabel(src({ fats: 0 }));
    expect(label.rows.find((r) => r.label === "Total Fat")?.amount).toBe("0g");
  });

  it("always names the nutrients a real panel carries and we do not", () => {
    const label = buildNutritionLabel(src());
    expect(label.missing).toEqual(expect.arrayContaining([
      "saturated fat", "trans fat", "cholesterol", "sodium", "dietary fiber",
      "added sugars", "vitamin D", "calcium", "iron", "potassium",
    ]));
  });

  it("drops a trailing .0 but keeps a real decimal", () => {
    expect(buildNutritionLabel(src({ fats: 6.0 })).rows[0].amount).toBe("6g");
    expect(buildNutritionLabel(src({ fats: 0.5 })).rows[0].amount).toBe("0.5g");
  });

  it("is empty only when there is nothing at all to show", () => {
    expect(buildNutritionLabel({
      serving_size: null, calories: null, protein: null, carbs: null, fats: null, sugars: null,
    }).isEmpty).toBe(true);
    // Calories alone is still worth a panel.
    expect(buildNutritionLabel({
      serving_size: null, calories: 290, protein: null, carbs: null, fats: null, sugars: null,
    }).isEmpty).toBe(false);
  });

  it("passes the serving size through untouched", () => {
    expect(buildNutritionLabel(src()).servingSize).toBe("1 bowl (210g)");
    expect(buildNutritionLabel(src({ serving_size: null })).servingSize).toBeNull();
  });
});

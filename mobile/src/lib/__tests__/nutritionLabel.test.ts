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

  it("names trans fat and cholesterol as missing whatever else it holds", () => {
    // Neither has a column anywhere, so no value can ever fill these two.
    const label = buildNutritionLabel(src({ saturated_fat_g: 6, sodium_mg: 480 }));
    expect(label.missing).toEqual(expect.arrayContaining(["trans fat", "cholesterol"]));
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

describe("buildNutritionLabel — dietary fiber", () => {
  it("sits between carbohydrate and sugars, where the panel prints it", () => {
    const label = buildNutritionLabel(src({ fiber_g: 9, sugars: 2 }));
    expect(label.rows.map((r) => r.label)).toEqual([
      "Total Fat", "Total Carbohydrate", "Dietary Fiber", "Total Sugars", "Protein",
    ]);
  });

  it("carries a real %DV, unlike total sugars", () => {
    // Thistle's Citrus Vanilla Cream Muesli: 10g fiber = 36% of 28g.
    const label = buildNutritionLabel(src({ fiber_g: 10 }));
    expect(label.rows.find((r) => r.label === "Dietary Fiber")?.dv).toBe(36);
  });

  it("is indented — it is a sub-nutrient of carbohydrate", () => {
    const label = buildNutritionLabel(src({ fiber_g: 9 }));
    expect(label.rows.find((r) => r.label === "Dietary Fiber")?.indented).toBe(true);
  });

  it("stops being named as missing once we hold a value", () => {
    expect(buildNutritionLabel(src()).missing).toContain("dietary fiber");
    expect(buildNutritionLabel(src({ fiber_g: 9 })).missing).not.toContain("dietary fiber");
  });

  it("treats an absent field the same as an explicit null", () => {
    // The add/preview routes build stub items that predate the column.
    expect(buildNutritionLabel(src({ fiber_g: null })).rows.map((r) => r.label))
      .toEqual(buildNutritionLabel(src()).rows.map((r) => r.label));
  });

  it("keeps a genuine zero fiber", () => {
    expect(buildNutritionLabel(src({ fiber_g: 0 })).rows.find((r) => r.label === "Dietary Fiber")?.amount)
      .toBe("0g");
  });
});

describe("buildNutritionLabel — saturated fat and sodium", () => {
  it("puts both where the regulated panel prints them", () => {
    // Saturated fat indents under total fat; sodium is a top-level row between
    // the fats and the carbohydrate block.
    const label = buildNutritionLabel(src({
      saturated_fat_g: 6, sodium_mg: 480, fiber_g: 9, sugars: 2,
    }));
    expect(label.rows.map((r) => r.label)).toEqual([
      "Total Fat", "Saturated Fat", "Sodium",
      "Total Carbohydrate", "Dietary Fiber", "Total Sugars", "Protein",
    ]);
  });

  it("prints sodium in milligrams, not grams", () => {
    const label = buildNutritionLabel(src({ sodium_mg: 480 }));
    expect(label.rows.find((r) => r.label === "Sodium")?.amount).toBe("480mg");
  });

  it("carries the FDA %DV for both", () => {
    // 6g of 20g saturated fat = 30%; 480mg of 2300mg sodium = 21%.
    const label = buildNutritionLabel(src({ saturated_fat_g: 6, sodium_mg: 480 }));
    expect(label.rows.find((r) => r.label === "Saturated Fat")?.dv).toBe(30);
    expect(label.rows.find((r) => r.label === "Sodium")?.dv).toBe(21);
  });

  it("indents saturated fat but not sodium", () => {
    const label = buildNutritionLabel(src({ saturated_fat_g: 6, sodium_mg: 480 }));
    expect(label.rows.find((r) => r.label === "Saturated Fat")?.indented).toBe(true);
    expect(label.rows.find((r) => r.label === "Sodium")?.indented).toBeUndefined();
  });

  it("stops naming each as missing once we hold a value", () => {
    expect(buildNutritionLabel(src()).missing).toContain("saturated fat");
    expect(buildNutritionLabel(src()).missing).toContain("sodium");
    expect(buildNutritionLabel(src({ saturated_fat_g: 6 })).missing).not.toContain("saturated fat");
    expect(buildNutritionLabel(src({ sodium_mg: 480 })).missing).not.toContain("sodium");
  });

  it("keeps a genuine zero of either", () => {
    const label = buildNutritionLabel(src({ saturated_fat_g: 0, sodium_mg: 0 }));
    expect(label.rows.find((r) => r.label === "Saturated Fat")?.amount).toBe("0g");
    expect(label.rows.find((r) => r.label === "Sodium")?.amount).toBe("0mg");
  });

  it("drops a trailing .0 on milligrams too", () => {
    // The column is NUMERIC(6,2), so a whole number arrives as 480.00.
    expect(buildNutritionLabel(src({ sodium_mg: 480.0 })).rows.find((r) => r.label === "Sodium")?.amount)
      .toBe("480mg");
    expect(buildNutritionLabel(src({ sodium_mg: 2.5 })).rows.find((r) => r.label === "Sodium")?.amount)
      .toBe("2.5mg");
  });

  it("treats an absent field the same as an explicit null", () => {
    expect(buildNutritionLabel(src({ saturated_fat_g: null, sodium_mg: null })).rows.map((r) => r.label))
      .toEqual(buildNutritionLabel(src()).rows.map((r) => r.label));
  });
});

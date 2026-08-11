import { mealsUsingConcepts } from "../useItUp";

const meals = [
  { name: "Protein Oatmeal Bowl", items: [{ conceptIds: ["oatmeal"] }, { conceptIds: ["banana"] }] },
  { name: "PB&J", items: [{ conceptIds: ["bread"] }, { conceptIds: ["pb"] }, { conceptIds: ["jelly"] }] },
  { name: "Mystery Meal", items: [{ conceptIds: [] }] },
];

describe("mealsUsingConcepts (sweep E6)", () => {
  it("names every meal with an ingredient sharing a concept", () => {
    expect(mealsUsingConcepts(["oatmeal"], meals)).toEqual(["Protein Oatmeal Bowl"]);
    expect(mealsUsingConcepts(["pb"], meals)).toEqual(["PB&J"]);
  });
  it("an item carrying several concepts matches through any of them", () => {
    expect(mealsUsingConcepts(["banana", "jelly"], meals))
      .toEqual(["Protein Oatmeal Bowl", "PB&J"]);
  });
  it("no concepts or no matches -> empty, never a guess", () => {
    expect(mealsUsingConcepts([], meals)).toEqual([]);
    expect(mealsUsingConcepts(["steak"], meals)).toEqual([]);
  });
  it("a meal is named once even when several ingredients match", () => {
    const m = [{ name: "Double", items: [{ conceptIds: ["a"] }, { conceptIds: ["a"] }] }];
    expect(mealsUsingConcepts(["a"], m)).toEqual(["Double"]);
  });
});

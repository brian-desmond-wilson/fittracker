import { mealFaceUrl, type FaceCandidate } from "../mealFace";

const item = (over: Partial<FaceCandidate> = {}): FaceCandidate => ({
  displayOrder: 0,
  imageUrl: null,
  calories: 100,
  ...over,
});

describe("mealFaceUrl", () => {
  it("returns null when nothing has a picture", () => {
    expect(mealFaceUrl([item(), item({ displayOrder: 1 })])).toBeNull();
  });

  it("is empty-safe", () => {
    expect(mealFaceUrl([])).toBeNull();
  });

  it("uses the only picture there is", () => {
    expect(mealFaceUrl([item(), item({ displayOrder: 1, imageUrl: "rice.jpg" })]))
      .toBe("rice.jpg");
  });

  it("picks the biggest contributor, not the first item", () => {
    // "Chicken and rice" photographed as its side of rice would be worse than
    // no picture: a wrong image reads as a fact.
    expect(mealFaceUrl([
      item({ displayOrder: 0, imageUrl: "rice.jpg", calories: 200 }),
      item({ displayOrder: 1, imageUrl: "chicken.jpg", calories: 400 }),
    ])).toBe("chicken.jpg");
  });

  it("breaks a calorie tie on display order, so the face never flickers", () => {
    expect(mealFaceUrl([
      item({ displayOrder: 1, imageUrl: "b.jpg", calories: 200 }),
      item({ displayOrder: 0, imageUrl: "a.jpg", calories: 200 }),
    ])).toBe("a.jpg");
  });

  it("ignores an item with no calories recorded when a rival has some", () => {
    expect(mealFaceUrl([
      item({ displayOrder: 0, imageUrl: "unknown.jpg", calories: null }),
      item({ displayOrder: 1, imageUrl: "known.jpg", calories: 50 }),
    ])).toBe("known.jpg");
  });

  it("treats an empty-string url as no picture", () => {
    expect(mealFaceUrl([item({ imageUrl: "" })])).toBeNull();
  });
});

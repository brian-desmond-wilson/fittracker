// TDD for the pure within-block reorder helper. No RN, no Supabase — it only
// rewrites item_order across the whole session so the day still reads in
// section (block) order after a drag within one block.
import { reorderBlock } from "../sessionReorder";
import type { SessionSection } from "../../types/daily";

type Row = { id: string; section: SessionSection; itemOrder: number };

// A session spanning three sections. item_order is one sequence across the
// day, already section-ordered (warmup 0-1, main 2-4, cooldown 5).
const session: Row[] = [
  { id: "w1", section: "warmup", itemOrder: 0 },
  { id: "w2", section: "warmup", itemOrder: 1 },
  { id: "m1", section: "main", itemOrder: 2 },
  { id: "m2", section: "main", itemOrder: 3 },
  { id: "m3", section: "main", itemOrder: 4 },
  { id: "c1", section: "cooldown", itemOrder: 5 },
];

// Helper: the ordered id list the result implies, sorted by itemOrder.
function idOrder(result: { id: string; itemOrder: number }[]): string[] {
  return [...result].sort((a, b) => a.itemOrder - b.itemOrder).map((r) => r.id);
}

describe("reorderBlock", () => {
  it("reorders a mid-session block, preserving the other sections", () => {
    // Move main to m3, m1, m2.
    const result = reorderBlock(session, "main", ["m3", "m1", "m2"]);
    expect(idOrder(result)).toEqual(["w1", "w2", "m3", "m1", "m2", "c1"]);
  });

  it("assigns a contiguous 0..n-1 sequence in section-rank order", () => {
    const result = reorderBlock(session, "main", ["m2", "m3", "m1"]);
    const orders = [...result].map((r) => r.itemOrder).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5]);
    // And the whole session comes back, one entry per item.
    expect(result).toHaveLength(session.length);
  });

  it("swaps first and last within a block", () => {
    const result = reorderBlock(session, "main", ["m3", "m2", "m1"]);
    expect(idOrder(result)).toEqual(["w1", "w2", "m3", "m2", "m1", "c1"]);
  });

  it("is a no-op for a single-item block", () => {
    const result = reorderBlock(session, "cooldown", ["c1"]);
    expect(idOrder(result)).toEqual(["w1", "w2", "m1", "m2", "m3", "c1"]);
  });

  it("keeps the target block's new internal order verbatim", () => {
    const result = reorderBlock(session, "warmup", ["w2", "w1"]);
    expect(idOrder(result)).toEqual(["w2", "w1", "m1", "m2", "m3", "c1"]);
  });

  it("orders sections by rank even when input rows are shuffled", () => {
    const shuffled = [...session].reverse();
    const result = reorderBlock(shuffled, "main", ["m1", "m2", "m3"]);
    expect(idOrder(result)).toEqual(["w1", "w2", "m1", "m2", "m3", "c1"]);
  });
});

describe("reorderBlock on a 2-hour day with two mains", () => {
  // Both mains explode into the `main` section; a drag inside the first must
  // leave the second's movements exactly where they were.
  const twoMains: Row[] = [
    { id: "w1", section: "warmup", itemOrder: 0 },
    { id: "a1", section: "main", itemOrder: 1 },
    { id: "a2", section: "main", itemOrder: 2 },
    { id: "a3", section: "main", itemOrder: 3 },
    { id: "b1", section: "main", itemOrder: 4 },
    { id: "b2", section: "main", itemOrder: 5 },
    { id: "c1", section: "cooldown", itemOrder: 6 },
  ];

  it("reorders the dragged main in place; the other main keeps its slot", () => {
    const result = reorderBlock(twoMains, "main", ["a3", "a1", "a2"]);
    expect(idOrder(result)).toEqual(["w1", "a3", "a1", "a2", "b1", "b2", "c1"]);
  });

  it("works for the second main too", () => {
    const result = reorderBlock(twoMains, "main", ["b2", "b1"]);
    expect(idOrder(result)).toEqual(["w1", "a1", "a2", "a3", "b2", "b1", "c1"]);
  });

  it("numbers the whole session 0..n-1 with no gaps", () => {
    const result = reorderBlock(twoMains, "main", ["b2", "b1"]);
    expect([...result].sort((a, b) => a.itemOrder - b.itemOrder).map((r) => r.itemOrder))
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

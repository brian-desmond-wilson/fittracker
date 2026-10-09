// Pure within-block reorder for the Today session. A drag inside one block
// hands us that block's new id order; this rewrites `item_order` across the
// WHOLE session so the day still reads in block (section) order. No RN, no
// Supabase — so it stays unit-testable under ts-jest.
import type { SessionSection } from "../types/daily";

// The section order the whole session is trained and shown in. This mirrors
// SECTION_RANK in lib/supabase/daily.ts verbatim; it is duplicated here rather
// than imported because that module pulls in the Supabase client (RN), which
// ts-jest can't resolve in a node test. types/daily.ts carries the type but no
// runtime rank, so a small constant is the only pure home for it. Keep in step
// with daily.ts.
const SECTION_RANK: Record<SessionSection, number> = {
  warmup: 0, mobility: 1, main: 2, accessory: 3, bfr: 4, cooldown: 5,
};

/** The minimum shape reorderBlock needs — the real StoredSessionItem has more. */
interface ReorderableItem {
  id: string;
  section: SessionSection;
  itemOrder: number;
}

/**
 * Recompute `item_order` for the whole session after a within-block drag.
 *
 * Every other section keeps its existing relative order; inside the target
 * section, the dragged block's items take the order `orderedIdsInBlock`
 * gives, in the slot that group already occupied. Items of the same section
 * that were NOT in the drag — a second main's movements, on a 2-hour day —
 * keep their places around it. Sections are then concatenated in
 * section-rank order and numbered 0..n-1, matching how renumberSessionItems
 * writes the sequence.
 */
export function reorderBlock<T extends ReorderableItem>(
  allItems: readonly T[],
  section: SessionSection,
  orderedIdsInBlock: readonly string[],
): { id: string; itemOrder: number }[] {
  const byId = new Map(allItems.map((i) => [i.id, i]));

  // The target block, in the caller's new order. Ignore any id that isn't
  // actually in this section — the drag can't cross blocks, but stay defensive.
  const targetOrdered = orderedIdsInBlock
    .map((id) => byId.get(id))
    .filter((i): i is T => i !== undefined && i.section === section);
  const dragged = new Set(targetOrdered.map((i) => i.id));

  // Distinct sections present, walked in rank order.
  const sections = Array.from(new Set(allItems.map((i) => i.section))).sort(
    (a, b) => (SECTION_RANK[a] ?? 99) - (SECTION_RANK[b] ?? 99),
  );

  const sequence: T[] = [];
  for (const s of sections) {
    const existing = allItems
      .filter((i) => i.section === s)
      .sort((a, b) => a.itemOrder - b.itemOrder);
    if (s !== section) {
      // Other sections keep their existing relative order.
      sequence.push(...existing);
      continue;
    }
    // The dragged group lands where its first member sat; everything else in
    // the section stays put around it.
    let placed = false;
    for (const item of existing) {
      if (!dragged.has(item.id)) {
        sequence.push(item);
        continue;
      }
      if (!placed) {
        sequence.push(...targetOrdered);
        placed = true;
      }
    }
    if (!placed) sequence.push(...targetOrdered);
  }

  return sequence.map((item, itemOrder) => ({ id: item.id, itemOrder }));
}

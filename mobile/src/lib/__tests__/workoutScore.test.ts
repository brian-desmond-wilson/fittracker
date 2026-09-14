import {
  formatScore, compareScores, bestScore, scoreHeight, trendScoreBars, trendScoreDirection,
  scoreSessionRows, parseClock, scoreFromRow, rowFromScore, isChartable,
} from "../workoutScore";
import type { Score, ScoredSession } from "../workoutScore";
import { splitDuration } from "../setTiming";

const rr = (rounds: number, reps: number): Score => ({ type: "rounds_reps", rounds, reps });
const t = (seconds: number, capped = false): Score => ({ type: "time", seconds, capped });
const load = (value: number): Score => ({ type: "load", value });
const q = (quality: "rough" | "solid" | "crisp"): Score => ({ type: "quality", quality });

const sess = (sessionId: string, sessionDate: string, score: Score | null): ScoredSession =>
  ({ sessionId, sessionDate, score });

describe("formatScore (spec §4.2)", () => {
  it("rounds + reps, dropping zero reps", () => {
    expect(formatScore(rr(6, 14))).toBe("6 + 14");
    expect(formatScore(rr(6, 0))).toBe("6");
  });
  it("time as m:ss, Capped when capped", () => {
    expect(formatScore(t(754))).toBe("12:34");
    expect(formatScore(t(3661))).toBe("1:01:01");
    expect(formatScore(t(900, true))).toBe("Capped");
  });
  it("units", () => {
    expect(formatScore({ type: "reps", value: 120 })).toBe("120 reps");
    expect(formatScore({ type: "reps", value: 1 })).toBe("1 rep");
    expect(formatScore(load(185))).toBe("185 lb");
    expect(formatScore({ type: "distance", value: 2000 })).toBe("2,000 m");
    expect(formatScore({ type: "calories", value: 50 })).toBe("50 cal");
    expect(formatScore({ type: "duration", value: 150 })).toBe("2:30");
    expect(formatScore({ type: "height", value: 24 })).toBe("24 in");
    expect(formatScore(q("crisp"))).toBe("Crisp");
  });
});

describe("compareScores (spec §5.2)", () => {
  it("rounds before reps", () => {
    expect(compareScores(rr(7, 0), rr(6, 30))).toBeGreaterThan(0);
    expect(compareScores(rr(6, 14), rr(6, 15))).toBeLessThan(0);
    expect(compareScores(rr(6, 14), rr(6, 14))).toBe(0);
  });
  it("time: lower wins; capped loses to any finish; two capped tie", () => {
    expect(compareScores(t(700), t(754))).toBeGreaterThan(0);
    expect(compareScores(t(900, true), t(1500))).toBeLessThan(0);
    expect(compareScores(t(900, true), t(900, true))).toBe(0);
  });
  it("higher wins for the counted types", () => {
    expect(compareScores(load(200), load(185))).toBeGreaterThan(0);
    expect(compareScores({ type: "duration", value: 90 }, { type: "duration", value: 120 })).toBeLessThan(0);
  });
  it("quality: rough < solid < crisp", () => {
    expect(compareScores(q("crisp"), q("solid"))).toBeGreaterThan(0);
    expect(compareScores(q("rough"), q("solid"))).toBeLessThan(0);
  });
  it("mixed types throw", () => {
    expect(() => compareScores(rr(1, 0), t(10))).toThrow();
  });
});

describe("bestScore", () => {
  it("ties go to the earliest", () => {
    const rows = [sess("a", "2026-09-01", load(185)), sess("b", "2026-09-05", load(185)), sess("c", "2026-09-09", load(180))];
    expect(bestScore(rows)?.sessionId).toBe("a");
  });
  it("null with no scores", () => {
    expect(bestScore([sess("a", "2026-09-01", null)])).toBeNull();
  });
  it("ignores rows whose type differs from the first scored row", () => {
    const rows = [sess("a", "2026-09-01", load(185)), sess("b", "2026-09-05", t(600))];
    expect(bestScore(rows)?.sessionId).toBe("a");
  });
});

describe("scoreHeight: taller is better", () => {
  it("higher-wins types scale to the max", () => {
    const w = [load(100), load(200)];
    expect(scoreHeight(load(100), w)).toBeCloseTo(0.5);
    expect(scoreHeight(load(200), w)).toBe(1);
  });
  it("time: fastest is 1, capped sits at 0.15", () => {
    const w = [t(600), t(1200), t(900, true)];
    expect(scoreHeight(t(600), w)).toBe(1);
    expect(scoreHeight(t(1200), w)).toBeCloseTo(0.5);
    expect(scoreHeight(t(900, true), w)).toBe(0.15);
  });
  it("rounds_reps keeps lexicographic order", () => {
    const w = [rr(6, 14), rr(7, 0)];
    expect(scoreHeight(rr(7, 0), w)).toBe(1);
    expect(scoreHeight(rr(6, 14), w)).toBeLessThan(1);
    expect(scoreHeight(rr(6, 14), w)).toBeGreaterThan(0.8);
  });
  it("quality is not chartable", () => {
    expect(isChartable("quality")).toBe(false);
    expect(isChartable("time")).toBe(true);
  });
});

describe("trendScoreBars / trendScoreDirection", () => {
  const ten = Array.from({ length: 10 }, (_, i) =>
    sess(`s${i}`, `2026-08-${String(i + 1).padStart(2, "0")}`, load(100 + i * 10)));
  it("last eight scored sessions, oldest left, best flagged", () => {
    const bars = trendScoreBars(ten);
    expect(bars.length).toBe(8);
    expect(bars[0].sessionId).toBe("s2");
    expect(bars[7].best).toBe(true);
    expect(bars[7].height).toBe(1);
  });
  it("unscored sessions are skipped, not drawn as zero", () => {
    const rows = [sess("a", "2026-09-01", load(100)), sess("b", "2026-09-02", null), sess("c", "2026-09-03", load(120))];
    expect(trendScoreBars(rows).map((b) => b.sessionId)).toEqual(["a", "c"]);
  });
  it("direction: null under three, up/down/steady vs the median of the earlier bars", () => {
    expect(trendScoreDirection(ten.slice(0, 2))).toBeNull();
    expect(trendScoreDirection(ten)).toBe("up");
    const down = [sess("a", "2026-09-01", t(600)), sess("b", "2026-09-02", t(620)), sess("c", "2026-09-03", t(700))];
    expect(trendScoreDirection(down)).toBe("down");
    const steady = [sess("a", "2026-09-01", load(100)), sess("b", "2026-09-02", load(100)), sess("c", "2026-09-03", load(100))];
    expect(trendScoreDirection(steady)).toBe("steady");
  });
});

describe("scoreSessionRows: newest first, PR when it beat every earlier score", () => {
  it("first is a baseline, later records are PRs, a capped time never is", () => {
    const rows = [
      sess("a", "2026-09-01", t(800)), sess("b", "2026-09-02", t(700)),
      sess("c", "2026-09-03", t(900, true)), sess("d", "2026-09-04", null), sess("e", "2026-09-05", t(650)),
    ];
    const out = scoreSessionRows(rows);
    expect(out.map((r) => r.sessionId)).toEqual(["e", "d", "c", "b", "a"]);
    expect(out.map((r) => r.isPr)).toEqual([true, false, false, true, false]);
  });
});

describe("parseClock", () => {
  it("minutes and seconds to seconds; blanks, junk and 0:00 are null", () => {
    expect(parseClock("12", "34")).toBe(754);
    expect(parseClock("", "45")).toBe(45);
    expect(parseClock("1", "")).toBe(60);
    expect(parseClock("", "")).toBeNull();
    expect(parseClock("0", "0")).toBeNull();
    expect(parseClock("ab", "cd")).toBeNull();
    expect(parseClock("1", "75")).toBe(135);
  });

  it("round-trips with splitDuration — the prefill/save inverse the score sheet relies on", () => {
    for (const seconds of [45, 60, 135, 754, 3661]) {
      const { mins, secs } = splitDuration(seconds);
      expect(parseClock(String(mins), String(secs))).toBe(seconds);
    }
  });
});

describe("row <-> score", () => {
  it("round-trips every shape", () => {
    const cases: Score[] = [rr(6, 14), t(754), t(900, true), load(185), { type: "distance", value: 2000 }, q("solid")];
    for (const s of cases) expect(scoreFromRow(rowFromScore(s))).toEqual(s);
  });
  it("rejects a malformed row", () => {
    expect(scoreFromRow({ score_type: "rounds_reps", value_a: 6, value_b: null, quality: null, capped: false })).toBeNull();
    expect(scoreFromRow({ score_type: "bogus", value_a: 1, value_b: null, quality: null, capped: false })).toBeNull();
  });
});

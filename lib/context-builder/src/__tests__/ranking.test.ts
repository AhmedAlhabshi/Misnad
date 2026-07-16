import assert from "node:assert/strict";
import { clampRelevanceScore, dedupeAndRank } from "../ranking";

export async function run(): Promise<void> {
  // --- Clamping ---
  {
    assert.equal(clampRelevanceScore(1.35), 1);
    assert.equal(clampRelevanceScore(-0.2), 0);
    assert.equal(clampRelevanceScore(0.42), 0.42);
    assert.equal(clampRelevanceScore(Number.NaN), 0);
  }
  console.log("PASS clampRelevanceScore bounds scores into [0, 1] without rescaling");

  // --- Ranking by relevance, descending ---
  {
    const items = [
      { id: "a", relevanceScore: 0.2 },
      { id: "b", relevanceScore: 0.9 },
      { id: "c", relevanceScore: 0.5 },
    ];
    const ranked = dedupeAndRank(items, (item) => item.id, 10);
    assert.deepEqual(ranked.map((item) => item.id), ["b", "c", "a"]);
  }
  console.log("PASS dedupeAndRank sorts by relevanceScore descending");

  // --- Stable ordering for equal scores ---
  {
    const items = [
      { id: "first", relevanceScore: 0.5 },
      { id: "second", relevanceScore: 0.5 },
      { id: "third", relevanceScore: 0.5 },
    ];
    const ranked = dedupeAndRank(items, (item) => item.id, 10);
    assert.deepEqual(ranked.map((item) => item.id), ["first", "second", "third"], "equal scores must keep original relative order");
  }
  console.log("PASS dedupeAndRank keeps stable ordering for equal relevance scores");

  // --- Duplicate removal ---
  {
    const items = [
      { id: "dup", relevanceScore: 0.4 },
      { id: "dup", relevanceScore: 0.9 },
      { id: "unique", relevanceScore: 0.1 },
    ];
    const ranked = dedupeAndRank(items, (item) => item.id, 10);
    assert.equal(ranked.length, 2, "duplicate dedupeKey entries must collapse to one");
    assert.equal(ranked[0].id, "dup");
    assert.equal(ranked[0].relevanceScore, 0.9, "the higher-scoring occurrence must be the one kept");
  }
  console.log("PASS dedupeAndRank removes duplicates by dedupeKey, keeping the highest-ranked occurrence");

  // --- Configurable limit ---
  {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}`, relevanceScore: 1 - i * 0.01 }));
    const ranked = dedupeAndRank(items, (item) => item.id, 3);
    assert.equal(ranked.length, 3);
    assert.deepEqual(ranked.map((item) => item.id), ["item-0", "item-1", "item-2"]);
  }
  console.log("PASS dedupeAndRank respects a configurable limit");

  console.log("PASS ranking.test.ts");
}

run();

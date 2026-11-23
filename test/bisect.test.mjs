import { test } from "node:test";
import assert from "node:assert";
import B from "../bisect.js";

// 必要額 w の人は「X >= w なら転勤ありを選ぶ」と答える
function run(w){
  const h = [];
  let x;
  while ((x = B.nextAmount(h)) !== null) h.push(x >= w);
  return h;
}

test("1つの人生あたり3問で終わる", () => {
  for (const w of [-50, 10, 60, 99, 120, 250, 1000]) assert.equal(run(w).length, 3);
});

test("最初は100万円、次は50万円か200万円", () => {
  assert.equal(B.nextAmount([]), 100);
  assert.equal(B.nextAmount([true]), 50);
  assert.equal(B.nextAmount([false]), 200);
});

test("求めた範囲に本当の必要額が入る", () => {
  for (let w = -100; w <= 600; w += 7) {
    const iv = B.interval(run(w));
    if (iv.lo !== null) assert.ok(w > iv.lo, `w=${w} lo=${iv.lo}`);
    if (iv.hi !== null) assert.ok(w <= iv.hi, `w=${w} hi=${iv.hi}`);
  }
});

test("8通りの答え方が8つの区間に対応する", () => {
  const seen = new Set();
  for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false])
    seen.add(JSON.stringify(B.interval([a, b, c])));
  assert.equal(seen.size, 8);
  assert.deepEqual(B.interval([true, true, true]), { lo: null, hi: 25 });
  assert.deepEqual(B.interval([false, false, false]), { lo: 300, hi: null });
  assert.deepEqual(B.interval([true, false, false]), { lo: 75, hi: 100 });
});

test("比較：子育ての範囲が独身より上なら1、同じなら0", () => {
  assert.equal(B.compare({ lo: 50, hi: 75 }, { lo: 150, hi: 200 }), 1);
  assert.equal(B.compare({ lo: 150, hi: 200 }, { lo: null, hi: 25 }), -1);
  assert.equal(B.compare({ lo: 75, hi: 100 }, { lo: 75, hi: 100 }), 0);
  assert.equal(B.compare({ lo: 300, hi: null }, { lo: 300, hi: null }), 0);
});

test("文章：上限なし・下限なしの表現", () => {
  assert.match(B.describe({ lo: null, hi: 25 }).sentence, /以下/);
  assert.match(B.describe({ lo: 300, hi: null }).sentence, /転勤なしを選ぶ/);
  assert.match(B.describe({ lo: 75, hi: 100 }).monthly, /月約6〜8万円/);
});

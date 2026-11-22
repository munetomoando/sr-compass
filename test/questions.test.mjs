import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../questions.json", import.meta.url)));
const { meta, questions } = data;
const mainsA = questions.filter(q => q.scored && q.scenario === "A");
const mainsB = questions.filter(q => q.scored && q.scenario === "B");

test("各シナリオ10問・練習1・支配1の構成", () => {
  assert.equal(mainsA.length, 10);
  assert.equal(mainsB.length, 10);
  assert.equal(questions.filter(q => q.type === "practice").length, 1);
  assert.equal(questions.filter(q => q.type === "dominant").length, 1);
});

test("メタにシナリオ定義がある", () => {
  assert.deepEqual(meta.framing.scenarios, ["single_no_plan", "married_one_child"]);
});

test("各ブロック単独で全6属性が十分に分岐する（5〜9回）", () => {
  for (const mains of [mainsA, mainsB]) {
    for (const a of meta.attribute_order) {
      const n = mains.filter(q => q.A[a] !== q.B[a]).length;
      assert.ok(n >= 5 && n <= 9, `${a} の分岐 ${n} が範囲外`);
    }
  }
});

test("年収は定義済みの5水準（300〜900万）だけを使う", () => {
  const levels = Object.keys(meta.attributes.income.levels);
  assert.deepEqual(levels, ["300", "450", "600", "750", "900"]);
  for (const q of [...mainsA, ...mainsB]) {
    assert.ok(levels.includes(q.A.income) && levels.includes(q.B.income), `${q.id} の年収水準が範囲外`);
  }
});

// 設問を数値の差分ベクトルにする（年収は100万円単位、二値は良い=1）
const GOODV = { location: "なし", hours: "少", remote: "可", growth: "大", stability: "安定" };
const diff = q => meta.attribute_order.map(a => a === "income"
  ? (+q.A.income - +q.B.income) / 100 : ((q.A[a] === GOODV[a]) - (q.B[a] === GOODV[a])));

test("2つの人生で同じ組を使い、bはaの左右を入れ替えた見た目違い（差分は符号反転で一致）", () => {
  for (let i = 0; i < 10; i++) {
    const a = mainsA[i], b = mainsB[i];
    assert.equal(a.pair, b.pair);
    assert.deepEqual(diff(b), diff(a).map(v => (v === 0 ? 0 : -v)), `${a.id} と ${b.id} の差分が一致しない`);
    assert.notDeepEqual(b.A, a.B, `${b.id} が ${a.id} の単純な左右入れ替えになっている（見た目も変える）`);
  }
});

test("年収差450万円以上の組を2つ以上含む（大きな価値も測れる）", () => {
  assert.ok(mainsA.filter(q => Math.abs(+q.A.income - +q.B.income) >= 450).length >= 2);
});

test("属性どうしの相関が強すぎない（|r|<0.5）", () => {
  const X = mainsA.map(diff), p = X[0].length;
  const col = j => X.map(r => r[j]);
  const corr = (x, y) => { const mx = x.reduce((a, b) => a + b) / x.length, my = y.reduce((a, b) => a + b) / y.length;
    let sxy = 0, sx = 0, sy = 0; x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sx += (v - mx) ** 2; sy += (y[i] - my) ** 2; });
    return sxy / Math.sqrt(sx * sy); };
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
    const r = corr(col(i), col(j));
    assert.ok(Math.abs(r) < 0.5, `${meta.attribute_order[i]}×${meta.attribute_order[j]} の相関 ${r.toFixed(2)}`);
  }
});

test("属性の表記に「地元」「大手」「ベンチャー」を含まない", () => {
  const text = JSON.stringify(meta.attributes);
  for (const w of ["地元", "大手", "ベンチャー"]) assert.ok(!text.includes(w), `${w} が残っている`);
});

test("本番に支配ペア（トレードオフ無し）が無い", () => {
  const GOOD = { location: "なし", hours: "少", remote: "可", growth: "大", stability: "安定" };
  const better = (attr, a, b) => attr === "income"
    ? (+a.income >= +b.income ? "A" : "B")
    : (a[attr] === GOOD[attr] ? "A" : (b[attr] === GOOD[attr] ? "B" : null));
  for (const q of [...mainsA, ...mainsB]) {
    const ds = meta.attribute_order.filter(k => q.A[k] !== q.B[k]);
    const sides = ds.map(k => better(k, q.A, q.B));
    assert.ok(!(sides.every(s => s === "A") || sides.every(s => s === "B")), `${q.id} が支配的`);
  }
});

test("支配選択qdはAが全属性で良い・採点対象外", () => {
  const q = questions.find(q => q.type === "dominant");
  const GOOD = { location: "なし", hours: "少", remote: "可", growth: "大", stability: "安定" };
  assert.ok(+q.A.income > +q.B.income);
  for (const a of ["location", "hours", "remote", "growth", "stability"]) assert.equal(q.A[a], GOOD[a]);
  assert.equal(q.scored, false);
});

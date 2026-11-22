import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import E from "../estimate.js";

const data = JSON.parse(readFileSync(new URL("../questions.json", import.meta.url)));
const { meta, questions } = data;

function choiceA(q){
  if (+q.A.income !== +q.B.income) return +q.A.income > +q.B.income ? "A" : "B";
  return "A";
}
function choiceB(q){
  for (const k of ["remote","hours","location"]) {
    const good = {remote:"可",hours:"少",location:"なし"}[k];
    if (q.A[k] === good && q.B[k] !== good) return "A";
    if (q.B[k] === good && q.A[k] !== good) return "B";
  }
  return +q.A.income > +q.B.income ? "A" : "B";
}
function synth(){
  return questions.filter(q => q.scored).map(q => ({
    q_id: q.id,
    choice: q.scenario === "A" ? choiceA(q) : choiceB(q),
    response_ms: 5000,
    scenario: q.scenario
  }));
}

test("estimate2 は beta_A/beta_B/gamma/mrs/delta を返す", () => {
  const r = E.estimate2(questions, meta, synth());
  for (const a of meta.attribute_order) {
    assert.ok(Number.isFinite(r.beta_A[a]), `beta_A.${a}`);
    assert.ok(Number.isFinite(r.beta_B[a]), `beta_B.${a}`);
    assert.ok(Number.isFinite(r.gamma[a]), `gamma.${a}`);
  }
  assert.ok("mrs_A_manyen" in r && "mrs_B_manyen" in r && "delta_wtp_manyen" in r);
  assert.ok(typeof r.scale_diff === "number");
  assert.equal(typeof r.fallback_constrained, "boolean");
});

test("育児シナリオで在宅の価値が上がる（gamma.remote>0, delta.remote>0）", () => {
  const r = E.estimate2(questions, meta, synth());
  assert.ok(r.gamma.remote > 0, `gamma.remote=${r.gamma.remote}`);
  if (r.mrs_A_manyen.remote !== null && r.mrs_B_manyen.remote !== null) {
    assert.ok(r.delta_wtp_manyen.remote > 0, `delta.remote=${r.delta_wtp_manyen.remote}`);
  }
});

test("MRSは ±clip（既定600）でクリップされ 5万円刻み", () => {
  const r = E.estimate2(questions, meta, synth());
  assert.equal(r.clip, 600);
  for (const m of [r.mrs_A_manyen, r.mrs_B_manyen]) {
    for (const a of Object.keys(m)) {
      if (m[a] === null) continue;
      assert.ok(m[a] >= -600 && m[a] <= 600);
      assert.equal(m[a] % 5, 0);
    }
  }
});

test("交互作用を4属性に限定したフォールバックでは gamma.income/growth が0", () => {
  const r = E.estimate2(questions, meta, synth(), { forceConstrained: true });
  assert.equal(r.gamma.income, 0);
  assert.equal(r.gamma.growth, 0);
  assert.equal(r.fallback_constrained, true);
});

test("既定では切片を置かず、本体・変化とも罰則0.5", () => {
  assert.deepEqual(E.DEFAULTS, { intercept: false, penMain: 0.5, penInter: 0.5, clip: 600 });
});

test("真の選好（転勤なし 独身100万→子育て200万）を、多数の回答者の平均でおおむね回復する", () => {
  // 決定論的な乱数で 400 人分を作り、推定の中央値が真値の方向に出ることを確かめる
  let s = 7;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const bA = { income: 1, location: 1, hours: .5, remote: .3, growth: .3, stability: .5 };
  const bB = Object.assign({}, bA, { location: 2 });
  const mains = questions.filter(q => q.scored);
  const locA = [], dLoc = [];
  for (let r = 0; r < 400; r++) {
    const ans = mains.map(q => {
      const b = q.scenario === "B" ? bB : bA, d = E.designRow(meta, q);
      let u = 0; meta.attribute_order.forEach((a, i) => u += b[a] * d[i]);
      return { q_id: q.id, choice: rnd() < 1 / (1 + Math.exp(-u)) ? "A" : "B", scenario: q.scenario };
    });
    const e = E.estimate2(questions, meta, ans);
    if (e.mrs_A_manyen.location === null || e.mrs_B_manyen.location === null) continue;
    locA.push(e.mrs_A_manyen.location); dLoc.push(e.delta_wtp_manyen.location);
  }
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  assert.ok(med(locA) >= 60 && med(locA) <= 140, `独身の転勤なし 中央値 ${med(locA)}`);
  assert.ok(med(dLoc) >= 30, `変化の中央値 ${med(dLoc)}（小さく出すぎ）`);
});

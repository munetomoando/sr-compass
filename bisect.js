/* bisect.js — 追加設問：転勤を引き受けるのに必要な上乗せ額を二分法で絞り込む（純関数・テスト可能）
 *   「転勤あり・年収600+X万」vs「転勤なし・年収600万」（ほかの条件は同じ）を3回尋ねる。
 *   X は 100 → 50/200 → 25/75/150/300 と、答えに応じて変える。
 *   転勤ありを選んだ（accept=true）なら必要額は X 以下、選ばなかったなら X 超。
 */
(function (root, factory){
  const api=factory();
  if (typeof module!=="undefined" && module.exports) module.exports=api;
  if (typeof window!=="undefined") window.ValueCompassBisect=api;
})(this, function(){
  "use strict";
  const BASE = 600;          // 基準の年収（万円）
  const STEPS = 3;           // 1つの人生あたりの問題数
  // 二分木：キーはそれまでの回答列（1=転勤ありを選んだ, 0=選ばなかった）
  const TREE = { "":100, "1":50, "0":200, "11":25, "10":75, "01":150, "00":300 };

  function key(hist){ return hist.map(function(a){ return a ? "1" : "0"; }).join(""); }

  // 次に尋ねる上乗せ額（万円/年）。終わっていれば null。
  function nextAmount(hist){
    if (hist.length >= STEPS) return null;
    return TREE[key(hist)];
  }

  // 3問の答えから、必要な上乗せ額の範囲 {lo, hi}（万円/年）。lo=null は下限なし、hi=null は上限なし。
  function interval(hist){
    let lo = null, hi = null;
    for (let i = 0; i < hist.length; i++){
      const x = TREE[key(hist.slice(0, i))];
      if (hist[i]) { if (hi === null || x < hi) hi = x; }
      else { if (lo === null || x > lo) lo = x; }
    }
    return { lo: lo, hi: hi };
  }

  // 範囲を年額・月額の文章にする
  function describe(iv){
    const m = function(v){ return Math.round(v / 12); };
    if (iv.lo === null) return { short: `年${iv.hi}万円以下`, monthly: `月約${m(iv.hi)}万円以下`,
      sentence: `年${iv.hi}万円（月約${m(iv.hi)}万円）以下の上乗せで、転勤ありを引き受ける` };
    if (iv.hi === null) return { short: `年${iv.lo}万円超`, monthly: `月約${m(iv.lo)}万円超`,
      sentence: `年${iv.lo}万円（月約${m(iv.lo)}万円）上乗せされても、転勤なしを選ぶ` };
    return { short: `年${iv.lo}〜${iv.hi}万円`, monthly: `月約${m(iv.lo)}〜${m(iv.hi)}万円`,
      sentence: `年${iv.lo}〜${iv.hi}万円（月約${m(iv.lo)}〜${m(iv.hi)}万円）の上乗せがあれば、転勤ありを引き受ける` };
  }

  // 2つの範囲の比較：B（子育て）が A（独身）より上なら 1、下なら -1、重なる・同じなら 0
  function compare(a, b){
    const top = function(iv){ return iv.hi === null ? Infinity : iv.hi; };
    const bot = function(iv){ return iv.lo === null ? -Infinity : iv.lo; };
    if (bot(b) >= top(a)) return 1;
    if (bot(a) >= top(b)) return -1;
    return 0;
  }

  return { BASE, STEPS, TREE, nextAmount, interval, describe, compare };
});

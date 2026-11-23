/* sequence.js — 設問シーケンス組み立て（純関数・テスト可能） */
(function (root, factory){
  const api=factory();
  if (typeof module!=="undefined" && module.exports) module.exports=api;
  if (typeof window!=="undefined") window.ValueCompassSequence=api;
})(this, function(){
  "use strict";
  function shuffle(arr, rnd){
    const a=arr.slice();
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  // rnd: ()=>[0,1) の乱数。テスト用に注入可能。
  function buildSequence(questions, rnd){
    rnd = rnd || Math.random;
    const practice = questions.find(q=>q.type==="practice");
    const dominant = questions.find(q=>q.type==="dominant");
    const A = shuffle(questions.filter(q=>q.type==="main" && q.scenario==="A"), rnd);
    const B = shuffle(questions.filter(q=>q.type==="main" && q.scenario==="B"), rnd);
    // 研修版：独身（A）→ 既婚・子ども1人（B）の順に固定（回答者にとって自然な時間の流れ）
    const block1 = A.slice();
    const pos = 4 + Math.floor(rnd()*3);
    block1.splice(pos, 0, dominant);
    return [practice, ...block1, ...B];
  }
  return { buildSequence, shuffle };
});

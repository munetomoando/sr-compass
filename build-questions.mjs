// 設問生成（研修版 v0.4）
//   - 10組のペアを D最適（事前β下の局所D効率）で選ぶ
//   - 同じ10組を2つの人生（A=独身, B=子育て）で共通に使う（人生の違いと設問の違いを分離するため）
//   - Bでは左右を入れ替え、差がない属性の水準と年収の基準額を変えて、見た目を別の設問にする
//     （差分ベクトルは符号以外同一＝推定上は同じ情報量）
// 使い方: node build-questions.mjs
import { writeFileSync } from "node:fs";

// 決定論PRNG — mulberry32
function rng(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const INCOME = ["300","450","600","750","900"];
const META = {
  app_version: "0.4-sr",
  framing: {
    income_anchor: "age30_gross",
    scenarios: ["single_no_plan", "married_one_child"],
    note: "年収はその仕事に就いた30歳頃の額面。転勤・在宅などはその仕事がずっと持つ特徴。各シナリオの家族設定でどう感じるかを率直に選んでください。",
    design: "2つの人生で同じ10組（D最適）を使い、2回目は左右と見た目の水準を入れ替える"
  },
  attributes: {
    income:   { label:"年収", unit:"万円", levels:Object.fromEntries(INCOME.map(v=>[v,`年収${v}万`])), kind:"continuous", good:"max" },
    location: { label:"勤務地・転勤", levels:{ "なし":"転勤なし（今の地域で働き続ける）", "あり":"転勤あり（全国）" }, kind:"binary", good:"なし" },
    hours:    { label:"労働時間", levels:{ "少":"残業少（〜月10h）", "多":"残業多（〜月45h）" }, kind:"binary", good:"少" },
    remote:   { label:"在宅勤務", levels:{ "可":"在宅可", "不可":"出社のみ" }, kind:"binary", good:"可" },
    growth:   { label:"成長・裁量", levels:{ "大":"裁量大・成長機会多", "小":"言われた業務中心" }, kind:"binary", good_nominal:"大", subjective:true },
    stability:{ label:"雇用の安定", levels:{ "安定":"雇用が安定", "不安定":"雇用が不安定（業績次第で人員整理も）" }, kind:"binary", good_nominal:"安定", subjective:true }
  },
  attribute_order: ["income","location","hours","remote","growth","stability"]
};

const BIN = { location:["なし","あり"], hours:["少","多"], remote:["可","不可"], growth:["大","小"], stability:["安定","不安定"] };
const BIN_KEYS = Object.keys(BIN);
const GOOD = { location:"なし", hours:"少", remote:"可", growth:"大", stability:"安定" };
const ORDER = META.attribute_order;
// 局所D最適の事前β（100万円あたり。WTP: 転勤なし100万、残業少67万、在宅50万、裁量50万、安定67万）
const PRIOR = { income:0.6, location:0.6, hours:0.4, remote:0.3, growth:0.3, stability:0.4 };

function diffRow(a,b){
  return ORDER.map(k => k==="income" ? (+a.income - +b.income)/100 : ((a[k]===GOOD[k])-(b[k]===GOOD[k])));
}
function isDominant(d){
  const nz = d.filter(v=>v!==0);
  return nz.length===0 || nz.every(v=>v>0) || nz.every(v=>v<0);
}
function randProfile(r){
  const p = { income: INCOME[Math.floor(r()*INCOME.length)] };
  for(const k of BIN_KEYS) p[k] = BIN[k][Math.floor(r()*2)];
  return p;
}
function candidatePool(r, n){
  const pool=[];
  while(pool.length<n){
    const a=randProfile(r), b=randProfile(r), d=diffRow(a,b);
    const nDiff=d.filter(v=>v!==0).length;
    if(nDiff>=2 && nDiff<=4 && !isDominant(d)) pool.push({A:a,B:b,d});
  }
  return pool;
}

// log det(X' W X)（W=p(1-p), p は事前βの下での選択確率）
function logDet(M){
  const n=M.length, A=M.map(r=>r.slice()); let ld=0;
  for(let c=0;c<n;c++){
    let piv=c; for(let r=c+1;r<n;r++) if(Math.abs(A[r][c])>Math.abs(A[piv][c])) piv=r;
    if(Math.abs(A[piv][c])<1e-12) return -Infinity;
    [A[c],A[piv]]=[A[piv],A[c]];
    ld+=Math.log(Math.abs(A[c][c]));
    for(let r=c+1;r<n;r++){ const f=A[r][c]/A[c][c]; for(let j=c;j<n;j++) A[r][j]-=f*A[c][j]; }
  }
  return ld;
}
function infoLogDet(set){
  const p=ORDER.length, M=Array.from({length:p},()=>new Array(p).fill(0));
  for(const q of set){
    let u=0; ORDER.forEach((k,i)=>u+=PRIOR[k]*q.d[i]);
    const pr=1/(1+Math.exp(-u)), w=pr*(1-pr);
    for(let i=0;i<p;i++) for(let j=0;j<p;j++) M[i][j]+=w*q.d[i]*q.d[j];
  }
  return logDet(M);
}
function balanceOK(set){
  for(const k of ORDER){
    const n=set.filter(q=>q.d[ORDER.indexOf(k)]!==0).length;
    if(k==="income" ? n<7 : k==="location" ? (n<6 || n>8) : (n<5 || n>8)) return false;
  }
  // 大きなWTP（「いくら積まれても嫌」に近い人）も識別できるよう、年収差450万円以上の組を2つ以上含める
  if(set.filter(q=>Math.abs(q.d[0])>=4.5).length<2) return false;
  return true;
}

function optimise(seed, size){
  const r=rng(seed), pool=candidatePool(r, 4000);
  let best=null, bestVal=-Infinity;
  for(let start=0; start<30; start++){
    let set=[]; while(set.length<size) set.push(pool[Math.floor(r()*pool.length)]);
    let val = balanceOK(set) ? infoLogDet(set) : -Infinity;
    for(let pass=0; pass<4; pass++){
      for(let i=0;i<size;i++){
        for(let t=0;t<400;t++){
          const cand=pool[Math.floor(r()*pool.length)];
          const trial=set.slice(); trial[i]=cand;
          if(!balanceOK(trial)) continue;
          const v=infoLogDet(trial);
          if(v>val){ val=v; set=trial; }
        }
      }
    }
    if(val>bestVal){ bestVal=val; best=set; }
  }
  return { set:best, logdet:bestVal };
}

// 差分を保ったまま見た目を変える：左右入れ替え＋差のない属性の水準・年収の基準額を変更
function reskin(q, r){
  const A={}, B={};
  for(const k of BIN_KEYS){
    if(q.A[k]!==q.B[k]){ A[k]=q.B[k]; B[k]=q.A[k]; }           // 左右入れ替え
    else { const v = r()<0.5 ? q.A[k] : (BIN[k].find(x=>x!==q.A[k])); A[k]=v; B[k]=v; }
  }
  const dInc = +q.B.income - +q.A.income;                      // 入れ替え後の A-B 差
  const opts = INCOME.map(Number).filter(b => INCOME.includes(String(b-dInc)) && !(b===+q.B.income));
  const base = opts.length ? opts[Math.floor(r()*opts.length)] : +q.B.income;
  A.income=String(base); B.income=String(base-dInc);
  return {A,B};
}

function build(){
  const { set, logdet } = optimise(20261122, 10);
  const r = rng(424242);
  const questions = [];
  questions.push({ id:"practice", type:"practice", scored:false, scenario:null, intent:"操作に慣れる",
    A:{income:"600",location:"なし",hours:"少",remote:"可",growth:"小",stability:"安定"},
    B:{income:"600",location:"あり",hours:"多",remote:"不可",growth:"大",stability:"不安定"} });
  set.forEach((q,i)=> questions.push({ id:"a"+String(i+1).padStart(2,"0"), type:"main", scored:true,
    scenario:"A", pair:i+1, intent:"トレードオフ", A:q.A, B:q.B }));
  set.forEach((q,i)=>{ const s=reskin(q, r); questions.push({ id:"b"+String(i+1).padStart(2,"0"), type:"main", scored:true,
    scenario:"B", pair:i+1, intent:"トレードオフ（aと同じ組の見た目違い）", A:s.A, B:s.B }); });
  questions.push({ id:"qd", type:"dominant", scored:false, scenario:null, intent:"注意チェック（Aが全優位）",
    A:{income:"900",location:"なし",hours:"少",remote:"可",growth:"大",stability:"安定"},
    B:{income:"300",location:"あり",hours:"多",remote:"不可",growth:"小",stability:"不安定"} });
  writeFileSync(new URL("./questions.json", import.meta.url), JSON.stringify({ meta:META, questions }, null, 2)+"\n");
  console.log("生成完了 logdet=", logdet.toFixed(3));
}
build();

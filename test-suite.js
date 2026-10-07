const fs=require('fs');
const path=require('path');
// resolve index.html next to this file, wherever the repo lives
const INDEX=path.join(__dirname,'index.html');
if(!fs.existsSync(INDEX)){ console.error('Could not find index.html next to test-suite.js'); process.exit(1); }
const s=fs.readFileSync(INDEX,'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const store={};
const mk=id=>({id,textContent:'',value:'',style:{},className:'',dataset:{},classList:{add(){},remove(){},toggle(){}},
 addEventListener(){},set innerHTML(v){store[id]=v;},get innerHTML(){return store[id]||'';},querySelectorAll:()=>[],focus(){},setAttribute(){}});
const els={};
global.document={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],addEventListener(){},createElement:()=>mk('t'),documentElement:mk('h')};
global.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;}};
global.fetch=()=>Promise.reject('x');global.window={scrollTo(){}};
const body=s.replace('boot();','')+`;module.exports={PLAYERS,WK,reindex,project,logOf,nextWeek,PRESETS_SC,C,
 gradeBet,betProfit,betSummary,propProb,MK,payout,lineupFor,setBestLineup,placeIn,clearWeek,migrate,
 renderHome,renderWeek,renderFinder,renderPlayers,renderTrends,renderBets,injStatus,scoreRow,finderRows,seasonTotals,
 setBets:v=>{bets=v;},getBets:()=>bets,set:(k,v)=>{if(k==='P')P=v;if(k==='W')W=v;if(k==='season')season=v;if(k==='filters')filters=v;if(k==='sortKey')sortKey=v;if(k==='weekF')weekF=v;if(k==='posF')posF=v;},get:()=>P};`;
const m={exports:{}};new Function('module','document','localStorage','fetch',body)(m,global.document,global.localStorage,global.fetch);
const A=m.exports;A.set('P',A.PLAYERS);A.set('W',A.WK);A.reindex();A.set('season',2026);
const P=A.get(),C=A.C,by=n=>Object.keys(P).find(k=>P[k].n===n);
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+n+(d&&!c?' -> '+d:''));};
const wk=A.nextWeek(),sc=A.PRESETS_SC.ppr;

// scoring integrity
A.set('season',2025);
let worst=0;
for(const r of A.WK[2025]){const p=P[r[0]];if(!p||['K','DST'].includes(p.p))continue;
  worst=Math.max(worst,Math.abs(A.scoreRow(r,sc)-r[20]));}
ok('PPR scoring matches reference',worst<0.1);
A.set('posF','ALL');A.set('weekF','all');A.set('filters',[{k:'td',op:'>=',v:1}]);A.set('sortKey','td');
ok('stat finder works',A.finderRows().length>1000);
A.set('season',2026);

// projections + role gating
const mah=A.project(by('Patrick Mahomes'),{wk,score:sc}), fld=A.project(by('Justin Fields'),{wk,score:sc});
ok('starter projects normally',mah.pts>12);
ok('backup QB near zero',fld.pts<3);
const irGuy=Object.keys(P).find(id=>P[id].s==='IR');
ok('IR gated to zero',A.project(irGuy,{wk,score:sc}).pts===0);

// prop probabilities
const jsn=by('Jaxon Smith-Njigba');
const lo=A.propProb(jsn,wk,A.MK('rec_yds'),20,'over',sc), hi=A.propProb(jsn,wk,A.MK('rec_yds'),150,'over',sc);
ok('probabilities ordered correctly',lo.p>hi.p);
ok('probabilities bounded away from certainty',lo.p<=0.97&&hi.p>=0.03);
ok('over + under = 1',Math.abs(lo.p+A.propProb(jsn,wk,A.MK('rec_yds'),20,'under',sc).p-1)<1e-9);

// bet grading
const row=A.logOf(jsn,2026).find(r=>r[C.wk]===1); const ry=row[C.cyd];
const b=o=>Object.assign({id:'t',pid:jsn,season:2026,week:1,market:'rec_yds',side:'over',line:ry-10,odds:-110,stake:10},o);
ok('win grades',A.gradeBet(b({}))==='win');
ok('loss grades',A.gradeBet(b({line:ry+10}))==='loss');
ok('push grades',A.gradeBet(b({line:ry}))==='push');
ok('manual override honoured',A.gradeBet(b({manual:'void'}))==='void');
ok('payout maths',Math.abs(A.betProfit(b({}))-9.0909)<0.001);
A.setBets([b({id:'1'}),b({id:'2',line:ry+10})]);
const sm=A.betSummary(A.getBets());
ok('summary records 1-1',sm.w===1&&sm.l===1);

// lineups
const roster=['Josh Allen','Christian McCaffrey','Jonathan Taylor','Puka Nacua','Jaxon Smith-Njigba','Trey McBride','Nico Collins'].map(by).filter(Boolean).concat(['DST_DEN']);
const lg=A.migrate({id:'L',name:'T',slots:{QB:1,RB:2,WR:2,TE:1,FLEX:1,K:0,DST:1},teams:12,roster,lineup:{}});
A.setBestLineup(lg,wk);
const lu=A.lineupFor(lg,wk);
ok('best lineup fills slots',lu.start.every(x=>x.pid));
ok('no duplicate starters',(()=>{const i=lu.start.map(x=>x.pid);return new Set(i).size===i.length;})());
const bench=lu.bench.find(x=>['RB','WR','TE'].includes(x.pos));
if(bench){const fi=lu.start.findIndex(x=>x.slot==='FLEX');A.placeIn(lg,wk,fi,bench.pid);
  ok('manual swap after best lineup',A.lineupFor(lg,wk).start[fi].pid===bench.pid);}
A.clearWeek(lg,wk);
ok('reset clears overrides',!A.lineupFor(lg,wk).start.some(x=>x.manual));

// views render
const views=[['home',A.renderHome],['week',A.renderWeek],['finder',A.renderFinder],['players',A.renderPlayers],['trends',A.renderTrends],['bets',A.renderBets]];
views.forEach(([n,fn])=>{try{fn();ok(n+' renders',(store['view-'+n]||'').length>300);}catch(e){ok(n+' renders',false,e.message);}});
console.log('\n'+pass+' passed, '+fail+' failed');
if(fail>0) process.exit(1);

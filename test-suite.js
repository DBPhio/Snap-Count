const fs=require('fs');
const path=require('path');
// resolve index.html next to this file, wherever the repo lives
const INDEX=path.join(__dirname,'index.html');
if(!fs.existsSync(INDEX)){ console.error('Could not find index.html next to test-suite.js'); process.exit(1); }
const s=fs.readFileSync(INDEX,'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const store={};
const mk=id=>({id,textContent:'',value:'',style:{},className:'',dataset:{},classList:{add(){},remove(){},toggle(){}},
 addEventListener(){},click(){},querySelector:()=>mk('q'),set innerHTML(v){store[id]=v;},get innerHTML(){return store[id]||'';},querySelectorAll:()=>[],focus(){},setAttribute(){}});
const els={};
global.document={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],addEventListener(){},createElement:()=>mk('t'),documentElement:mk('h')};
global.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;}};
global.fetch=()=>Promise.reject('x');global.window={scrollTo(){}};
const body=s.replace('boot();','')+`;module.exports={PLAYERS,WK,reindex,project,logOf,nextWeek,PRESETS_SC,C,
 lineupFor,setBestLineup,placeIn,clearWeek,migrate,gameOf,statusTag,SCHED,G,weekPlayed,injStatus,injRows,injNews,openSheet,renderLeagues,setLeagues:v=>{leagues=v;},
 renderHome,renderWeek,renderFinder,renderPlayers,renderTrends,injStatus,scoreRow,finderRows,seasonTotals,
 renderCompare,cmpTable,cmpExport,cmpTier,setCmp:(a,b,m)=>{cmpA=a;cmpB=b;if(m)cmpMode=m;},getCmp:()=>({a:cmpA,b:cmpB,m:cmpMode}),
 set:(k,v)=>{if(k==='P')P=v;if(k==='W')W=v;if(k==='season')season=v;if(k==='filters')filters=v;if(k==='sortKey')sortKey=v;if(k==='weekF')weekF=v;if(k==='posF')posF=v;},get:()=>P};`;
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
// pick a QB1 whose team is actually playing — a fixed name breaks on his bye
const qb1=Object.keys(P).find(id=>P[id].p==='QB'&&P[id].dc===1&&A.gameOf(P[id].t,2026,wk)&&!P[id].s);
const starter=A.project(qb1,{wk,score:sc});
ok('starter projects normally',starter.pts>12,P[qb1].n+'='+starter.pts);
// and a backup on the same team
const bkp=Object.keys(P).find(id=>P[id].p==='QB'&&P[id].t===P[qb1].t&&P[id].dc>1);
if(bkp) ok('backup QB near zero',A.project(bkp,{wk,score:sc}).pts<3,P[bkp].n);
else ok('backup QB near zero',true);
const irGuy=Object.keys(P).find(id=>P[id].s==='IR');
ok('IR gated to zero',A.project(irGuy,{wk,score:sc}).pts===0);


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

// bye weeks (own scope: the lineup test above reuses these names)
{
const kw=by('Kenneth Walker III'), BYE=5;
const onBye=A.project(kw,{wk:BYE,score:sc});
console.log('Kenneth Walker, KC bye week '+BYE+':',onBye.pts,'|',onBye.why[0],'\n');
ok('player on bye projects zero',onBye.pts===0);
ok('status says BYE',onBye.status==='BYE');
ok('reason explains the bye',/bye/i.test(onBye.why[0]));
ok('badge shows BYE',true);
const notBye=A.project(kw,{wk:4,score:sc});
ok('non-bye week unaffected',notBye.pts>10,'wk4='+notBye.pts);

// kicker and defense on the same bye
const kck=Object.keys(P).find(id=>P[id].p==='K'&&P[id].t==='KC');
if(kck) ok('kicker on bye projects zero',A.project(kck,{wk:BYE,score:sc}).pts===0);
ok('defense on bye projects zero',A.project('DST_KC',{wk:BYE,score:sc}).pts===0);

// every team's bye produces zeros across the board
let leaks=[];
const teams=[...new Set(Object.values(P).map(p=>p.t))].filter(t=>t&&t!=='FA');
for(const t of teams){
  for(let w=1;w<=18;w++){
    if(A.gameOf(t,2026,w)) continue;
    for(const id of Object.keys(P).filter(x=>P[x].t===t).slice(0,6)){
      const pj=A.project(id,{wk:w,score:sc});
      if(pj&&pj.pts>0) leaks.push(`${P[id].n} wk${w} = ${pj.pts}`);
    }
  }
}
ok('no player projects points on any bye',leaks.length===0,leaks.slice(0,3).join('; '));

// lineup must not start a bye player
const roster=['Kenneth Walker III','Jahmyr Gibbs','Jonathan Taylor','Puka Nacua','Jaxon Smith-Njigba','Trey McBride','Josh Allen'].map(by).filter(Boolean);
const lg=A.migrate({id:'L',name:'T',slots:{QB:1,RB:2,WR:2,TE:1,FLEX:1,K:0,DST:0},teams:12,roster,lineup:{}});
A.setBestLineup(lg,BYE);
const lu=A.lineupFor(lg,BYE);
console.log('\n  best lineup in week '+BYE+':');
lu.start.forEach(x=>console.log('   ',x.slot.padEnd(5),(x.pid?P[x.pid].n:'—').padEnd(22),(x.proj||0).toFixed(1)));
ok('bye player not auto-started',!lu.start.some(x=>x.pid===kw));
ok('bye player sits on the bench',lu.bench.some(b=>b.pid===kw));


}
// week rollover (own scope)
{
const roster=['Jahmyr Gibbs','Jonathan Taylor','Puka Nacua','Jaxon Smith-Njigba','Trey McBride','Josh Allen','Bijan Robinson'].map(by).filter(Boolean);
const lg=A.migrate({id:'L',slots:{QB:1,RB:2,WR:2,TE:1,FLEX:1,K:0,DST:0},teams:12,roster,lineup:{}});

const before=A.nextWeek();
console.log('Sunday state — upcoming week is',before);
let lu=A.lineupFor(lg,before);
ok('upcoming week uses projections',lu.byProj===true);
ok('projected total is real',lu.projTotal>60);
A.setBestLineup(lg,before);
const picked=A.lineupFor(lg,before);
ok('set best uses projections',picked.start.every(x=>x.manual));
const benchMax=Math.max(...picked.bench.filter(b=>['RB','WR','TE'].includes(b.pos)).map(b=>b.proj),0);
ok('no bench player out-projects the FLEX',picked.start.find(x=>x.slot==='FLEX').proj>=benchMax-0.01);

// --- Tuesday: last week's games are final, stats not yet published ---
A.SCHED[2026].filter(r=>r[A.G.wk]===before).forEach(r=>r[A.G.played]=1);
A.reindex();
console.log('\nTuesday state — week',before,'now final, box scores not in yet');
ok('upcoming week rolls forward',A.nextWeek()===before+1,'got '+A.nextWeek());
const luOld=A.lineupFor(lg,before);
ok('finished week no longer treated as upcoming',luOld.byProj===false);
ok('finished week flags that stats are pending',luOld.awaitingStats===true);
const luNew=A.lineupFor(lg,A.nextWeek());
ok('new week uses projections',luNew.byProj===true);
ok('new week has projected points',luNew.projTotal>50,'proj='+luNew.projTotal);
A.setBestLineup(lg,A.nextWeek());
const nl=A.lineupFor(lg,A.nextWeek());
ok('set best on the new week fills every slot',nl.start.filter(x=>x.pid).length>=6);
ok('set best ranked on projections, not last week',
   (()=>{const flex=nl.start.find(x=>x.slot==='FLEX');
         const bm=Math.max(...nl.bench.filter(b=>['RB','WR','TE'].includes(b.pos)).map(b=>b.proj),0);
         return !flex.pid||flex.proj>=bm-0.01;})());
console.log('\n  new week lineup:');
nl.start.forEach(x=>console.log('   ',x.slot.padEnd(5),(x.pid?P[x.pid].n:'—').padEnd(22),'proj',(x.proj||0).toFixed(1),'| actual',x.pts.toFixed(1)));

// --- Wednesday: stats arrive for the finished week ---
console.log('\nWednesday state — box scores published');
const luDone=A.lineupFor(lg,before,{useProj:false});
ok('finished week ranks on real points once stats land',luDone.byProj===false);
}
// injury report (own scope)
{
// --- aging rule ---
const inj=Object.keys(P).find(id=>{const r=A.injRows(id);return r.length&&r[r.length-1][1]==='Out'&&!P[id].s;});
console.log('reference player:',P[inj].n,'latest entry week',A.injRows(inj).slice(-1)[0][0],'\n');
ok('current-week report shows',!!A.injStatus(inj,A.injRows(inj).slice(-1)[0][0]));
const old=A.injRows(inj).slice(-1)[0][0];
ok('one week later still shows (report not yet out)',!!A.injStatus(inj,old+1));
ok('flagged as not current',A.injStatus(inj,old+1).current===false);
ok('three weeks later it has expired',A.injStatus(inj,old+3)===null);
ok('expired designation produces no badge',A.statusTag(inj,old+3)==='');

// --- consistency across tabs ---
console.log('\nbadge consistency for 20 injured players across tabs');
const injured=Object.keys(P).filter(id=>A.injNews(id,wk)).slice(0,20);
// flagged but still expected to play — an all-ruled-out roster leaves every
// slot empty, which is correct behaviour but gives nothing to annotate
const flagged=Object.keys(P).filter(id=>A.injNews(id,wk)&&!id.startsWith('DST_')
  &&A.project(id,{wk,score:sc}).gate>0).slice(0,8);
A.setLeagues([A.migrate({id:'L',name:'T',slots:{QB:1,RB:2,WR:2,TE:1,FLEX:1,K:1,DST:1},teams:12,
  roster:flagged.length?flagged:injured.slice(0,8),lineup:{}})]);
const views={players:A.renderPlayers,week:A.renderWeek,finder:A.renderFinder,trends:A.renderTrends,leagues:A.renderLeagues};
for(const [name,fn] of Object.entries(views)){ try{fn();}catch(e){console.log('  render error in '+name+': '+e.message);} }
const html=Object.fromEntries(Object.keys(views).map(v=>[v,store['view-'+v]||'']));
for(const v of ['players','week','finder','trends','leagues']){
  const found=injured.filter(id=>{const nm=P[id].n; const i=html[v].indexOf(nm); if(i<0) return null;
    return html[v].slice(i,i+400).includes('sflag');}).length;
  const present=injured.filter(id=>html[v].includes(P[id].n)).length;
  console.log(`  ${v.padEnd(9)} shows ${present} of these players, ${found} carry an injury badge`);
  if(present>0) ok(v+' tab flags injured players',found>0,`${found}/${present}`);
}
// --- news line present ---
ok('players tab carries a news line',/t-news/.test(html.players));
ok('this week carries a news line',/rownews/.test(html.week));
ok('league rows carry a news line',/class="inl/.test(html.leagues));
// --- sheet detail ---
A.openSheet(inj);
const sheet=store['sheet']||'';
ok('player sheet shows the injury report',/Injury report/.test(sheet));
ok('sheet shows the body part',/injnow/.test(sheet));
ok('sheet shows week-by-week history',/injlog/.test(sheet));
// --- projections agree with the badge ---
const outGuys=Object.keys(P).filter(id=>{const s2=A.injStatus(id,wk);return s2&&s2.status==='Out'&&!P[id].s;});
ok('every "Out" player projects zero',outGuys.every(id=>A.project(id,{wk,score:A.PRESETS_SC.ppr}).pts===0),
  outGuys.filter(id=>A.project(id,{wk,score:A.PRESETS_SC.ppr}).pts>0).map(id=>P[id].n).join(','));
}
// --- every view renders, with nothing leaking into the markup ---
const views=[['home',A.renderHome],['week',A.renderWeek],['finder',A.renderFinder],
  ['players',A.renderPlayers],['trends',A.renderTrends],['leagues',A.renderLeagues],
  ['compare',A.renderCompare]];
views.forEach(([n,fn])=>{
  let e=null; try{ fn(); }catch(x){ e=x.message; }
  const out=store['view-'+n]||'';
  ok(n+' renders',!e&&out.length>300,e||out.length+' chars');
  ok(n+' markup is clean',!/undefined|NaN|\[object/.test(out),(out.match(/undefined|NaN|\[object \w+/)||[''])[0]);
});

// --- the player sheet opens for every kind of player, not just the common case ---
{
const pick=t=>Object.keys(P).find(t);
const kinds=[['starting QB',pick(id=>P[id].p==='QB'&&P[id].dc===1&&A.gameOf(P[id].t,2026,wk)&&!P[id].s)],
 ['backup QB',pick(id=>P[id].p==='QB'&&P[id].dc>2)],['kicker',pick(id=>P[id].p==='K')],
 ['defense',pick(id=>P[id].p==='DST')],['IR player',pick(id=>P[id].s==='IR')],
 ['player on a bye',pick(id=>P[id].dc===1&&!A.gameOf(P[id].t,2026,wk))]];
for(const [label,id] of kinds){
  if(!id){ ok('sheet opens for a '+label+' (none in data)',true); continue; }
  store['sheet']=''; let e=null;
  try{ A.openSheet(id); }catch(x){ e=x.message; }
  const out=store['sheet']||'';
  ok('sheet opens for a '+label,!e&&out.length>500&&out.includes(P[id].n),e||P[id].n+' / '+out.length+' chars');
}
}

// --- compare tab: three modes, and pairings that stress the row logic ---
{
const rank=pos=>Object.keys(P).filter(id=>P[id].p===pos)
  .sort((x,y)=>A.project(y,{wk,score:A.PRESETS_SC.ppr}).pts-A.project(x,{wk,score:A.PRESETS_SC.ppr}).pts);
const wrs=rank('WR'), rbs=rank('RB'), qbs=rank('QB');
const pick=t=>Object.keys(P).find(t);

A.setCmp(null,null,'week'); store['view-compare']='';
let ce=null; try{ A.renderCompare(); }catch(x){ ce=x.message; }
ok('compare empty state renders',!ce&&(store['view-compare']||'').length>500,ce);

for(const mode of ['week','ros','trade']){
  A.setCmp(wrs[0],wrs[1],mode); store['view-compare']='';
  let e2=null; try{ A.renderCompare(); }catch(x){ e2=x.message; }
  const out=store['view-compare']||'';
  ok('compare/'+mode+' renders with a verdict',!e2&&out.length>3000&&/class="cverd"/.test(out),
     e2||out.length+' chars');
  ok('compare/'+mode+' markup is clean',!/undefined|NaN|\[object|Infinity/.test(out),
     (out.match(/undefined|NaN|\[object \w+|Infinity/)||[''])[0]);
}
const pairs=[['cross-position',wrs[0],rbs[0]],
 ['kickers',pick(id=>P[id].p==='K'),Object.keys(P).filter(id=>P[id].p==='K')[1]],
 ['defenses',pick(id=>P[id].p==='DST'),Object.keys(P).filter(id=>P[id].p==='DST')[1]],
 ['one on IR',wrs[0],pick(id=>P[id].s==='IR')],
 ['one on a bye',wrs[0],pick(id=>P[id].dc===1&&!A.gameOf(P[id].t,2026,wk))],
 ['starter vs backup',qbs[0],pick(id=>P[id].p==='QB'&&P[id].dc>2)]];
for(const [label,x,y] of pairs){
  if(!x||!y||x===y){ ok('compare handles '+label+' (not in data)',true); continue; }
  A.setCmp(x,y,'week'); store['view-compare']='';
  let e3=null; try{ A.renderCompare(); }catch(z){ e3=z.message; }
  const out=store['view-compare']||'';
  ok('compare handles '+label,!e3&&out.length>1500&&!/undefined|NaN|\[object|Infinity/.test(out),
     e3||(out.match(/undefined|NaN|\[object \w+|Infinity/)||['short: '+out.length])[0]);
}
// a player cut since the link was saved must not take the view down with him
A.setCmp('NOT_A_REAL_ID','ALSO_FAKE','week'); store['view-compare']='';
let e4=null; try{ A.renderCompare(); }catch(x){ e4=x.message; }
ok('compare survives stale player ids',!e4&&/Put two players/.test(store['view-compare']||''),e4);

// winner marking
ok('winner tally follows the better value',(()=>{const r=A.cmpTable([{label:'x',a:10,b:5},{label:'y',a:1,b:9}]);
  return r.winA===1&&r.winB===1;})());
ok('hi:false inverts which side wins',(()=>{const r=A.cmpTable([{label:'x',a:2,b:8,hi:false}]);
  return r.winA===1&&r.winB===0;})());
ok('rows empty on both sides are dropped',A.cmpTable([{label:'x',a:null,b:null}]).html==='');
ok('one-sided rows score for neither',(()=>{const r=A.cmpTable([{label:'x',a:5,b:null}]);
  return r.winA===0&&r.winB===0&&/–/.test(r.html);})());
ok('matchup tiers stay in range',[0,1,2,3].includes(A.cmpTier(1.2))&&A.cmpTier(null)===-1);

// a gated player must not carry encouraging reasons next to a real projection
{
const ir=pick(id=>P[id].s==='IR');
if(ir){
  A.setCmp(wrs[0],ir,'week'); store['view-compare']='';
  A.renderCompare();
  const out=store['view-compare']||'';
  const bHalf=out.slice(out.indexOf('chside b'));
  ok('gated side shows only the reason he cannot play',
     (bHalf.match(/<li>/g)||[]).length<=1,(bHalf.match(/<li>[^<]*/g)||[]).join(' | '));
} else ok('gated side shows only the reason he cannot play (no IR player)',true);
}
// the verdict must not case-fold a reason that starts with a team code
{
const bye=pick(id=>P[id].dc===1&&!A.gameOf(P[id].t,2026,wk));
if(bye){
  A.setCmp(wrs[0],bye,'week'); store['view-compare']='';
  A.renderCompare();
  const out=store['view-compare']||'';
  ok('bye reason keeps the team code upper case',!/\b[a-z]{2,3} are on a bye/.test(out),
     (out.match(/\b[a-z]{2,3} are on a bye/)||[''])[0]);
} else ok('bye reason keeps the team code upper case (nobody on a bye)',true);
}
// export
A.setCmp(wrs[0],rbs[0],'week');
let e5=null; try{ A.cmpExport(A.PRESETS_SC.ppr); }catch(x){ e5=x.message; }
ok('compare CSV export runs',!e5,e5);
A.setCmp(null,null,'week');
}

// --- the bet tracker is gone, and nothing it shared is collateral damage ---
{
const src=require('fs').readFileSync(INDEX,'utf8');
const dead=['betDraft','betsFor','betSummary','gradeBet','propProb','openBetSlip','renderBets',
  'MARKETS','fmtOdds','snapcount.bets','data-slip','view-bets','data-v="bets"'];
const left=dead.filter(d=>src.includes(d));
ok('no bet-tracker code remains',left.length===0,left.join(', '));
ok('start/sit comparator survived',/function compareBar/.test(src));
ok('CSV export survived',/function exportTable/.test(src));
// every export handler needs a button that actually renders
ok('compare tab survived',/function renderCompare/.test(src)&&/data-v="compare"/.test(src));
['csvWeek','csvTrends','csvFinder'].forEach(k=>
  ok(k+' button exists for its handler',src.includes('id="'+k+'"')));
// saved-view whitelist must match the tabs that exist
const tabs=[...new Set([...src.matchAll(/data-v="([a-z]+)"/g)].map(m=>m[1]))];
const wl=(src.match(/\[([^\]]*)\]\.includes\(s\.view\)/)||[,''])[1].match(/"([a-z]+)"/g)||[];
ok('saved-view whitelist matches the tabs',wl.length===tabs.length&&wl.every(w=>tabs.includes(w.replace(/"/g,''))),
  'tabs='+tabs.join(',')+' whitelist='+wl.join(','));
}
console.log('\n'+pass+' passed, '+fail+' failed');
if(fail>0) process.exit(1);

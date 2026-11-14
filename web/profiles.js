const PROFILES={
education:{label:"Educational"},
tourism:{label:"Tourist"},
business:{label:"Pro"}};
const ICONS={
education:'<path d="M24 12c-4-3-10-4-16-3v26c6-1 12 0 16 3 4-3 10-4 16-3V9c-6-1-12 0-16 3z"/><path d="M24 12v26"/>',
tourism:'<rect x="6" y="14" width="36" height="24" rx="4"/><path d="M17 14l3-5h8l3 5"/><circle cx="24" cy="26" r="7"/>',
business:'<path d="M8 32a16 16 0 0 1 32 0z"/><path d="M6 32h36v4H6z"/><path d="M24 16v16M17 18v14M31 18v14"/>'};
const QUIZ=[
{q:"Why does Earth stay in roughly the same part of the sky for a site on the near side?",o:["The Moon is tidally locked to Earth","The Moon does not rotate","Earth orbits the Moon every day"],a:0,e:"The Moon rotates once per orbit, so the same face always points at Earth. Libration makes Earth wobble slightly."},
{q:"Why can sites near the lunar poles have almost continuous sunlight?",o:["The poles are closer to the Sun","The Moon’s axis is tilted only about 1.5°","The poles reflect more light"],a:1,e:"With so little tilt, the Sun skims the horizon at the poles, so high ground can stay lit for long periods."},
{q:"What does the lack of an atmosphere change for the horizon?",o:["The Sun sets slowly through twilight","Light bends over the horizon","The Sun disappears abruptly with no twilight"],a:2,e:"Without an atmosphere there is no refraction or twilight, so the transition from light to dark is sharp."},
{q:"About how long is one lunar day, from sunrise to sunrise?",o:["About 29.5 Earth days","About 24 hours","About 7 Earth days"],a:0,e:"The synodic month is about 29.5 days, so a site has roughly two weeks of daylight and two weeks of night."}];
const FILTERS={q:"",cat:"all",base:"all",min:0,sort:"recommended",avail:false};
let profile=null,landing=null,landingToken=0,EXP=null,quiz={i:0,score:0,picked:null},trip=new Map(),expanded=new Set(),shell=false,lastKey="";
const usd=n=>"$"+Math.round(n).toLocaleString("en-US");
const dots=r=>Array.from({length:5},(_,i)=>`<i class="${r>=i+0.75?"f":r>=i+0.25?"h":""}"></i>`).join("");
const hoursTxt=h=>h>=24&&h%24===0&&h>24?h/24+" days":h===24?"1 night":h+" h";

function visibility(id){document.querySelectorAll("[data-for]").forEach(el=>{el.hidden=!id||!el.dataset.for.split(" ").includes(id)})}
function stopLanding(){landingToken++;if(landing)landing.dispose();landing=null}
async function startLanding(){const token=++landingToken;try{const m=await import("./landing.js");if(token!==landingToken||document.getElementById("welcome").hidden)return;landing=m.createLanding(document.getElementById("ln-stage"))}catch(e){}}
function applyProfile(id){profile=id;document.body.dataset.profile=id;visibility(id);
document.getElementById("profile-btn").textContent="Profile: "+PROFILES[id].label;
document.getElementById("welcome").hidden=true;stopLanding();
lastKey="";renderProfile()}
function openWelcome(){stopLanding();
const w=document.getElementById("welcome");
w.innerHTML=`<div class="ln-stage" id="ln-stage"></div><div class="ln-ui">
<div class="ln-logo"><svg viewBox="0 0 250 64" aria-label="OrbitPass"><path d="M10 44C40 62 150 66 232 26" fill="none" stroke="#59e3f7" stroke-width="2" stroke-linecap="round"/><circle cx="234" cy="25" r="4" fill="#59e3f7"/><text x="8" y="42" font-size="38" font-style="italic" font-weight="700" fill="#fff" font-family="Inter,system-ui,sans-serif">Orbit<tspan fill="#59e3f7">Pass</tspan></text></svg></div>
<div class="ln-cards">${Object.entries(PROFILES).map(([id,p])=>`<button class="ln-card" data-profile="${id}"><svg class="ico" viewBox="0 0 48 48">${ICONS[id]}</svg><h3>${p.label}</h3></button>`).join("")}</div></div>`;
w.hidden=false;startLanding()}

function renderLessons(){const s=SITES[sel],st=stats[sel],h=+document.getElementById("t").value,sn=st.sun[h],ea=st.ear[h],hmax=s.hor?Math.max(...s.hor):null;
const L=[
["A lunar day lasts about 29.5 Earth days",`Over the next 30 days ${s.name} has the Sun above the horizon ${f(st.sp)}% of the time. Its longest continuous darkness is ${f(st.dark/24,1)} days.`],
["Why the poles are special",`The Moon’s axis is tilted only about 1.5°, so near the poles the Sun skims the horizon instead of climbing high. At this site (latitude ${f(s.lat,1)}°) the Sun averages ${f(st.ae,1)}° of elevation while it is up.`],
["Earth stays put in the sky",`The same face of the Moon always points at Earth. At this site Earth is above the horizon ${f(st.ep)}% of the next 30 days. Right now it is at azimuth ${f(ea.az)}° and elevation ${f(ea.el,1)}°.`],
["Terrain sets the real horizon",hmax===null?"Terrain data is still loading, so a flat spherical horizon is used for now.":`A terrain model built from LRO laser altimetry puts the highest horizon at ${f(hmax,1)}° of elevation for this site, which delays sunrise and brings sunset forward.`],
["No atmosphere, no twilight",`Without air there is no refraction or twilight, so light turns to dark abruptly. ${sn.up?"The Sun is up now":"The Sun is down now"}: ${untilTxt(until(st.sun,h),"sunset","sunrise")}.`],
["Why dates matter",`Moving a landing by a few days changes both sunlight and Earth contact. At this site the Sun and Earth are both up ${f(st.bp)}% of the next 30 days, and their overlap shifts with the date.`]];
document.getElementById("lessons").innerHTML=L.map(([t,b])=>`<div class="card" style="cursor:default"><b>${t}</b><small style="display:block;margin-top:6px;line-height:1.5">${b}</small></div>`).join("")}

function renderQuiz(){const el=document.getElementById("quiz");
if(quiz.i>=QUIZ.length){el.innerHTML=`<div class="kpi"><span>Result</span><b>${quiz.score} / ${QUIZ.length}</b></div><div class="row" style="margin-top:10px"><button data-quiz="restart">Restart quiz</button></div>`;return}
const q=QUIZ[quiz.i],done=quiz.picked!==null;
el.innerHTML=`<div class="note" style="margin:0 0 6px">Question ${quiz.i+1} of ${QUIZ.length}</div><b>${q.q}</b><div class="qopts">${q.o.map((t,i)=>`<button class="qopt ${done?(i===q.a?"right":i===quiz.picked?"wrong":""):""}" data-opt="${i}" ${done?"disabled":""}>${t}</button>`).join("")}</div>${done?`<div class="note">${quiz.picked===q.a?"Correct. ":"Not quite. "}${q.e}</div><div class="row" style="margin-top:10px"><button data-quiz="next">${quiz.i+1<QUIZ.length?"Next question":"See result"}</button></div>`:""}`}

function condition(e,h){const sn=look(subs[h].sun,e.lat,e.lon),ea=look(subs[h].earth,e.lat,e.lon),ok=x=>x==="any"||(x==="day"&&sn.el>0)||(x==="night"&&sn.el<=0&&ea.el>0)||(x==="earth"&&ea.el>0);
let next=null;if(!ok(e.needs))for(let i=h+1;i<HRS;i++){const a=look(subs[i].sun,e.lat,e.lon),b=look(subs[i].earth,e.lat,e.lon);if(e.needs==="day"?a.el>0:e.needs==="night"?a.el<=0&&b.el>0:b.el>0){next=i-h;break}}
return{sun:sn,earth:ea,ok:ok(e.needs),next}}
function lowest(e){return Math.min(...e.offers.map(o=>o.price))}
function filtered(h){const F=FILTERS,q=F.q.trim().toLowerCase();
let list=EXP.experiences.map(e=>({e,c:condition(e,h)})).filter(({e,c})=>(F.cat==="all"||e.cat===F.cat)&&(F.base==="all"||e.base===F.base)&&e.rating>=F.min&&(!F.avail||c.ok)&&(!q||(e.name+" "+e.baseName+" "+e.tags.join(" ")+" "+e.summary).toLowerCase().includes(q)));
const key={recommended:x=>-x.e.rating*Math.log(x.e.reviews+10),price:x=>lowest(x.e),rating:x=>-x.e.rating,reviews:x=>-x.e.reviews}[F.sort];
return list.sort((a,b)=>key(a)-key(b))}
function rankOf(e){const same=EXP.experiences.filter(x=>x.base===e.base&&x.cat===e.cat).sort((a,b)=>b.rating-a.rating||b.reviews-a.reviews);return[same.findIndex(x=>x.id===e.id)+1,same.length]}
const catName=id=>EXP.categories.find(c=>c.id===id).name;
const needTxt={day:"Needs daylight",night:"Runs after dark with Earth in view",earth:"Needs Earth in view",any:"Runs at any time"};

function card({e,c}){const prices=e.offers.map(o=>o.price),min=Math.min(...prices),avg=prices.reduce((a,b)=>a+b,0)/prices.length,best=e.offers.find(o=>o.price===min),deal=min<=avg*0.94,[rk,n]=rankOf(e),isOpen=expanded.has(e.id),rev=expanded.has("r"+e.id);
const status=c.ok?'<span class="bd ok">Available now</span>':`<span class="bd warn">Not available now</span>${c.next!==null?` <span class="note">Next window in ${eta(c.next*36e5)}</span>`:' <span class="note">No window in the next 30 days</span>'}`;
return`<div class="exp"><div><div class="chips" style="margin:0 0 6px"><span class="chip">${catName(e.cat)}</span>${deal?'<span class="chip" style="color:var(--ok);border-color:var(--ok)">Great price</span>':""}</div>
<b style="font-size:16px">${e.name}</b><div class="note" style="margin:2px 0">${e.baseName} · ${hoursTxt(e.hours)}</div>
<div class="row" style="gap:8px;margin:6px 0"><span class="dots">${dots(e.rating)}</span><b class="mono">${e.rating.toFixed(1)}</b><span class="note" style="margin:0">${e.reviews.toLocaleString("en-US")} reviews</span></div>
<div class="note" style="margin:0 0 6px">#${rk} of ${n} ${catName(e.cat).toLowerCase()} at ${e.baseName}</div>
<div style="margin-bottom:8px">${e.summary}</div>
<div class="chips" style="margin:0 0 8px">${e.tags.map(t=>`<span class="chip">${t}</span>`).join("")}</div>
<div class="note" style="margin:0 0 6px">${needTxt[e.needs]} · Sun ${f(c.sun.el,1)}° · Earth ${f(c.earth.el,1)}°</div><div>${status}</div>
<div class="row" style="margin-top:10px"><button class="sm" data-exp="${e.id}">${isOpen?"Hide offers":`Compare ${e.offers.length} offers`}</button><button class="sm" data-rev="${e.id}">${rev?"Hide reviews":"Read reviews"}</button></div>
${isOpen?`<table style="margin-top:8px"><tr><th>Provider</th><th>Price per ${e.unit}</th><th></th></tr>${[...e.offers].sort((a,b)=>a.price-b.price).map(o=>`<tr><td>${o.provider}${o===best?' <span class="bd ok">Best price</span>':""}</td><td class="mono">${usd(o.price)}</td><td><button class="sm" data-add="${e.id}|${o.provider}">Add to trip</button></td></tr>`).join("")}</table>`:""}
${rev?`<div style="margin-top:8px">${e.reviewList.map(r=>`<div class="note" style="margin:0 0 6px"><span class="dots">${dots(r.stars)}</span> <b>${r.author}</b> (${r.type}): ${r.text}</div>`).join("")}</div>`:""}</div>
<div class="price"><span class="note" style="margin:0">From</span><b>${usd(min)}</b><span class="note" style="margin:0">per ${e.unit}</span><div class="note">via ${best.provider}</div></div></div>`}

function renderTrip(){const el=document.getElementById("exp-trip"),items=[...trip.values()],total=items.reduce((a,x)=>a+x.o.price,0);
el.innerHTML=items.length?`<h2 style="margin-top:18px">Your trip</h2><table><tr><th>Experience</th><th>Provider</th><th>Price</th><th></th></tr>${items.map(({e,o})=>`<tr><td>${e.name}</td><td>${o.provider}</td><td class="mono">${usd(o.price)}</td><td><button class="sm" data-del="${e.id}">Remove</button></td></tr>`).join("")}<tr><td colspan="2"><b>Total</b></td><td class="mono"><b>${usd(total)}</b></td><td></td></tr></table><div class="row" style="margin-top:10px"><button data-reserve="1">Reserve (demo)</button><span class="note" id="reserve-note" style="margin:0">Demo only: nothing is booked.</span></div>`:""}

function buildShell(){const el=document.getElementById("exp-tools");
el.innerHTML=`<div class="row"><input type="search" id="exp-q" placeholder="Search experiences, bases or tags" style="flex:1;min-width:200px"><select id="exp-base"><option value="all">All destinations</option>${[...new Map(EXP.experiences.map(e=>[e.base,e.baseName]))].map(([id,n])=>`<option value="${id}">${n}</option>`).join("")}</select>
<select id="exp-min"><option value="0">Any rating</option><option value="4">4.0 and up</option><option value="4.5">4.5 and up</option></select>
<select id="exp-sort"><option value="recommended">Recommended</option><option value="price">Lowest price</option><option value="rating">Highest rated</option><option value="reviews">Most reviewed</option></select></div>
<div class="row" style="margin-top:10px"><div class="chips" id="exp-cats" style="margin:0"></div><label class="note" style="margin:0 0 0 auto"><input type="checkbox" id="exp-avail"> Available at the selected time</label></div>`;
const upd=()=>{lastKey="";renderProfile()};
el.querySelector("#exp-q").addEventListener("input",e=>{FILTERS.q=e.target.value;upd()});
el.querySelector("#exp-base").addEventListener("change",e=>{FILTERS.base=e.target.value;upd()});
el.querySelector("#exp-min").addEventListener("change",e=>{FILTERS.min=+e.target.value;upd()});
el.querySelector("#exp-sort").addEventListener("change",e=>{FILTERS.sort=e.target.value;upd()});
el.querySelector("#exp-avail").addEventListener("change",e=>{FILTERS.avail=e.target.checked;upd()});
el.querySelector("#exp-cats").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(b){FILTERS.cat=b.dataset.cat;upd()}});shell=true}

function renderExperiences(){if(!EXP){document.getElementById("exp-results").innerHTML='<div class="note">Experience data not loaded (data/experiences.json).</div>';return}
if(!shell)buildShell();
const h=+document.getElementById("t").value,list=filtered(h);
document.getElementById("exp-cats").innerHTML=[{id:"all",name:"All"},...EXP.categories].map(c=>`<button class="sm ${FILTERS.cat===c.id?"":"ghost"}" data-cat="${c.id}">${c.name}</button>`).join("");
const y=new Date(start+h*36e5).getUTCFullYear();
document.getElementById("exp-year").innerHTML=y===2050?"":`<div class="row" style="margin:10px 0"><span class="note" style="margin:0">Experiences belong to the synthetic 2050 scenario. Sky conditions are computed for the selected date.</span><button class="sm" data-go="2050-03-01">Set date to 2050</button></div>`;
document.getElementById("exp-results").innerHTML=list.length?`<div class="note">${list.length} of ${EXP.experiences.length} experiences</div><div class="explist">${list.map(card).join("")}</div>`:'<div class="note">No experiences match the current filters.</div>';
renderTrip()}

function renderProfile(){if(!profile)return;
const h=+document.getElementById("t").value,key=[profile,sel,start,h,stats[sel]&&stats[sel].sp,hzState].join("|");
if(key===lastKey)return;lastKey=key;
if(profile==="education"){renderLessons();if(!document.getElementById("quiz").firstChild)renderQuiz()}
if(profile==="tourism")renderExperiences()}

async function loadExperiences(){try{const r=await fetch("data/experiences.json");if(!r.ok)throw new Error("missing");EXP=await r.json()}catch(e){const n=document.getElementById("experiences-data");if(n)EXP=JSON.parse(n.textContent)}lastKey="";renderProfile()}

document.getElementById("welcome").addEventListener("click",e=>{const p=e.target.closest("[data-profile]");if(p)applyProfile(p.dataset.profile)});
document.getElementById("profile-btn").addEventListener("click",openWelcome);
document.getElementById("quiz").addEventListener("click",e=>{const o=e.target.closest("[data-opt]"),n=e.target.closest("[data-quiz]");
if(o){quiz.picked=+o.dataset.opt;if(quiz.picked===QUIZ[quiz.i].a)quiz.score++;renderQuiz()}
if(n){if(n.dataset.quiz==="restart")quiz={i:0,score:0,picked:null};else{quiz.i++;quiz.picked=null}renderQuiz()}});
document.getElementById("experiences").addEventListener("click",e=>{const t=e.target.closest("[data-exp],[data-rev],[data-add],[data-del],[data-reserve]");if(!t)return;
const d=t.dataset;
if(d.exp)expanded.has(d.exp)?expanded.delete(d.exp):expanded.add(d.exp);
if(d.rev){const k="r"+d.rev;expanded.has(k)?expanded.delete(k):expanded.add(k)}
if(d.add){const[id,prov]=d.add.split("|"),ex=EXP.experiences.find(x=>x.id===id);trip.set(id,{e:ex,o:ex.offers.find(o=>o.provider===prov)})}
if(d.del)trip.delete(d.del);
if(d.reserve){document.getElementById("reserve-note").textContent="Reservation recorded in this demo only. No payment or booking was made.";return}
lastKey="";renderProfile()});
visibility(null);
openWelcome();
loadExperiences();

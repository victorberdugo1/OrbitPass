const PROFILES={
education:{label:"Educational",text:"Learn about the Moon, space missions and lunar life"},
tourism:{label:"Tourist",text:"Plan your lunar trip, discover sights and experiences"},
business:{label:"Pro",text:"Data, resources and tools for professionals and missions"}};
const LAUNCH_SITES=[
{name:"Cape Canaveral, USA",lat:28.5619,lon:-80.5774},
{name:"Starbase, USA",lat:25.9972,lon:-97.1561},
{name:"Vandenberg, USA",lat:34.742,lon:-120.5724},
{name:"Kourou, French Guiana",lat:5.2322,lon:-52.7693},
{name:"Baikonur, Kazakhstan",lat:45.965,lon:63.305},
{name:"Jiuquan, China",lat:40.9581,lon:100.2915},
{name:"Wenchang, China",lat:19.6145,lon:110.951},
{name:"Sriharikota, India",lat:13.7199,lon:80.2304},
{name:"Tanegashima, Japan",lat:30.4009,lon:130.9703},
{name:"Mahia, New Zealand",lat:-39.2609,lon:177.8648}];
const FIELD_ICONS={
date:'<rect x="4" y="6" width="20" height="18" rx="3"/><path d="M4 12h20M10 3v5M18 3v5"/>',
launch:'<path d="M14 4c5 2 8 7 7 13l-4 3-6-6 3-10z"/><circle cx="16" cy="11" r="2"/><path d="M11 17l-5 1 2-5M12 22l-3 3"/>',
site:'<path d="M14 4l11 6-11 6L3 10z"/><path d="M3 15l11 6 11-6M3 20l11 6 11-6"/>'};
const ICONS={
education:'<path d="M24 12c-4-3-10-4-16-3v26c6-1 12 0 16 3 4-3 10-4 16-3V9c-6-1-12 0-16 3z"/><path d="M24 12v26"/>',
tourism:'<rect x="6" y="14" width="36" height="24" rx="4"/><path d="M17 14l3-5h8l3 5"/><circle cx="24" cy="26" r="7"/>',
business:'<path d="M8 32a16 16 0 0 1 32 0z"/><path d="M6 32h36v4H6z"/><path d="M24 16v16M17 18v14M31 18v14"/>'};
const QUIZ=[
{q:"Why does Earth stay in roughly the same part of the sky for a site on the near side?",o:["The Moon is tidally locked to Earth","The Moon does not rotate","Earth orbits the Moon every day"],a:0,e:"The Moon rotates once per orbit, so the same face always points at Earth. Libration makes Earth wobble slightly."},
{q:"Why can sites near the lunar poles have almost continuous sunlight?",o:["The poles are closer to the Sun","The Moon’s axis is tilted only about 1.5°","The poles reflect more light"],a:1,e:"With so little tilt, the Sun skims the horizon at the poles, so high ground can stay lit for long periods."},
{q:"What does the lack of an atmosphere change for the horizon?",o:["The Sun sets slowly through twilight","Light bends over the horizon","The Sun disappears abruptly with no twilight"],a:2,e:"Without an atmosphere there is no refraction or twilight, so the transition from light to dark is sharp."},
{q:"About how long is one lunar day, from sunrise to sunrise?",o:["About 29.5 Earth days","About 24 hours","About 7 Earth days"],a:0,e:"The synodic month is about 29.5 days, so a site has roughly two weeks of daylight and two weeks of night."}];

let profile=null,landing=null,landingToken=0,flight=null,flightToken=0,mission={launch:0,site:0},quiz={i:0,score:0,picked:null},lastKey="";




function visibility(id){document.querySelectorAll("[data-for]").forEach(el=>{el.hidden=!id||!el.dataset.for.split(" ").includes(id)})}
function stopLanding(){landingToken++;if(landing)landing.dispose();landing=null}
async function startLanding(){const token=++landingToken;try{const m=await import("./landing.js");if(token!==landingToken||document.getElementById("welcome").hidden)return;landing=m.createLanding(document.getElementById("ln-stage"),missionPreview())}catch(e){}}
function stopFlight(){flightToken++;if(flight)flight.dispose();flight=null}
async function startFlight(){stopFlight();const token=flightToken,s=SITES[mission.site],stage=document.getElementById("flight-stage");
try{const m=await import("./flight.js");if(token!==flightToken)return;
flight=m.createFlight({stage,info:document.getElementById("flight-info")},{startMs:start,launch:LAUNCH_SITES[mission.launch],site:s,sky:ms=>skyAt(ms,s)});await flight.ready}
catch(e){stage.textContent="Simulation unavailable: "+e.message}}
function setProfile(id){if(id==="tourism")id="business";profile=id;if(id!=="education")stopFlight();document.body.dataset.profile=id;visibility(id);
document.getElementById("profile-btn").textContent="Profile: "+PROFILES[id].label;
try{localStorage.setItem("orbitpass.profile",id)}catch(e){}
lastKey="";renderProfile()}
function closeWelcome(){document.getElementById("welcome").hidden=true;stopLanding()}
async function launchMission(){const w=document.getElementById("welcome");if(w.classList.contains("ln-launching"))return;
mission={launch:+document.getElementById("m-launch").value,site:+document.getElementById("m-site").value};
goMission(document.getElementById("m-date").value,mission.site);
w.classList.add("ln-launching");
previewMission();
if(landing)await landing.focusSite();
window.scrollTo(0,0);
setProfile("education");await startFlight();
w.classList.add("ln-leaving");
await Promise.all(w.getAnimations().map(a=>a.finished.catch(()=>{})));
closeWelcome()}
function openWelcome(){stopLanding();let last=null;try{last=localStorage.getItem("orbitpass.profile")}catch(e){}
const w=document.getElementById("welcome");
w.classList.remove("ln-launching","ln-leaving");
w.innerHTML=`<div class="ln-stage" id="ln-stage"></div><div class="ln-ui">
<div class="ln-logo"><svg viewBox="0 0 250 64" aria-label="OrbitPass"><path d="M10 44C40 62 150 66 232 26" fill="none" stroke="#59e3f7" stroke-width="2" stroke-linecap="round"/><circle cx="234" cy="25" r="4" fill="#59e3f7"/><text x="8" y="42" font-size="38" font-style="italic" font-weight="700" fill="#fff" font-family="Inter,system-ui,sans-serif">Orbit<tspan fill="#59e3f7">Pass</tspan></text></svg></div>
<form class="ln-mission" id="ln-mission" hidden><header><button type="button" class="ln-back" data-back="1" aria-label="Back"><svg viewBox="0 0 28 28"><path d="M17 5l-9 9 9 9"/></svg></button><svg class="ico" viewBox="0 0 48 48">${ICONS.education}</svg><h3>${PROFILES.education.label}</h3></header>
<label class="ln-field"><svg viewBox="0 0 28 28">${FIELD_ICONS.date}</svg><div><span>Date</span><input type="date" id="m-date" required></div></label>
<label class="ln-field"><svg viewBox="0 0 28 28">${FIELD_ICONS.launch}</svg><div><span>Launch Site</span><select id="m-launch">${LAUNCH_SITES.map((l,i)=>`<option value="${i}">${l.name}</option>`).join("")}</select></div></label>
<label class="ln-field"><svg viewBox="0 0 28 28">${FIELD_ICONS.site}</svg><div><span>Destination Base</span><select id="m-site"></select></div></label>
<button class="ln-go" type="submit">Go<svg viewBox="0 0 26 26"><path d="M3 13h19M14 5l8 8-8 8"/></svg></button></form>
<div class="ln-tag" id="ln-tag"><small>LUNAR MISSION EXPLORER</small><b>Explore · Learn · Plan Missions</b></div>
<div class="ln-cards" id="ln-cards">${Object.entries(PROFILES).filter(([id])=>id!=="tourism").map(([id,p])=>`<button class="ln-card" data-profile="${id}"><svg class="ico" viewBox="0 0 48 48">${ICONS[id]}</svg><h3>${p.label}</h3><svg class="go" viewBox="0 0 26 26"><path d="M3 13h19M14 5l8 8-8 8"/></svg><p>${p.text}</p>${id===last?'<span class="last">Last used</span>':""}</button>`).join("")}</div></div>`;
w.hidden=false;startLanding()}

function renderLessons(){const s=SITES[sel],st=stats[sel],h=+document.getElementById("t").value,sn=st.sun[h],ea=st.ear[h],hmax=s.hor?Math.max(...s.hor):null;
const L=[
["Lunar daylight & mission power",`Over the next 30 days ${s.name} has the Sun above the horizon ${f(st.sp)}% of the time. Its longest continuous darkness is ${f(st.dark/24,1)} days.`],
["Why polar sites matter",`The Moon’s axis is tilted only about 1.5°, so near the poles the Sun skims the horizon instead of climbing high. At this site (latitude ${f(s.lat,1)}°) the Sun averages ${f(st.ae,1)}° of elevation while it is up.`],
["Earth visibility & communications",`The same face of the Moon always points at Earth. At this site Earth is above the horizon ${f(st.ep)}% of the next 30 days. Right now it is at azimuth ${f(ea.az)}° and elevation ${f(ea.el,1)}°.`],
["Terrain horizon (LOLA)",hmax===null?"Terrain data is still loading, so a flat spherical horizon is used for now.":`A terrain model built from LRO laser altimetry puts the highest horizon at ${f(hmax,1)}° of elevation for this site, which delays sunrise and brings sunset forward.`],
["Choosing a mission window",`At ${s.name}, Sun and Earth are simultaneously visible ${f(st.bp)}% of the next 30 days. Compare dates using the Operating Window Finder in Pro mode.`]];
document.getElementById("lessons").innerHTML=L.map(([t,b])=>`<div class="card" style="cursor:default"><b>${t}</b><small style="display:block;margin-top:6px;line-height:1.5">${b}</small></div>`).join("")}

function renderQuiz(){const el=document.getElementById("quiz");
if(quiz.i>=QUIZ.length){el.innerHTML=`<div class="kpi"><span>Result</span><b>${quiz.score} / ${QUIZ.length}</b></div><div class="row" style="margin-top:10px"><button data-quiz="restart">Restart quiz</button></div>`;return}
const q=QUIZ[quiz.i],done=quiz.picked!==null;
el.innerHTML=`<div class="note" style="margin:0 0 6px">Question ${quiz.i+1} of ${QUIZ.length}</div><b>${q.q}</b><div class="qopts">${q.o.map((t,i)=>`<button class="qopt ${done?(i===q.a?"right":i===quiz.picked?"wrong":""):""}" data-opt="${i}" ${done?"disabled":""}>${t}</button>`).join("")}</div>${done?`<div class="note">${quiz.picked===q.a?"Correct. ":"Not quite. "}${q.e}</div><div class="row" style="margin-top:10px"><button data-quiz="next">${quiz.i+1<QUIZ.length?"Next question":"See result"}</button></div>`:""}`}
















function renderProfile(){if(!profile)return;
const h=+document.getElementById("t").value,key=[profile,sel,start,h,stats[sel]&&stats[sel].sp,hzState].join("|");
if(key===lastKey)return;lastKey=key;
if(profile==="education"){renderLessons();if(!document.getElementById("quiz").firstChild)renderQuiz()}
}



function missionPreview(){return{startMs:Date.parse(document.getElementById("date").value+"T00:00:00Z"),launch:LAUNCH_SITES[mission.launch]}}
function previewMission(){if(!landing)return;landing.setMission({startMs:Date.parse(document.getElementById("m-date").value+"T00:00:00Z"),launch:LAUNCH_SITES[+document.getElementById("m-launch").value]})}
function showMission(show){document.getElementById("ln-cards").hidden=show;document.getElementById("ln-tag").hidden=show;document.getElementById("ln-mission").hidden=!show;
if(!show)return;
document.getElementById("m-date").value=document.getElementById("date").value;
document.getElementById("m-launch").value=mission.launch;
const site=document.getElementById("m-site");site.innerHTML=SITES.map(s=>`<option value="${s.id}">${s.name}</option>`).join("");site.value=sel;previewMission()}
document.getElementById("welcome").addEventListener("click",e=>{const p=e.target.closest("[data-profile]");
if(e.target.closest("[data-back]"))return showMission(false);
if(!p)return;
if(p.dataset.profile==="education")return showMission(true);
setProfile(p.dataset.profile);closeWelcome()});
document.getElementById("welcome").addEventListener("change",e=>{if(e.target.id==="m-date"||e.target.id==="m-launch")previewMission()});
document.getElementById("welcome").addEventListener("submit",e=>{e.preventDefault();launchMission()});
document.getElementById("mission-change").addEventListener("click",()=>{openWelcome();showMission(true)});
document.getElementById("profile-btn").addEventListener("click",openWelcome);
document.getElementById("quiz").addEventListener("click",e=>{const o=e.target.closest("[data-opt]"),n=e.target.closest("[data-quiz]");
if(o){quiz.picked=+o.dataset.opt;if(quiz.picked===QUIZ[quiz.i].a)quiz.score++;renderQuiz()}
if(n){if(n.dataset.quiz==="restart")quiz={i:0,score:0,picked:null};else{quiz.i++;quiz.picked=null}renderQuiz()}});

visibility(null);
openWelcome();


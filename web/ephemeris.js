const R=Math.PI/180;
function lunar(jd){const d=jd-2451545,s=x=>Math.sin(x*R),c=x=>Math.cos(x*R);
const Lp=218.316+13.176396*d,Mp=134.963+13.064993*d,F=93.272+13.22935*d,D=297.85+12.190749*d,M=357.529+.9856*d;
const lam=Lp+6.289*s(Mp)+1.274*s(2*D-Mp)+.658*s(2*D)+.214*s(2*Mp)-.186*s(M);
const bet=5.128*s(F)+.2806*s(Mp+F)+.2777*s(Mp-F)+.1732*s(2*D-F);
const dist=385000.56-20905.355*c(Mp)-3699.111*c(2*D-Mp)-2955.968*c(2*D)-569.925*c(2*Mp)+48.888*c(M)-3.149*c(2*F)+246.158*c(2*D-2*Mp)-152.138*c(2*D-M-Mp)-170.733*c(2*D+Mp)-204.586*c(2*D-M)-129.62*c(Mp-M)+108.743*c(D)+104.755*c(M+Mp);
const lamS=280.46+.9856474*d+1.915*s(M)+.02*s(2*M),Om=125.045-.0529539*d;
return{lam,bet,dist,lamS,Om,F}}
function lib(l,b,Om,F){const I=1.5424*R,W=(l-Om)*R,B=b*R;
const A=Math.atan2(Math.sin(W)*Math.cos(B)*Math.cos(I)-Math.sin(B)*Math.sin(I),Math.cos(W)*Math.cos(B));
return{lon:((A/R-F)%360+540)%360-180,lat:Math.asin(-Math.sin(W)*Math.cos(B)*Math.sin(I)-Math.sin(B)*Math.cos(I))/R}}
function subPoints(jd){const e=lunar(jd);return{earth:lib(e.lam,e.bet,e.Om,e.F),sun:lib(e.lamS-180,0,e.Om,e.F)}}
function moonState(jd){const e=lunar(jd),I=1.5424*R,cb=Math.cos(e.bet*R),dir=[cb*Math.cos(e.lam*R),cb*Math.sin(e.lam*R),Math.sin(e.bet*R)];
return{pos:dir.map(x=>x*e.dist),pole:[-Math.sin(I)*Math.sin(e.Om*R),Math.sin(I)*Math.cos(e.Om*R),Math.cos(I)],lon:lib(e.lam,e.bet,e.Om,e.F).lon,sun:[Math.cos(e.lamS*R),Math.sin(e.lamS*R),0]}}
function look(t,lat,lon){const p=lat*R,b=t.lat*R,dl=(t.lon-lon)*R;
return{el:Math.asin(Math.sin(p)*Math.sin(b)+Math.cos(p)*Math.cos(b)*Math.cos(dl))/R,
az:(Math.atan2(Math.cos(b)*Math.sin(dl),Math.cos(p)*Math.sin(b)-Math.sin(p)*Math.cos(b)*Math.cos(dl))/R+360)%360}}

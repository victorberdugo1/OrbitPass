import * as THREE from './vendor/three.module.min.js';
import { DEM_MIN_M, DEM_MAX_M, MOON_RADIUS_M } from './dem.js';
import { HeightGrid, Walker } from './walker.js';

const RAD=Math.PI/180, LEVEL=5, WIDTH=256*(2<<LEVEL), HEIGHT=WIDTH/2;
const wrap=(v,n)=>((v%n)+n)%n;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const degLon=v=>wrap(v+180,360)-180;
const tileUrl=(x,y)=>`/trek/LRO_LOLA_DEM_Global_128ppd_v04/1.0.0/default/default028mm/${LEVEL}/${y}/${x}.png`;

export async function createSurface(host,site,onStatus){
  let stopped=false,raf=0;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x020409);
  const camera=new THREE.PerspectiveCamera(68,1,0.3,55000);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  host.replaceChildren(renderer.domElement);
  const hud=document.createElement('div');
  hud.style.cssText='position:absolute;top:12px;left:12px;right:12px;z-index:5;display:flex;flex-wrap:wrap;gap:8px;pointer-events:none;font:12px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000';
  const compass=document.createElement('div'),solar=document.createElement('div'),earthLabel=document.createElement('div');
  for(const el of [compass,solar,earthLabel]){el.style.cssText='background:#071422d9;border:1px solid #ffffff44;border-radius:8px;padding:7px 10px';hud.appendChild(el)}
  host.appendChild(hud);
  const skyLayer=document.createElement('div');
  skyLayer.style.cssText='position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden;font:12px system-ui,sans-serif';
  const makeMarker=(emoji,name,color)=>{
    const el=document.createElement('div');
    el.style.cssText=`position:absolute;display:none;transform:translate(-50%,-50%);padding:7px 10px;border-radius:20px;background:#071422e8;border:1px solid ${color};color:#fff;white-space:nowrap;text-shadow:0 1px 2px #000;box-shadow:0 2px 10px #0009`;
    el.textContent=`${emoji} ${name}`;skyLayer.appendChild(el);return el;
  };
  const sunMarker=makeMarker('☀','Sun','#ffcf64');
  const earthMarker=makeMarker('🌍','Earth','#7db8ff');
  host.appendChild(skyLayer);
  const horizonCanvas=document.createElement('canvas');
  horizonCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none';
  host.appendChild(horizonCanvas);
  const horizonToggle=document.createElement('button');
  horizonToggle.textContent='◡ LOLA horizon: ON';
  horizonToggle.style.cssText='position:absolute;bottom:14px;left:14px;z-index:6;padding:7px 11px;background:#071422e8;border:1px solid #76d6ff88;border-radius:7px;color:white;cursor:pointer;font:12px system-ui';
  host.appendChild(horizonToggle);
  let showHorizon=true;
  horizonToggle.addEventListener('click',()=>{showHorizon=!showHorizon;horizonToggle.textContent=`◡ LOLA horizon: ${showHorizon?'ON':'OFF'}`;dirty=true});
  const timePanel=document.createElement('div');
  timePanel.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#071422;border:1px solid #ffffff35;border-radius:10px;padding:9px 12px;color:white;font:12px system-ui,sans-serif';
  timePanel.innerHTML=`<b style="white-space:nowrap">⏱ Time Travel</b><button type="button" data-time-pause style="background:#142d43;border:1px solid #76d6ff88;border-radius:7px;color:#fff;padding:7px 12px;cursor:pointer;min-width:72px">⏸ Pause</button><input data-time-range aria-label="Simulation hour" type="range" min="0" max="719" value="0" step="1" style="flex:1;min-width:130px;accent-color:#78d6ff"><span data-time-label style="white-space:nowrap">—</span><span data-visibility style="flex-basis:100%;font-size:11px">Waiting for ephemeris…</span><span data-coverage style="font-size:11px;color:#a5b5c9">Horizon: local ≤12 km</span>`;
  const externalControls=document.getElementById('surface-time-controls');
  (externalControls||host).appendChild(timePanel);
  const pauseButton=timePanel.querySelector('[data-time-pause]');
  const globalPlay=document.getElementById('play');
  const syncPause=()=>{const running=globalPlay?.textContent.trim()==='Pause';pauseButton.textContent=running?'⏸ Pause':'▶ Play';pauseButton.setAttribute('aria-label',running?'Pause simulation':'Resume simulation')};
  pauseButton.addEventListener('click',()=>{globalPlay?.click();syncPause()});
  syncPause();
  const timeSlider=timePanel.querySelector('[data-time-range]');
  const timeLabel=timePanel.querySelector('[data-time-label]');
  const visibilityLabel=timePanel.querySelector('[data-visibility]');
  const coverageLabel=timePanel.querySelector('[data-coverage]');
  let timeStart=NaN,onTimeChange=null,farHorizon=null;
  timeSlider.addEventListener('input',()=>{if(onTimeChange)onTimeChange(Number(timeSlider.value))});
  const direction=(az,el)=>{const a=az*RAD,e=el*RAD;return new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e))};
  let terrain=null,nacTerrain=null,nacGeometry=null,nacMaterial=null,nacValidCount=0,dirty=true;
  let nacSampler=null,nacGrid=null,nacBorder=null,nacReady=false;
  const debug=document.createElement('div');
  debug.style.cssText='position:absolute;right:12px;top:12px;z-index:7;pointer-events:none;background:#071422e8;border:1px solid #76d6ff88;border-radius:8px;color:#fff;padding:8px 11px;font:12px system-ui;max-width:260px;line-height:1.55';
  debug.textContent='Terrain: loading…';host.appendChild(debug);
  const moveHelp=document.createElement('div');
  moveHelp.style.cssText='position:absolute;right:12px;bottom:12px;z-index:6;background:#071422dd;border:1px solid #ffffff44;border-radius:7px;color:#fff;padding:7px 10px;font:12px system-ui;pointer-events:none';
  moveHelp.textContent='W A S D · move  |  Shift · lope  |  Space · jump  |  Drag · look';host.appendChild(moveHelp);
  const gaitToggle=document.createElement('button');
  gaitToggle.style.cssText='position:absolute;bottom:14px;left:190px;z-index:6;padding:7px 11px;background:#071422e8;border:1px solid #76d6ff88;border-radius:7px;color:white;cursor:pointer;font:12px system-ui';
  host.appendChild(gaitToggle);
  const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text};
  const positionMarker=(el,data,name)=>{
    if(!data||!Number.isFinite(data.az)||!Number.isFinite(data.el)){el.style.display='none';return}
    const dir=direction(data.az,data.el),distance=9000;
    const world=camera.position.clone().addScaledVector(dir,distance);
    const view=world.clone().project(camera);
    const forward=new THREE.Vector3();camera.getWorldDirection(forward);
    const inFront=forward.dot(dir)>0;
    const onScreen=inFront&&view.z>-1&&view.z<1&&Math.abs(view.x)<.86&&Math.abs(view.y)<.76;
    const side=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
    const relativeAz=Math.atan2(dir.dot(side),dir.dot(forward))*180/Math.PI;
    const arrow=relativeAz>=0?'→':'←';
    const x=onScreen?(view.x+1)*50:(relativeAz>=0?92:8);
    const y=onScreen?(1-view.y)*50:Math.max(20,Math.min(80,50-(dir.y*35)));
    const visible=data.el>terrainHorizonAt(data.az);
    el.style.display='block';
    el.style.left=`${x}%`;el.style.top=`${y}%`;
    el.style.opacity=visible?'1':'.7';
    el.style.borderStyle=visible?'solid':'dashed';
    el.textContent=`${onScreen?'':arrow+' '}${name==='Sun'?'☀':'🌍'} ${name} · ${data.el.toFixed(1)}°${visible?'':' · blocked'}${onScreen?'':' · turn '+(relativeAz>=0?'right':'left')}`;
  };
  const localHorizonAt=az=>{
    const a=((az%360)+360)%360/2,i=Math.floor(a),t=a-i;
    return horizonSamples[i%180].el*(1-t)+horizonSamples[(i+1)%180].el*t;
  };
  const terrainHorizonAt=az=>{
    if(farHorizon&&farHorizon.length===360){
      const a=((az%360)+360)%360,i=Math.floor(a),t=a-i;
      return farHorizon[i]*(1-t)+farHorizon[(i+1)%360]*t;
    }
    return localHorizonAt(az);
  };
  const refreshVisibility=()=>{
    if(!currentSun||!currentEarth)return;
    const describe=(data,label)=>{
      if(!Number.isFinite(data.az)||!Number.isFinite(data.el))return `${label}: unavailable`;
      const limit=terrainHorizonAt(data.az),delta=data.el-limit;
      const state=Math.abs(delta)<=1?'🟡 near horizon':delta>1?'🟢 visible':'🔴 terrain blocked';
      return `${label} ${state} (${delta>=0?'+':''}${delta.toFixed(1)}° clearance)`;
    };
    visibilityLabel.textContent=`${describe(currentSun,'☀ Sun')} · ${describe(currentEarth,'🌍 Earth')}`;
    coverageLabel.textContent=farHorizon?'LOLA horizon: up to 200 km':'Local LOLA horizon: ≤12 km · distant terrain unknown';
  };
  const refreshMarkers=()=>{positionMarker(sunMarker,currentSun,'Sun');positionMarker(earthMarker,currentEarth,'Earth');refreshVisibility()};
  const fmt=n=>Number.isFinite(n)?n.toFixed(1)+'°':'—';
  const cardinal=a=>['N','NE','E','SE','S','SW','W','NW'][Math.round(((a%360)+360)%360/45)%8];
  let currentSun=null,currentEarth=null;
  const refreshHud=()=>{
    const heading=((yaw/RAD)%360+360)%360;
    compass.textContent=`🧭 ${cardinal(heading)} · ${fmt(heading)} heading`;
    if(currentSun)solar.textContent=`☀ Sun ${fmt(currentSun.az)} az · ${fmt(currentSun.el)} el${currentSun.up===false?' · below terrain horizon':''}`;
    if(currentEarth)earthLabel.textContent=`🌍 Earth ${fmt(currentEarth.az)} az · ${fmt(currentEarth.el)} el${currentEarth.up===false?' · obscured':''}`;
  };
  const ambient=new THREE.AmbientLight(0x8a98b8,0.23);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfff4df,2.0);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-13000;sun.shadow.camera.right=13000;
  sun.shadow.camera.top=13000;sun.shadow.camera.bottom=-13000;sun.shadow.camera.near=1;sun.shadow.camera.far=55000;
  sun.shadow.bias=-0.00025;scene.add(sun,sun.target);
  const range=12000,segments=256,step=2*range/segments;
  const cosLat=Math.max(.000001,Math.cos(site.lat*RAD));
  const coords=(x,z)=>{
    const lat=site.lat-z/MOON_RADIUS_M/RAD;
    const lon=degLon(site.lon+x/(MOON_RADIUS_M*cosLat)/RAD);
    return {lat:clamp(lat,-89.9999,89.9999),lon};
  };
  const keys=new Set();
  for(let j=0;j<=segments;j++)for(let i=0;i<=segments;i++){
    const {lat,lon}=coords(-range+i*step,-range+j*step);
    const px=((lon+180)/360)*WIDTH-.5,py=((90-lat)/180)*HEIGHT-.5;
    for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){
      const ix=wrap(Math.floor(px)+dx,WIDTH),iy=clamp(Math.floor(py)+dy,0,HEIGHT-1);
      keys.add(`${ix>>8},${iy>>8}`);
    }
  }
  if(keys.size>140)throw new Error('Too many DEM tiles near pole; choose a site farther from the exact pole.');
  onStatus(`Loading LOLA terrain (${keys.size} tiles)…`);
  const tiles=new Map(),entries=[...keys];let next=0;
  async function worker(){while(next<entries.length&&!stopped){
    const key=entries[next++],[x,y]=key.split(',').map(Number);
    try{
      const r=await fetch(tileUrl(x,y));if(!r.ok)throw Error('HTTP '+r.status);
      const blob=await r.blob(),bitmap=await createImageBitmap(blob,{colorSpaceConversion:'none'});
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
      tiles.set(key,ctx.getImageData(0,0,256,256).data);
      bitmap.close?.();
    }catch{tiles.set(key,null)}
  }}
  await Promise.all(Array.from({length:Math.min(8,entries.length)},worker));
  if(stopped)return {dispose(){}};
  const texel=(ix,iy)=>{
    ix=wrap(ix,WIDTH);iy=clamp(iy,0,HEIGHT-1);
    const data=tiles.get(`${ix>>8},${iy>>8}`);
    if(!data)return NaN;
    const red=data[((iy&255)*256+(ix&255))*4];
    return red===0?NaN:DEM_MIN_M+(red-1)*(DEM_MAX_M-DEM_MIN_M)/254;
  };
  function height(x,z){const {lat,lon}=coords(x,z),px=(lon+180)/360*WIDTH-.5,py=(90-lat)/180*HEIGHT-.5;
    const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
    const a=texel(ix,iy),b=texel(ix+1,iy),c=texel(ix,iy+1),d=texel(ix+1,iy+1);
    return [a,b,c,d].every(Number.isFinite)?a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy:NaN;
  }
  const center=height(0,0);
  if(!Number.isFinite(center))throw new Error('No valid LOLA elevation at this location.');
  const geometry=new THREE.PlaneGeometry(range*2,range*2,segments,segments);
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position;let missing=0;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),h=height(x,z);
    if(!Number.isFinite(h))missing++;
    const curvature=(x*x+z*z)/(2*MOON_RADIUS_M);
    positions.setY(i,(Number.isFinite(h)?h:center)-center-curvature);
  }
  if(missing>positions.count*.05)throw new Error('LOLA terrain incomplete for this area.');
  geometry.computeVertexNormals();
  const terrainGrid=HeightGrid.fromPositions(positions,range,segments);
  function makeRegolithBump(){
    const size=256,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d'),img=ctx.createImageData(size,size);
    let seed=314159265;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    const coarse=new Float32Array(32*32);
    for(let i=0;i<coarse.length;i++)coarse[i]=rand();
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const cx=x/8,cy=y/8,ix=Math.floor(cx),iy=Math.floor(cy),fx=cx-ix,fy=cy-iy;
      const smooth=t=>t*t*(3-2*t),tx=smooth(fx),ty=smooth(fy);
      const c=(xx,yy)=>coarse[((yy+32)%32)*32+(xx+32)%32];
      const low=(c(ix,iy)*(1-tx)+c(ix+1,iy)*tx)*(1-ty)+(c(ix,iy+1)*(1-tx)+c(ix+1,iy+1)*tx)*ty;
      const n=Math.round(110+65*(low-.5)+60*(rand()-.5));
      const k=(y*size+x)*4;img.data[k]=img.data[k+1]=img.data[k+2]=Math.max(0,Math.min(255,n));img.data[k+3]=255;
    }
    ctx.putImageData(img,0,0);
    const texture=new THREE.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(96,96);
    texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  const regolithBump=makeRegolithBump();
  const material=new THREE.MeshStandardMaterial({color:0xa5a19a,roughness:1,metalness:0,side:THREE.DoubleSide,bumpMap:regolithBump,bumpScale:0.32,flatShading:false});
  terrain=new THREE.Mesh(geometry,material);terrain.receiveShadow=true;terrain.castShadow=true;scene.add(terrain);

  const nacSite=site.name==='Shackleton NAC DTM (test)';
  if(nacSite){
    try{
      onStatus('Loading LROC NAC DTM (2 m source)…');
      const response=await fetch('data/nac_esall_sr12.png');
      if(!response.ok)throw new Error('NAC PNG HTTP '+response.status);
      const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none'});
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close?.();
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const lon0=site.lon*RAD,lat0=site.lat*RAD;
      const r0=2*MOON_RADIUS_M*Math.tan((Math.PI/2+lat0)/2);
      const px0=r0*Math.sin(lon0),py0=r0*Math.cos(lon0);
      const sample=(x,z)=>{
        const px=px0+x*Math.cos(lon0)-z*Math.sin(lon0);
        const py=py0-x*Math.sin(lon0)-z*Math.cos(lon0);
        const col=(px+5141)/2-0.5,row=(-4859-py)/2-0.5;
        const ix=Math.floor(col),iy=Math.floor(row),fx=col-ix,fy=row-iy;
        if(ix<0||iy<0||ix>=canvas.width-1||iy>=canvas.height-1)return NaN;
        const h=(xx,yy)=>{const k=((iy+yy)*canvas.width+ix+xx)*4;
          return pixels[k+3]===255?(pixels[k]*256+pixels[k+1])/10:NaN};
        const a=h(0,0),b=h(1,0),c=h(0,1),d=h(1,1);
        return [a,b,c,d].every(Number.isFinite)?a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy:NaN;
      };
      nacSampler=sample;
      const patch=2500,detail=512;
      nacGeometry=new THREE.PlaneGeometry(patch*2,patch*2,detail,detail);
      nacGeometry.rotateX(-Math.PI/2);
      const attr=nacGeometry.attributes.position,colors=new Float32Array(attr.count*3);
      let good=0;
      for(let i=0;i<attr.count;i++){
        const x=attr.getX(i),z=attr.getZ(i),nac=sample(x,z),lola=height(x,z);
        const base=Number.isFinite(lola)?lola:center;
        const edge=Math.min(patch-Math.abs(x),patch-Math.abs(z));
        const feather=clamp(edge/240,0,1);
        const valid=Number.isFinite(nac);
        const w=valid?feather:0;
        if(valid)good++;
        const elevation=base*(1-w)+(valid?nac:base)*w;
        attr.setY(i,elevation-center-(x*x+z*z)/(2*MOON_RADIUS_M)+0.12);
        const shade=valid?0.92:0.8;
        colors[3*i]=shade;colors[3*i+1]=shade;colors[3*i+2]=shade;
      }
      nacGrid=HeightGrid.fromPositions(attr,patch,detail);
      nacGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      nacGeometry.computeVertexNormals();
      nacMaterial=new THREE.MeshStandardMaterial({color:0xb5b0a7,roughness:1,metalness:0,side:THREE.DoubleSide,vertexColors:true,bumpMap:regolithBump,bumpScale:0.22});
      nacTerrain=new THREE.Mesh(nacGeometry,nacMaterial);
      nacTerrain.receiveShadow=true;nacTerrain.castShadow=true;scene.add(nacTerrain);
      nacValidCount=good;nacReady=good>0;
      const borderPositions=[];
      const borderStep=25;
      for(let z=-patch;z<patch;z+=borderStep)for(let x=-patch;x<patch;x+=borderStep){
        const inside=Number.isFinite(sample(x,z));
        if(!inside)continue;
        const edgeX=!Number.isFinite(sample(x+borderStep,z));
        const edgeZ=!Number.isFinite(sample(x,z+borderStep));
        const add=(ax,az,bx,bz)=>{
          const ah=sample(ax,az),bh=sample(bx,bz);
          if(!Number.isFinite(ah)||!Number.isFinite(bh))return;
          borderPositions.push(ax,ah-center-(ax*ax+az*az)/(2*MOON_RADIUS_M)+1.8,az,bx,bh-center-(bx*bx+bz*bz)/(2*MOON_RADIUS_M)+1.8,bz);
        };
        if(edgeX)add(x,z,x,z+borderStep);
        if(edgeZ)add(x,z,x+borderStep,z);
      }
      if(borderPositions.length){
        const outlineGeo=new THREE.BufferGeometry();outlineGeo.setAttribute('position',new THREE.Float32BufferAttribute(borderPositions,3));
        nacBorder=new THREE.LineSegments(outlineGeo,new THREE.LineBasicMaterial({color:0x44f4ba,depthTest:false,transparent:true,opacity:0.9}));
        nacBorder.visible=true;scene.add(nacBorder);
      }
      onStatus(`LROC NAC DTM · measured 2 m source · 512×512 mesh · ${Math.round(good/attr.count*100)}% valid patch`);
    }catch(e){onStatus('NAC unavailable; LOLA fallback: '+e.message)}
  }

  const horizonSamples=[];
  for(let az=0;az<360;az+=2){
    const a=az*RAD,dx=Math.sin(a),dz=-Math.cos(a);
    let maxAngle=-90;
    for(let r=150;r<=range-200;r+=150){
      const h=height(dx*r,dz*r);
      if(Number.isFinite(h)){
        const curvature=r*r/(2*MOON_RADIUS_M);
        const elevation=(h-center-curvature-1.7)/r;
        maxAngle=Math.max(maxAngle,Math.atan(elevation)/RAD);
      }
    }
    horizonSamples.push({az,el:maxAngle});
  }
  function drawHorizon(){
    const ctx=horizonCanvas.getContext('2d');if(!ctx)return;
    const w=horizonCanvas.width,h=horizonCanvas.height;ctx.clearRect(0,0,w,h);
    if(!showHorizon)return;
    ctx.strokeStyle='#71dcff';ctx.lineWidth=2;ctx.setLineDash([6,5]);
    let drawing=false;
    const samples=farHorizon&&farHorizon.length===360?Array.from({length:181},(_,i)=>({az:i*2,el:terrainHorizonAt(i*2)})):horizonSamples;
    for(const sample of [...samples,samples[0]]){
      const a=sample.az*RAD,e=sample.el*RAD;
      const dir=new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e));
      const forward=new THREE.Vector3();camera.getWorldDirection(forward);
      const point=camera.position.clone().addScaledVector(dir,9000).project(camera);
      if(forward.dot(dir)<=0||point.z<=-1||point.z>=1||Math.abs(point.x)>1.2||Math.abs(point.y)>1.2){
        if(drawing){ctx.stroke();drawing=false}continue;
      }
      const x=(point.x+1)*w/2,y=(1-point.y)*h/2;
      if(!drawing){ctx.beginPath();ctx.moveTo(x,y);drawing=true}else ctx.lineTo(x,y);
    }
    if(drawing)ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#8ce6ff';ctx.font='12px system-ui';ctx.fillText(farHorizon?'LOLA terrain horizon · up to 200 km':'LOLA local terrain horizon · ≤12 km',12,h-53);
  }
  const groundHeight=(x,z)=>{
    const base=terrainGrid.at(x,z),detail=nacGrid?nacGrid.at(x,z):NaN;
    return Number.isFinite(detail)?Math.max(base,detail):base;
  };
  const walker=new Walker(groundHeight,{x:0,z:0,limit:range-200,gait:'apollo'});
  let yaw=0,pitch=0,drag=false,lastX=0,lastY=0;
  const updateLook=()=>camera.lookAt(camera.position.x+Math.sin(yaw)*Math.cos(pitch)*100,camera.position.y+Math.sin(pitch)*100,camera.position.z-Math.cos(yaw)*Math.cos(pitch)*100);
  const placeCamera=()=>{camera.position.set(walker.x,walker.eyeY,walker.z);updateLook()};
  placeCamera();refreshHud();
  const down=e=>{drag=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)};
  const move=e=>{if(!drag)return;yaw-=(e.clientX-lastX)*.004;pitch=clamp(pitch+(e.clientY-lastY)*.004,-1.45,1.45);lastX=e.clientX;lastY=e.clientY;updateLook();dirty=true};
  const up=()=>drag=false;
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);
  renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
  renderer.domElement.style.touchAction='none';renderer.domElement.style.cursor='grab';
  let apolloGait=true;
  const refreshGaitToggle=()=>{gaitToggle.textContent=`🧑‍🚀 Lunar gravity: ${apolloGait?'ON':'OFF'}`};
  gaitToggle.addEventListener('click',()=>{apolloGait=!apolloGait;walker.setGait(apolloGait?'apollo':'explorer');refreshGaitToggle();placeCamera();dirty=true});
  refreshGaitToggle();
  const keysDown=new Set();
  const CONTROL_KEYS=['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'];
  const onKeyDown=e=>{
    if(stopped||!CONTROL_KEYS.includes(e.code))return;
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    keysDown.add(e.code);e.preventDefault();
  };
  const onKeyUp=e=>keysDown.delete(e.code);
  const onBlur=()=>keysDown.clear();
  window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',onBlur);
  const readInput=()=>({
    forward:Number(keysDown.has('KeyW'))-Number(keysDown.has('KeyS')),
    side:Number(keysDown.has('KeyD'))-Number(keysDown.has('KeyA')),
    lope:keysDown.has('ShiftLeft')||keysDown.has('ShiftRight'),
    jump:keysDown.has('Space'),
    yaw
  });
  const TELEMETRY_INTERVAL_MS=200;
  let lastFrame=performance.now(),lastTelemetry=0;
  const refreshTelemetry=now=>{
    if(now-lastTelemetry<TELEMETRY_INTERVAL_MS)return;
    lastTelemetry=now;
    const x=walker.x,z=walker.z;
    const measured=Number.isFinite(nacSampler?.(x,z));
    const blend=clamp(Math.min(2500-Math.abs(x),2500-Math.abs(z))/240,0,1);
    const active=nacReady&&measured&&blend>0.01;
    const html=`<b style="color:${active?'#55efb2':'#ffd27e'}">${active?'● NAC ACTIVE':'● LOLA FALLBACK'}</b><div>${active?'Measured NAC + LOLA blend':'LOLA terrain at observer'}</div><div>NAC footprint: ${nacReady?'green outline':'unavailable'} · ${nacValidCount?'valid mesh '+Math.round(nacValidCount/((513)*(513))*100)+'%':''}</div><div>Position: ${Math.round(x)} m E, ${Math.round(-z)} m N</div><div>${apolloGait?`Gravity 1.62 m/s² · ${walker.speed.toFixed(1)} m/s · ${walker.grounded?'on ground':'airborne '+(walker.y-groundHeight(x,z)).toFixed(1)+' m'}`:'Free exploration speed'}</div>`;
    if(debug.innerHTML!==html)debug.innerHTML=html;
  };
  const resize=()=>{if(stopped)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);horizonCanvas.width=w;horizonCanvas.height=h;dirty=true};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const frame=now=>{
    if(stopped)return;
    raf=requestAnimationFrame(frame);
    const dt=(now-lastFrame)/1000;lastFrame=now;
    if(walker.step(dt,readInput())){placeCamera();dirty=true}
    if(!dirty)return;
    dirty=false;
    refreshHud();refreshMarkers();drawHorizon();refreshTelemetry(now);
    renderer.render(scene,camera);
  };
  renderer.shadowMap.needsUpdate=true;
  raf=requestAnimationFrame(frame);
  onStatus(`${nacTerrain?'NAC DTM 2 m source / 512×512 local mesh + ':'LOLA only · '}LOLA 24 km context · horizon from LOLA · drag to look around`);
  return {
    setTimeline({hour,start,onHourChange,horizon}){
      if(stopped)return;timeStart=start;onTimeChange=onHourChange;farHorizon=horizon&&horizon.length===360?horizon:null;
      timeSlider.value=String(clamp(hour,0,719));
      timeLabel.textContent=Number.isFinite(timeStart)?new Date(timeStart+Number(timeSlider.value)*3600000).toISOString().slice(0,16).replace('T',' ')+' UTC':'Hour '+timeSlider.value;
      syncPause();dirty=true;
    },
    setSun({az,el,up}){if(stopped)return;currentSun={az,el,up};dirty=true;const a=az*RAD,e=el*RAD;
      sun.position.set(Math.sin(a)*Math.cos(e)*24000,Math.sin(e)*24000,-Math.cos(a)*Math.cos(e)*24000);
      sun.intensity=el>0?2.1:.08;
      renderer.shadowMap.needsUpdate=true;
    },
    setEarth(data){if(stopped)return;currentEarth=data;dirty=true},
    dispose(){stopped=true;cancelAnimationFrame(raf);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',onBlur);observer.disconnect();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',up);geometry.dispose();material.dispose();nacGeometry?.dispose();nacMaterial?.dispose();nacBorder?.geometry.dispose();nacBorder?.material.dispose();regolithBump.dispose();renderer.dispose();renderer.domElement.remove();hud.remove();skyLayer.remove();horizonCanvas.remove();horizonToggle.remove();gaitToggle.remove();timePanel.remove();debug.remove();moveHelp.remove()}
  };
}

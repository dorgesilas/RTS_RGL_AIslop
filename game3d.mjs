import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
(()=>{'use strict';
const $=id=>document.getElementById(id);
const canvas=$('scene'),fxLayer=$('fxLayer'),fxCtx=fxLayer.getContext('2d'),stage=$('stage'),toastEl=$('toast'),popup=$('formationPopup');
// v3.4.1 hotfix: renamed the crystal's float offset so it no longer collides with the pointer-hover object; ignores invalid mesh transforms.
// v2.9 tower paint pass: rook beacon now uses exactly the same baked matte
// light/shade geometry and materials as painted soldiers, not Lambert lighting.
// Soldier palette, ground, camera, gameplay and sky are unchanged.
const scene=new THREE.Scene();scene.background=new THREE.Color('#273847');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;
// One directional shadow map; BasicShadowMap means hard-edge cast shadows.
// A device-sensitive cap keeps Android memory and fill costs manageable.
const mobileShadowDevice=window.matchMedia('(pointer:coarse)').matches;
let shadowsEnabled=true;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.BasicShadowMap;
const camera=new THREE.OrthographicCamera(-10,10,5.8,-5.8,.1,90);
camera.position.set(16,17,20);camera.lookAt(0,0,0);
// Gentle global fill, with ONE clear warm key light from upper-right.
// This makes the shaded parts of ceramic figurines noticeably darker without using glossy surfaces.
const skyFill=new THREE.HemisphereLight(0xfff9eb,0x82978b,.82);scene.add(skyFill);
const coolFill=new THREE.DirectionalLight(0xe6f1ef,.03);coolFill.position.set(-9,8,12);scene.add(coolFill);
const sun=new THREE.DirectionalLight(0xffedcc,1.32);
sun.position.set(9,15,-10);sun.target.position.set(0,0,0);
scene.add(sun);scene.add(sun.target);
sun.castShadow=true;
const shadowSize=mobileShadowDevice?1024:2048;
sun.shadow.mapSize.set(shadowSize,shadowSize);
sun.shadow.camera.left=-10.5;
sun.shadow.camera.right=10.5;
sun.shadow.camera.top=10.5;
sun.shadow.camera.bottom=-10.5;
sun.shadow.camera.near=.5;
sun.shadow.camera.far=43;
sun.shadow.bias=-.00022;
sun.shadow.normalBias=.035;
sun.shadow.radius=0;
// ShadowMaterial is transparent over the painted, unlit colors, not a replacement material.
// This keeps the deliberately authored face palette while allowing geometry to block sunlight.
const shadowInk=new THREE.ShadowMaterial({color:0x13202b,opacity:.48,side:THREE.DoubleSide});
shadowInk.depthWrite=false;
shadowInk.polygonOffset=true;
shadowInk.polygonOffsetFactor=-1;
shadowInk.polygonOffsetUnits=-1;
const shadowReceivers=[];
const dynamicPools=new Map();const materialCache=new Map();
let usedPools=new Map();
function materialFor(color,unlit=false){
 const key=color+(unlit?'u':'l');
 if(!materialCache.has(key)){
  // Matte painted ceramics: no metalness, specular shine, or emissive glow.
  const mat=unlit
   ?new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,toneMapped:false})
   :new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide});
  materialCache.set(key,mat);
 }
 return materialCache.get(key);
}
// Baked illustration-style sunlight on large box faces: light top, bright left/front,
// softly shaded opposing side. There is no computed cast shadow or black overlay.
const PAINTED_TERRAIN=new Set([
 '#6e8290','#607784','#79909d','#46647a','#3d5a70','#527085','#8e9a96','#bdb8a2','#d8d1ae',
 '#9da7a2','#6a8a81','#58786e','#70898a','#c7c2b1','#efe1bc','#ddd4ad','#c6d7ca','#aac6bb'
]);
const facePalette=[1.07,.61,.81,.69,.91,.65]; // illustrated face values: sunny top, dark underside, then four distinct side faces
function paintedBlockMaterials(color){
 const key='PAINT:'+color;
 if(!materialCache.has(key)){
  const c=new THREE.Color(color);
  const faces=facePalette.map(f=>{
   const v=c.clone();v.multiplyScalar(f);
   return new THREE.MeshBasicMaterial({color:v,side:THREE.DoubleSide,toneMapped:false});
  });
  materialCache.set(key,faces);
 }
 return materialCache.get(key);
}
function mesh(data){const p=[],n=[];for(const tri of data)for(const [pos,nor] of tri){p.push(...pos);n.push(...nor)}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
 geo.computeBoundingSphere();return {geometry:geo,count:p.length/3,tris:data,id:geo.uuid};
}
function face(a,b,c,d,n){return [[[a,n],[b,n],[c,n]],[[a,n],[c,n],[d,n]]]}
const cube=mesh([
 ...face([-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5],[0,1,0]),
 ...face([-.5,-.5,.5],[.5,-.5,.5],[.5,-.5,-.5],[-.5,-.5,-.5],[0,-1,0]),
 ...face([-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[0,0,-1]),
 ...face([.5,-.5,.5],[-.5,-.5,.5],[-.5,.5,.5],[.5,.5,.5],[0,0,1]),
 ...face([.5,-.5,-.5],[.5,-.5,.5],[.5,.5,.5],[.5,.5,-.5],[1,0,0]),
 ...face([-.5,-.5,.5],[-.5,-.5,-.5],[-.5,.5,-.5],[-.5,.5,.5],[-1,0,0])
]);
for(let side=0;side<6;side++)cube.geometry.addGroup(side*6,6,side);
function sphereMesh(){const tris=[],rows=6,cols=10;for(let j=0;j<rows;j++){let a=-Math.PI/2+j*Math.PI/rows,b=-Math.PI/2+(j+1)*Math.PI/rows;for(let i=0;i<cols;i++){let u=i*2*Math.PI/cols,v=(i+1)*2*Math.PI/cols;let at=(w,t)=>[Math.cos(w)*Math.cos(t),Math.sin(w),Math.cos(w)*Math.sin(t)];let a1=at(a,u),a2=at(a,v),b1=at(b,u),b2=at(b,v);tris.push([[a1,a1],[a2,a2],[b2,b2]],[[a1,a1],[b2,b2],[b1,b1]]);}}return mesh(tris)}
const ball=sphereMesh();
function coneMesh(){let t=[],N=8;for(let i=0;i<N;i++){let a=i*Math.PI*2/N,b=(i+1)*Math.PI*2/N;let p=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],q=[Math.cos(b)*.5,-.5,Math.sin(b)*.5],top=[0,.5,0];let n=[(p[0]+q[0]),.4,(p[2]+q[2])];t.push([[p,n],[top,n],[q,n]],[[q,[0,-1,0]],[p,[0,-1,0]],[[0,-.5,0],[0,-1,0]]]);}return mesh(t)}
const cone=coneMesh();
// Reusable low-triangle-count ceramics: smoothed vertex normals make these look curved rather than faceted.
function lathe(profile,steps=14){
 const tris=[],v=(r,y,t)=>[r*Math.cos(t),y,r*Math.sin(t)];
 // Share a computed normal at each profile ring so neighboring surfaces shade
 // continuously. Number of actual triangles is unchanged from the v0.6 mesh.
 const normals=profile.map(([r,y],j)=>{
  let rx=0,ny=0;
  for(const k of [j-1,j]){
   if(k<0||k>=profile.length-1)continue;
   const [a,ay]=profile[k],[b,by]=profile[k+1];
   const dr=b-a,dy=by-ay,ln=Math.hypot(dr,dy)||1;
   rx+=dy/ln;ny-=dr/ln;
  }
  const ln=Math.hypot(rx,ny)||1;
  return r===0?[0,ny>=0?1:-1]:[rx/ln,ny/ln];
 });
 const normal=(j,t)=>[Math.cos(t)*normals[j][0],normals[j][1],Math.sin(t)*normals[j][0]];
 for(let j=0;j<profile.length-1;j++){
  const [ra,ya]=profile[j],[rb,yb]=profile[j+1];
  for(let i=0;i<steps;i++){
   const a=2*Math.PI*i/steps,b=2*Math.PI*(i+1)/steps;
   const p=v(ra,ya,a),q=v(ra,ya,b),r=v(rb,yb,b),w=v(rb,yb,a);
   const na=normal(j,a),nb=normal(j,b),nc=normal(j+1,b),nd=normal(j+1,a);
   tris.push([[p,na],[q,nb],[r,nc]],[[p,na],[r,nc],[w,nd]]);
  }
 }
 return mesh(tris);
}
// Smooth faceless blank head, tapered chess-piece robe, and the historically
// recognisable wide-brim kettle/sallet-inspired helmet. Profiles are local units.
const ceramicBody=lathe([[.188,.035],[.190,.06],[.175,.17],[.154,.36],[.121,.58],[.106,.66]],14);
const ceramicHeroCape=lathe([[.222,.055],[.218,.09],[.205,.24],[.183,.47],[.162,.64],[.105,.73]],14);
const ceramicShoulder=lathe([[.153,.57],[.184,.60],[.185,.64],[.154,.715],[.118,.737],[.107,.75]],14);
const ceramicHead=lathe([[.075,.716],[.112,.75],[.139,.831],[.126,.898],[.090,.951],[0,.97]],16);
const ceramicHat=lathe([[.143,.893],[.212,.901],[.242,.918],[.238,.934],[.178,.950],[.166,.978],[.153,1.046],[.108,1.111],[0,1.137]],18);
const ceramicSkirtBand=lathe([[.191,.065],[.195,.068],[.195,.082],[.185,.088]],14);
const ceramicGrip=lathe([[.075,.05],[.072,.12],[.072,.26],[.076,.35]],12);
const spearTip=lathe([[.046,0],[.049,.035],[.065,.06],[.068,.10],[.026,.13],[0,.33]],12);
const swordBlade=lathe([[0,0],[.038,.085],[.042,.45],[.045,.53]],8);
const ceramicRidge=lathe([[0,.0],[.025,.025],[.019,.08],[0,.10]],12);
// Crisp, stylized mesh silhouettes: no shadow textures, no soft filtering or extra WebGL passes.
function flatPolygon(points){const tris=[],normal=[0,1,0],v=([x,z])=>[x,0,z];
 for(let i=1;i<points.length-1;i++)tris.push([[v(points[0]),normal],[v(points[i]),normal],[v(points[i+1]),normal]]);
 return mesh(tris);
}
function diskMesh(n=16){const points=[];for(let i=0;i<n;i++){let a=i*2*Math.PI/n;points.push([Math.cos(a),Math.sin(a)])}return flatPolygon(points)}
const shadowDisk=diskMesh(14);
// Faceted directional tail, aligned with the sun; inspired by flat graphic illustration.
const shadowWedge=flatPolygon([[-.20,-.11],[-.14,-.23],[.44,-.70],[.64,-.63],[.60,-.45],[.19,.13],[.00,.18]]);
const shadowStrip=flatPolygon([[-.08,-.03],[.42,-.03],[.56,.0],[.42,.03],[-.08,.03]]);
const rookBody=lathe([[.36,0],[.40,.045],[.41,.12],[.32,.18],[.255,.30],[.245,.64],[.31,.73],[.35,.795],[.35,.85]],16);
const rookLip=lathe([[.39,.76],[.43,.785],[.43,.84],[.37,.875]],16);
const rookTop=lathe([[.0,.815],[.35,.815],[.35,.84],[.0,.84]],16);
// Bow is one low-poly curved branch, not the previous line of disconnected little spheres.
function curveTube(points,r=.026,sides=7){const tris=[];
 const ring=(i)=>{let p=points[i],before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];let dx=after[0]-before[0],dy=after[1]-before[1],len=Math.hypot(dx,dy)||1;let nx=-dy/len,ny=dx/len;return Array.from({length:sides},(_,j)=>{let a=2*Math.PI*j/sides;return [p[0]+r*nx*Math.cos(a),p[1]+r*ny*Math.cos(a),r*Math.sin(a)]})};
 const rings=points.map((_,i)=>ring(i));
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++){const k=(j+1)%sides,a=rings[i][j],b=rings[i][k],c=rings[i+1][k],d=rings[i+1][j];let n=[a[0]-points[i][0],a[1]-points[i][1],a[2]],m=[b[0]-points[i][0],b[1]-points[i][1],b[2]];tris.push([[a,n],[b,m],[c,m]],[[a,n],[c,m],[d,n]])}
 return mesh(tris);
}
const curvedBow=curveTube([[-.04,.50],[.055,.63],[.15,.80],[.19,.99],[.15,1.16],[.055,1.33],[-.04,1.45]],.033,7);
// A simple crescent ribbon, not physically simulated, used for the sword slash.
function makeSlash(){const p=[[-.38,.08],[-.32,.28],[-.18,.51],[.08,.66],[.32,.58],[.42,.38]],w=.075,tris=[];
 for(let i=0;i<p.length-1;i++){let a=[p[i][0],p[i][1]-w/2,.02],b=[p[i][0],p[i][1]+w/2,.02],c=[p[i+1][0],p[i+1][1]+w/2,.02],d=[p[i+1][0],p[i+1][1]-w/2,.02];const n=[0,0,1];tris.push([[a,n],[b,n],[c,n]],[[a,n],[c,n],[d,n]])}
 return mesh(tris);
}
const slashArc=makeSlash();

const colors={ground:'#82b38c',vanguard:'#e97060',lancer:'#3eb6bc',archer:'#edb34b',healer:'#b184df',enemy:'#d64c64',brute:'#b93f5e',swift:'#ee806e'};
function rgb(s){return [parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255]}
function blendHex(base,accent,amount){const a=rgb(base),b=rgb(accent);return '#'+a.map((v,i)=>Math.round((v*(1-amount)+b[i]*amount)*255).toString(16).padStart(2,'0')).join('')}
const tintCache=new Map();function tint(s){if(!tintCache.has(s))tintCache.set(s,rgb(s));return tintCache.get(s)}
// Units now use the SAME material family as our illustrated terrain: MeshBasicMaterial.
// Light/shade bands are baked into mesh vertex colors, using the fixed scene sun.
// Geometry variants are shared across ALL troops by shape and facing bucket.
// No additional lights, shader patches, textures, or per-frame geometry updates needed.
const paintedUnitMaterialCache=new Map();
const paintedUnitGeometryCache=new Map();
const paintedUnitSun=new THREE.Vector3(9,15,-10).normalize();
const PAINT_DIRECTIONS=16;
function paintedUnitMaterial(color){
 let mat=paintedUnitMaterialCache.get(color);
 if(!mat){
  mat=new THREE.MeshBasicMaterial({color,vertexColors:true,side:THREE.DoubleSide,toneMapped:false});
  paintedUnitMaterialCache.set(color,mat);
 }
 return mat;
}
function paintedUnitGeometry(shape,rotation){
 const bucket=((Math.round(rotation*PAINT_DIRECTIONS/(Math.PI*2))%PAINT_DIRECTIONS)+PAINT_DIRECTIONS)%PAINT_DIRECTIONS;
 const key=shape.id+':'+bucket;
 let geo=paintedUnitGeometryCache.get(key);
 if(geo)return geo;
 geo=shape.geometry.clone();
 const normals=geo.getAttribute('normal');
 const vertexColors=new Float32Array(normals.count*3);
 const angle=bucket*Math.PI*2/PAINT_DIRECTIONS,cs=Math.cos(angle),sn=Math.sin(angle);
 for(let i=0;i<normals.count;i++){
  const nx=normals.getX(i),ny=normals.getY(i),nz=normals.getZ(i);
  const worldX=cs*nx+sn*nz, worldZ=-sn*nx+cs*nz;
  const sunFacing=worldX*paintedUnitSun.x+ny*paintedUnitSun.y+worldZ*paintedUnitSun.z;
  // Shared illustrated light vocabulary: distinct light/mid/shaded bands,
  // but never crush an entire character into v2.7's darker Lambert lighting.
  const paint=sunFacing>.50?1.00:sunFacing>.10?.92:sunFacing>-.36?.83:.75;
  vertexColors[i*3]=paint;
  vertexColors[i*3+1]=paint;
  vertexColors[i*3+2]=paint;
 }
 geo.setAttribute('color',new THREE.BufferAttribute(vertexColors,3));
 paintedUnitGeometryCache.set(key,geo);
 return geo;
}

const unitOutlineMaterialCache=new Map();
function unitOutlineMaterial(color,alpha){
 const key=color+'|'+alpha;
 let mat=unitOutlineMaterialCache.get(key);
 if(!mat){
  mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:alpha,side:THREE.BackSide,depthWrite:false,toneMapped:false});
  unitOutlineMaterialCache.set(key,mat);
 }
 return mat;
}
function drawUnitOutline(shape,x,y,z,sx,sy,sz,color,rot=0,alpha=.10){
 if(![x,y,z,sx,sy,sz,rot].every(Number.isFinite))return;
 const a=alpha>=.22?'.22':alpha>=.14?'.14':'.08';
 const key=shape.id+'|'+color+'|outline|'+a;
 let pool=dynamicPools.get(key);if(!pool){pool=[];dynamicPools.set(key,pool)}
 const index=usedPools.get(key)||0;let obj=pool[index];
 if(!obj){
  obj=new THREE.Mesh(paintedUnitGeometry(shape,rot),unitOutlineMaterial(color,Number(a)));
  obj.frustumCulled=false;obj.renderOrder=5;scene.add(obj);pool.push(obj);
 }
 obj.geometry=paintedUnitGeometry(shape,rot);
 usedPools.set(key,index+1);obj.visible=true;
 obj.position.set(x,y,z);obj.rotation.set(0,rot,0);obj.scale.set(sx*1.085,sy*1.085,sz*1.085);
 obj.castShadow=false;obj.receiveShadow=false;
}
function draw(shape,x,y,z,sx,sy,sz,color,rot=0,paintUnit=false){
 // Reject invalid transforms before they reach Three.js or the shadow map.
 if(![x,y,z,sx,sy,sz,rot].every(Number.isFinite))return;
 const isSeam=color==='#fff0b1';
 const isEffect=shape===shadowDisk||shape===shadowWedge||shape===shadowStrip||shape===slashArc;
 const unlit=isSeam||isEffect;
 const key=shape.id+'|'+color+'|'+(paintUnit?'painted':unlit?'u':'l');
 let pool=dynamicPools.get(key);if(!pool){pool=[];dynamicPools.set(key,pool)}
 const index=usedPools.get(key)||0;let obj=pool[index];
 if(!obj){
  const mat=paintUnit?paintedUnitMaterial(color):((shape===cube&&PAINTED_TERRAIN.has(color))?paintedBlockMaterials(color):materialFor(color,unlit));
  obj=new THREE.Mesh(paintUnit?paintedUnitGeometry(shape,rot):shape.geometry,mat);
  obj.frustumCulled=false;scene.add(obj);pool.push(obj);
 }
 if(paintUnit)obj.geometry=paintedUnitGeometry(shape,rot);
 usedPools.set(key,index+1);obj.visible=true;obj.position.set(x,y,z);obj.rotation.set(0,rot,0);obj.scale.set(sx,sy,sz);
 // Only genuinely elevated environment geometry and recognisable soldier silhouette
 // pieces enter the light's depth pass. Small trim/particles/health bars stay free.
 const paintedBox=shape===cube&&PAINTED_TERRAIN.has(color);
 const tallBlock=paintedBox&&sy>2.08;
 const towerPart=shape===rookBody||shape===rookLip||shape===rookTop||shape===cone||shape===ball;
 const soldierPart=paintUnit&&(shape===ceramicBody||shape===ceramicHeroCape||shape===ceramicHead||shape===ceramicHat||shape===ceramicShoulder||shape===spearTip||shape===swordBlade||shape===curvedBow);
 obj.castShadow=shadowsEnabled&&(tallBlock||towerPart||soldierPart);
 obj.receiveShadow=false; // The illustrated material is deliberately unlit.
 // Overlay the SAME geometry with Three.js's transparent ShadowMaterial.
 // It receives real cast shadows while leaving the custom baked color bands intact.
 const canReceive=paintedBox||towerPart;
 if(canReceive){
  let receiver=obj.userData.shadowReceiver;
  if(!receiver){
   receiver=new THREE.Mesh(obj.geometry,shadowInk);
   receiver.castShadow=false;receiver.receiveShadow=true;
   receiver.renderOrder=6;
   receiver.frustumCulled=false;
   obj.add(receiver);
   obj.userData.shadowReceiver=receiver;
   shadowReceivers.push(receiver);
  }
  if(receiver.geometry!==obj.geometry)receiver.geometry=obj.geometry;
  receiver.visible=shadowsEnabled;
 }else if(obj.userData.shadowReceiver){obj.userData.shadowReceiver.visible=false;}

}
function startDraw(){usedPools.clear()}
function finishDraw(){for(const [key,pool] of dynamicPools){const n=usedPools.get(key)||0;for(let i=n;i<pool.length;i++)pool[i].visible=false}}
const W=13,H=10,obstacles=new Set(['2,2','2,3','3,2','9,1','10,1','10,2','1,7','2,7','9,7','10,7','8,8','4,1','5,1','11,5']);
const heights=Array.from({length:H},(_,j)=>Array.from({length:W},(_,i)=>{if(obstacles.has(`${i},${j}`))return 1.25+((i+j)%3)*.38;return ((i*19+j*13)%11<3)? .34:((i*7+j*3)%19===0?.58:0)}));
const terrain=(x,z)=>heights[Math.max(0,Math.min(H-1,Math.round(z)))][Math.max(0,Math.min(W-1,Math.round(x)))];
const blocked=(x,z)=>x<0||z<0||x>=W||z>=H||obstacles.has(`${x},${z}`);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const form={shield:{name:'Shieldwall',damage:.76,incoming:.70,speed:.82},balanced:{name:'Balanced',damage:1,incoming:1,speed:1},spear:{name:'Spearhead',damage:1.32,incoming:1.45,speed:1.25}};
const specs=[
{id:0,name:'Bran',type:'vanguard',role:'AoE melee',hp:185,damage:19,range:1.5,rate:1.12,speed:2.0,cd:13,ability:'Roundhouse'},
{id:1,name:'Kael',type:'lancer',role:'2-tile spear',hp:169,damage:31,range:2,rate:1.05,speed:2.2,cd:12,ability:'Long Thrust'},
{id:2,name:'Wren',type:'archer',role:'4-tile bow',hp:125,damage:28,range:4,rate:.86,speed:2.3,cd:12,ability:'Bullseye'},
{id:3,name:'Mira',type:'healer',role:'3-tile single heal',hp:140,damage:0,range:3,rate:1.9,speed:2.2,cd:13,ability:'Focused Mend'}];
const OFFENSIVE=['vanguard','lancer','archer'];
const REGIMENTS=['vanguard','lancer','archer','knight'];
const MAX_SLOTS=4,MAX_WAVES=3;
// Small wave-one baseline gives a solo regiment time to establish its two detachments.
// A shared scaling curve is applied to ENEMY COUNTS, not HP or damage.
const SOLO_WAVE_COUNTS=[3,6,10];
// 2P: +75% over solo, 3P: +125%, 4P: +175%.
const PLAYER_THREAT=[1,1.75,2.25,2.75];
function waveDifficulty(wave,playerCount){
 const p=Math.max(1,Math.min(4,Math.round(playerCount)||1));
 const n=Math.max(1,Math.min(MAX_WAVES,Math.round(wave)||1));
 const base=SOLO_WAVE_COUNTS[n-1],factor=PLAYER_THREAT[p-1];
 return {players:p,base,multiplier:factor,count:Math.round(base*factor)};
}
const KIND_NAMES={vanguard:'Swords',lancer:'Spears',archer:'Bows',knight:'Knights'};
const net={mode:'solo',room:'',token:'',slot:0,members:[],events:null,sending:false,lastSend:0};
let state,selected=-1,lastTime=performance.now(),hover=null,pointerDown=null,currentPopup=null,dirty=true,toastTimeout=0,uiStamp='',cardsStamp='';
function ownSquads(owner=net.slot){return state.squads.filter(s=>!s.retired&&s.owner===owner)}
// A regiment consists of TWO independent detachments, but costs ONE deployment slot.
function ownDeployments(owner=net.slot){return ownSquads(owner).filter(s=>s.cost>0)}
function partnerOf(s){return s?.archetype==='regiment'?state.squads.find(t=>t!==s&&!t.retired&&t.groupId===s.groupId):null}
function deploymentOf(s){return s?.archetype==='regiment'&&s.regimentHalf===1?state.squads[s.groupId]:s} 
function owns(id){const s=state.squads[id];return !!s&&!s.retired&&s.owner===net.slot}
function usedSlots(owner){return ownSquads(owner).reduce((n,s)=>n+s.cost,0)}
function freeSlots(owner){return Math.max(0,MAX_SLOTS-usedSlots(owner))}
function slotAssignments(owner=net.slot){const slots=[];for(const s of ownDeployments(owner)){slots.push(s);for(let j=1;j<s.cost;j++)slots.push({reserved:true,unit:s})}while(slots.length<MAX_SLOTS)slots.push(null);return slots.slice(0,MAX_SLOTS)}
function players(){return state.players||[0]}
function roll(arr){return arr[Math.floor(Math.random()*arr.length)]}
function randomDraft(){return{hero:roll(OFFENSIVE),regiment:roll(REGIMENTS)}}
function makeState(){return{phase:'menu',time:0,wave:0,beacon:220,maxBeacon:220,paused:false,speed:1,ended:false,win:false,squads:[],enemies:[],nextId:0,queue:[],defeated:0,effects:[],strikes:[],players:[0],drafts:{},ready:{},wallet:{},offers:{},shopVersion:0,roundDoneAt:0,wavePlan:null}}
function reset(){state=makeState();selected=-1;uiStamp='';cardsStamp='';lastTime=performance.now();$('endOverlay').hidden=true;dirty=true;makeCards();syncHUD();renderFlow()}
function notify(str,sec=2){toastEl.textContent=str;toastEl.classList.add('show');toastTimeout=performance.now()+sec*1000}
function spawnPoint(owner,idx){const starts=[{x:4,z:5},{x:7,z:4},{x:4,z:6},{x:5,z:5}];const p=starts[owner]||starts[0];const near=[[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1]];for(let j=idx;j<near.length;j++){const x=p.x+near[j][0],z=p.z+near[j][1];if(!blocked(x,z)&&!state.squads.some(s=>!s.retired&&Math.hypot(s.x-x,s.z-z)<.55))return{x,z}}return p}
function recruit(owner,archetype,type){const cost=archetype==='lone'?2:1;if(freeSlots(owner)<cost)return false;
 const base=specs.find(s=>s.type===type)||specs[0];const army=archetype==='regiment';const lone=archetype==='lone';const point=spawnPoint(owner,ownDeployments(owner).length);
 const name=lone?'Lone Swordsman':army?`${KIND_NAMES[type]} Regiment`:base.name;
 const maxHp=lone?335:army?(type==='knight'?164:145):base.hp;
 const s={...base,id:state.squads.length,owner,archetype,cost,type,name,x:point.x,z:point.z,role:lone?'2-slot • two skills':army?'Two detachments · banner visual only':'Hero + soldiers',hp:maxHp,maxHp,damage:lone?49:army?(type==='knight'?19:17):base.damage,range:army?(type==='archer'?3.4:type==='lancer'?1.9:1.45):base.range,rate:lone?.83:army?1.08:base.rate,speed:lone?2.7:base.speed,cd:lone?8:base.cd,ability:lone?'Sweeping Cut':army?'Aura (passive)':base.ability,formation:'balanced',soldiers:lone?0:army?5:4,soldiersMax:lone?0:army?5:4,alive:true,retired:false,level:0,mutation:null,cooldown:0,cooldown2:0,cooldown3:0,cooldown4:0,attack:.15,heal:1,heading:0,route:[],motion:0,flash:0,attackPulse:0,strikeDir:{x:0,z:1},hitCount:0,groupId:army?state.squads.length:null,regimentHalf:army?0:null};
 state.squads.push(s);
 if(army){
  const second=spawnPoint(owner,ownDeployments(owner).length);
  state.squads.push({...s,id:state.squads.length,cost:0,regimentHalf:1,x:second.x,z:second.z,
   hp:s.maxHp,maxHp:s.maxHp,route:[],strikeDir:{x:0,z:1},name:s.name+' · Bravo'});
 }
 if(owner===net.slot&&selected<0)selected=s.id;cardsStamp='';dirty=true;return true}
function startDraft(owners=[0]){state=makeState();state.phase='draft';state.players=[...owners];for(const owner of owners){state.drafts[owner]=randomDraft();state.ready[owner]=false;state.wallet[owner]=0;}selected=-1;uiStamp='';cardsStamp='';$('lobby').hidden=true;dirty=true;makeCards();syncHUD();renderFlow();}
function beginWave(){state.phase='combat';state.paused=false;state.wave++;state.queue=[];state.roundDoneAt=0;
 const n=state.wave;
 // Lock the threat multiplier when the wave starts. Roster changes only affect NEXT wave.
 state.wavePlan=waveDifficulty(n,players().length);
 const {count,players:playerCount,multiplier}=state.wavePlan;
 const interval=n===1?1.05:n===2?.86:.73;
 for(let i=0;i<count;i++)state.queue.push({at:state.time+1.15+i*interval,
  kind:n===1?'wisp':i%5===0?'brute':i%4===0?'swift':'wisp',side:(i+n)%4});
 uiStamp='';dirty=true;
 notify(`Wave ${n} · ${count} enemies · ${playerCount}P (${Math.round(multiplier*100)}%)`,2.3);renderFlow()}
function enterShop(){state.phase='shop';state.shopVersion++;for(const owner of players()){state.wallet[owner]=(state.wallet[owner]||0)+3;state.ready[owner]=false;state.offers[owner]=[{kind:'hero',type:roll(OFFENSIVE)},{kind:'regiment',type:roll(REGIMENTS)}];for(const s of ownSquads(owner)){s.hp=Math.min(s.maxHp,s.hp+Math.round(s.maxHp*.22));if(s.alive&&s.archetype!=='lone')s.soldiers=Math.min(s.soldiersMax,s.soldiers+2)}}
 uiStamp='';dirty=true;notify('Supply caravan arrived. Spend or save your supplies.',2);renderFlow()}
function draftPick(owner,choice){if(state.phase!=='draft'||!players().includes(owner)||state.ready[owner])return false;
 const d=state.drafts[owner];const ar=choice==='lone'?'lone':choice==='hero'?'hero':choice==='regiment'?'regiment':null;
 if(!ar)return false;const type=ar==='lone'?'vanguard':ar==='hero'?d.hero:d.regiment;
 if(!recruit(owner,ar,type))return false;state.ready[owner]=true;
 if(players().every(p=>state.ready[p]))beginWave();uiStamp='';dirty=true;return true}
function processShop(owner,action){if(state.phase!=='shop'||state.ready[owner]||!players().includes(owner))return false;
 let wallet=state.wallet[owner]||0,unit=state.squads[action.unitId],mine=unit&&!unit.retired&&unit.owner===owner&&unit.cost>0;
 const pay=n=>{if(wallet<n)return false;state.wallet[owner]-=n;wallet-=n;return true};
 if(action.kind==='buy'){const offer=state.offers[owner]?.[action.index];if(!offer||freeSlots(owner)<1||!pay(3))return false;recruit(owner,offer.kind,offer.type)}
 else if(action.kind==='upgrade'&&mine&&(unit.alive||partnerOf(unit)?.alive)){if(!pay(2))return false;
  for(const u of [unit,partnerOf(unit)].filter(Boolean)){
   u.level++;u.damage=Math.round(u.damage*1.14);u.maxHp=Math.round(u.maxHp*1.12);
   u.hp=Math.min(u.maxHp,u.hp+Math.round(u.maxHp*.15));
   if(u.archetype==='hero'&&!u.mutation)u.mutation=u.type==='vanguard'?'cleave':u.type==='lancer'?'double':u.type==='archer'?'pierce':'radiant';
  }
 }
 else if(action.kind==='promote'&&mine&&unit.archetype==='lone'&&unit.cost<4&&freeSlots(owner)>=1){if(!pay(3))return false;unit.cost++;unit.maxHp=Math.round(unit.maxHp*1.2);unit.hp=Math.round(unit.hp*1.2);unit.damage=Math.round(unit.damage*1.16);unit.role=unit.cost===3?'Champion • 3 skills':'Legend • 4 skills';unit.name=unit.cost===3?'Champion Swordsman':'Legendary Swordsman';}
 else if(action.kind==='retire'&&mine&&ownDeployments(owner).length>1){if(!pay(2))return false;
  for(const u of [unit,partnerOf(unit)].filter(Boolean)){u.retired=true;u.alive=false;u.route=[];}
 }
 else if(action.kind==='ready'){state.ready[owner]=true;if(players().every(p=>state.ready[p])){if(state.wave>=MAX_WAVES)end(true);else beginWave()}}
 else return false;
 cardsStamp='';uiStamp='';dirty=true;return true}
function pf(from,target){const sx=clamp(Math.round(from.x),0,W-1),sz=clamp(Math.round(from.z),0,H-1),tx=clamp(Math.round(target.x),0,W-1),tz=clamp(Math.round(target.z),0,H-1);if(blocked(tx,tz))return[];let q=[[sx,sz]],seen=new Set([`${sx},${sz}`]),prev=new Map();for(let p=0;p<q.length;p++){let [x,z]=q[p];if(x===tx&&z===tz){let out=[],key=`${x},${z}`;while(x!==sx||z!==sz){out.push({x,z});[x,z]=prev.get(key);key=`${x},${z}`;}return out.reverse();}for(const [dx,dz] of [[0,1],[1,0],[-1,0],[0,-1]]){let xx=x+dx,zz=z+dz,k=`${xx},${zz}`;if(!blocked(xx,zz)&&!seen.has(k)){seen.add(k);prev.set(k,[x,z]);q.push([xx,zz]);}}}return []}
function move(s,x,z){if(!s||!s.alive||blocked(x,z))return;let path=pf(s,{x,z});if(!path.length&&dist(s,{x,z})>.65){notify('Cannot reach that tile.',1);return}s.route=path;dirty=true;}
function change(id,key){let s=state.squads[id];if(!s?.alive||!form[key])return;s.formation=key;dirty=true}
function effect(x,z,c,life=.45,size=.4){state.effects.push({x,z,c,life,max:life,size})}
function hurt(e,dmg){if(e.hp<=0)return;e.hp-=dmg;e.flash=.2;effect(e.x,e.z,'#f7cf9a',.24,.42);if(e.hp<=0){e.hp=0;state.defeated++;effect(e.x,e.z,'#e99bab',.55,.85)}}
function healTarget(s){return state.squads.filter(t=>t.alive&&t.hp<t.maxHp-1&&dist(s,t)<=3).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]}
// Purely visual attack feedback. Combat stays resolved by the original squad simulation.
function strike(from,to,kind){
 if(!from||!to)return;
 let dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz)||1;
 from.attackPulse=.34;from.strikeDir={x:dx/len,z:dz/len};
 if(!state.strikes)state.strikes=[];
 state.strikes.push({x:from.x,z:from.z,tx:to.x,tz:to.z,kind,life:kind==='bow'?.33:.27,max:kind==='bow'?.33:.27});
}
function skill(id,which=0){
 const s=state.squads[id];if(!s||!s.alive||state.phase!=='combat')return;
 const cdKey=which===0?'cooldown':`cooldown${which+1}`;
 if((s[cdKey]||0)>0||s.archetype==='regiment')return;
 if(s.archetype!=='lone'&&which!==0)return;
 if(s.archetype==='lone'&&which>=s.cost)return;
 const nearest=state.enemies.filter(e=>e.hp>0&&dist(s,e)<=s.range+1.6).sort((a,b)=>dist(s,a)-dist(s,b))[0];let used=false,skillName='';
 const strikeEnemies=(range,dmg)=>{const near=state.enemies.filter(e=>e.hp>0&&dist(s,e)<=range);for(const e of near)hurt(e,dmg);if(near.length){strike(s,near[0],'slash');effect(s.x,s.z,'#f0d59d',.65,range*.8)}return !!near.length};
 if(s.archetype==='lone'){
  if(which===0){used=strikeEnemies(1.95,75+12*s.level);skillName='Sweeping Cut';}
  if(which===1&&nearest){used=true;hurt(nearest,125+16*s.level);strike(s,nearest,'stab');effect(nearest.x,nearest.z,'#ffe4a1',.55,.8);skillName='Falling Blade';}
  if(which===2){used=strikeEnemies(2.45,120+16*s.level);skillName='Champion Whirl';}
  if(which===3){used=strikeEnemies(3.2,220+24*s.level);skillName='Legendfall';}
 }else{
  const mult=form[s.formation].damage;
  if(s.type==='vanguard'){used=strikeEnemies(1.9,Math.round(48*mult));skillName='Roundhouse';}
  else if(s.type==='lancer'&&nearest){hurt(nearest,Math.round(100*mult));strike(s,nearest,'stab');used=true;skillName='Long Thrust';}
  else if(s.type==='archer'&&nearest){hurt(nearest,Math.round(112*mult));strike(s,nearest,'bow');used=true;skillName='Bullseye';}
  else if(s.type==='healer'){const friend=healTarget(s);if(friend){friend.hp=Math.min(friend.maxHp,friend.hp+72);strike(s,friend,'heal');used=true;skillName='Focused Mend';}}
 }
 if(!used){notify('No target in range for that skill.',1.3);return}
 s[cdKey]=which===0?s.cd:which===1?11:which===2?15:22;notify(`${s.name} · ${skillName}!`,1.3);dirty=true
}
function action(sid,a){if(!owns(sid)||state.phase!=='combat')return;if(net.mode==='guest'){sendGuestCommand(sid,a);return}applyAction(sid,a)}
function sendGuestCommand(sid,a){fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:net.room,token:net.token,squadId:sid,action:a})}).catch(()=>notify('Cannot reach game server.',2))}
function applyAction(sid,a){if(state.phase!=='combat'||state.ended)return;const s=state.squads[sid];if(!s||!s.alive||s.retired)return;
 if(a.type==='move'&&Number.isInteger(a.x)&&Number.isInteger(a.z))move(s,a.x,a.z);
 if(a.type==='formation'&&s.archetype==='hero')change(sid,a.key);
 if(a.type==='skill')skill(sid,Number.isInteger(a.which)?a.which:0);
 if(a.type==='hold')s.route=[]}
function playerAction(a){if(net.mode==='guest'){sendGuestCommand(-1,a);return}applyPlayerAction(net.slot,a)}
function applyPlayerAction(owner,a){if(!players().includes(owner))return;
 if(a.type==='draft')draftPick(owner,a.choice);
 if(a.type==='purchase')processShop(owner,a.purchase||{});
 dirty=true;renderFlow();}
function spawn(info){const edge=[{x:0,z:Math.floor(Math.random()*H)},{x:W-1,z:Math.floor(Math.random()*H)},{x:Math.floor(Math.random()*W),z:0},{x:Math.floor(Math.random()*W),z:H-1}];let p=edge[info.side];if(blocked(p.x,p.z))p=edge.find(q=>!blocked(q.x,q.z))||{x:0,z:5};const st=info.kind==='brute'?{hp:120,dmg:11,speed:.82,rate:1.3}:info.kind==='swift'?{hp:45,dmg:7,speed:1.8,rate:.95}:{hp:55,dmg:7,speed:1.2,rate:1.2};state.enemies.push({id:++state.nextId,kind:info.kind,x:p.x,z:p.z,hp:st.hp,maxHp:st.hp,damage:st.dmg,speed:st.speed,rate:st.rate,attack:Math.random(),route:[],lastGoal:0,flash:0,motion:Math.random()*5,heading:0,attackPulse:0,strikeDir:{x:0,z:1}})}
function travel(o,goal,dt,v){o.lastGoal-=dt;if(!o.route.length||o.lastGoal<0){o.route=pf(o,goal);o.lastGoal=1.1;}let t=o.route[0];if(!t)return;let d=dist(o,t),step=v*dt;if(d<=step){o.x=t.x;o.z=t.z;o.route.shift()}else{const dx=(t.x-o.x)/d,dz=(t.z-o.z)/d;o.x+=dx*step;o.z+=dz*step;o.heading=Math.atan2(dx,dz)}}
function update(dt){if(net.mode==='guest'||state.phase!=='combat'||state.paused||state.ended)return;dt=Math.min(dt,.06)*state.speed;state.time+=dt;
 while(state.queue.length&&state.queue[0].at<=state.time)spawn(state.queue.shift());
 for(const s of state.squads){if(!s.alive||s.retired)continue;s.motion+=dt*(s.route.length?12:2.5);for(const k of ['cooldown','cooldown2','cooldown3','cooldown4'])s[k]=Math.max(0,(s[k]||0)-dt);s.attack-=dt;s.heal-=dt;s.flash=Math.max(0,s.flash-dt);s.attackPulse=Math.max(0,(s.attackPulse||0)-dt);
  if(s.route.length){const t=s.route[0],d=dist(s,t),v=s.speed*form[s.formation].speed*dt;if(d<=v){s.x=t.x;s.z=t.z;s.route.shift()}else{const dx=(t.x-s.x)/d,dz=(t.z-s.z)/d;s.x+=dx*v;s.z+=dz*v;s.heading=Math.atan2(dx,dz)}}
  if(s.type==='healer'){if(s.heal<=0){s.heal=s.rate;const t=healTarget(s);if(t){t.hp=Math.min(t.maxHp,t.hp+17);strike(s,t,'heal');effect(t.x,t.z,'#99d6bf',.35,.65)}}continue}
  if(s.attack<=0){const enemies=state.enemies.filter(e=>e.hp>0&&dist(s,e)<=s.range+.001).sort((a,b)=>dist(s,a)-dist(s,b));if(enemies.length){s.attack=s.rate;
    const nearbyArmy=state.squads.filter(a=>a!==s&&a.alive&&!a.retired&&a.archetype==='regiment'&&dist(a,s)<=2.6);
    const aura=Math.min(.36,nearbyArmy.reduce((v,a)=>v+(a.type==='knight'?.04:.05),0));const power=Math.round(s.damage*form[s.formation].damage*(1+aura));
    s.hitCount++;
    if(s.type==='vanguard'||s.type==='knight'){
      const sweep=s.archetype==='lone'||s.mutation==='cleave'&&s.hitCount%3===0;
      (sweep?enemies:enemies.slice(0,1)).forEach(e=>hurt(e,power));strike(s,enemies[0],sweep?'slash':'stab');
    }else{hurt(enemies[0],power);if(s.mutation==='double'&&s.type==='lancer')hurt(enemies[0],Math.round(power*.55));
      if(s.mutation==='pierce'&&s.type==='archer'&&enemies[1])hurt(enemies[1],Math.round(power*.6));
      strike(s,enemies[0],s.type==='archer'?'bow':'stab');if(s.type==='archer')effect(enemies[0].x,enemies[0].z,'#f1ce9d',.5,.6)}
   }}
 }
 for(const e of state.enemies){if(e.hp<=0)continue;e.flash=Math.max(0,e.flash-dt);e.attack-=dt;e.attackPulse=Math.max(0,(e.attackPulse||0)-dt);e.motion+=dt*7;
 const near=state.squads.filter(s=>s.alive&&!s.retired&&dist(s,e)<2.5).sort((a,b)=>dist(a,e)-dist(b,e));const t=near[0]||{x:6,z:5,beacon:true};const d=dist(e,t);
 if(d<1.1){if(e.attack<=0){e.attack=e.rate;e.attackPulse=.23;const dx=t.x-e.x,dz=t.z-e.z,dl=Math.hypot(dx,dz)||1;e.strikeDir={x:dx/dl,z:dz/dl};if(t.beacon){state.beacon=Math.max(0,state.beacon-e.damage);effect(6,5,'#fa9c88',.4,1.2)}else{
 const guards=state.squads.filter(a=>a!==t&&a.alive&&!a.retired&&a.archetype==='regiment'&&a.type==='knight'&&dist(a,t)<=2.6).length;
 t.hp=Math.max(0,t.hp-e.damage*form[t.formation].incoming*Math.max(.55,1-guards*.13));
 t.soldiers=t.soldiersMax?Math.min(t.soldiers,Math.max(0,Math.ceil(t.hp/t.maxHp*t.soldiersMax))):0;t.flash=.16;
 if(t.hp<=0){t.alive=false;t.route=[];notify(`${t.name} was routed!`,2)}}}}
 else travel(e,t,dt,e.speed)}
 state.enemies=state.enemies.filter(e=>e.hp>0);state.effects=state.effects.filter(e=>(e.life-=dt)>0);state.strikes=(state.strikes||[]).filter(e=>(e.life-=dt)>0);
 if(state.beacon<=0||state.squads.every(s=>!s.alive||s.retired)){end(false);return}
 if(!state.queue.length&&!state.enemies.length&&state.time>2){if(!state.roundDoneAt)state.roundDoneAt=state.time;if(state.time-state.roundDoneAt>.85)enterShop();}else state.roundDoneAt=0;
 dirty=true}
function end(win){state.phase='ended';state.ended=true;state.win=win;$('endOverlay').hidden=false;$('endTitle').textContent=win?'Outpost secured!':'The Beacon has fallen';$('endText').textContent=win?`All three waves survived. ${state.defeated} enemies stopped.`:`The defense failed. ${state.defeated} enemies repelled.`;dirty=true;renderFlow()}
// -------- 3D presentation --------
function resize(){
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
 if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
 const dpr=Math.min(window.devicePixelRatio||1,1.6);const px=Math.round(w*dpr),py=Math.round(h*dpr);
 if(fxLayer.width!==px||fxLayer.height!==py){fxLayer.width=px;fxLayer.height=py}
 fxCtx.setTransform(dpr,0,0,dpr,0,0);
 const span=11.6,aspect=w/h;
 camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
function world(x,y,z){return [x-6,y,z-4.5]}
const _projectV=new THREE.Vector3();
function project(x,y,z){const [wx,wy,wz]=world(x,y,z);
 _projectV.set(wx,wy,wz).project(camera);
 return {x:(_projectV.x+1)*canvas.clientWidth/2,y:(1-_projectV.y)*canvas.clientHeight/2};
}
const SUN={dir:[-.48,-1,1.05],yaw:Math.atan2(-.48,1.05)}; // light originates from the upper-right of the isometric view
function groundAtWorld(wx,wz){return terrain(wx+6,wz+4.5)}
function projectShadowPoint(wx,wy,wz){
 // Follow a ray downhill in exactly the same direction as every static cast shadow.
 // Never place the mark on a taller tile: clamp the contact to the reached surface.
 let gx=wx+6,gz=wz+4.5,px=gx,pz=gz,py=wy;
 const step=.085;
 let hit=[wx,groundAtWorld(wx,wz)+.045,wz];
 for(let i=0;i<58;i++){
  px+=SUN.dir[0]*step; py+=SUN.dir[1]*step; pz+=SUN.dir[2]*step;
  const rx=Math.round(px),rz=Math.round(pz);
  if(rx<0||rz<0||rx>=W||rz>=H)break;
  const ground=terrain(px,pz)+(obstacles.has(`${rx},${rz}`)?.105:.019);
  if(py<=ground){hit=[px-6,ground+.018,pz-4.5];break;}
  hit=[px-6,ground+.018,pz-4.5];
 }
 return hit;
}
function stampUnitShadow(wx,wz,bodyScale=1,hero=false,weapon='body',heading=0,colorA='#536a6d',colorB='#3e5558'){
 const gy=groundAtWorld(wx,wz)+.024;
 const diskW=(hero?.27:.19)*bodyScale, diskZ=(hero?.17:.12)*bodyScale;
 draw(shadowDisk,wx,gy,wz,diskW,1,diskZ,colorA,0);
 draw(shadowDisk,wx,gy,wz,diskW*.62,1,diskZ*.62,'#2a3b3e',0);
 if(weapon==='blade') draw(shadowStrip,wx,gy,wz,.18*bodyScale,1,.11*bodyScale,'#304245',heading*.12);
 else if(weapon==='spear') draw(shadowStrip,wx,gy,wz,.22*bodyScale,1,.06*bodyScale,'#304245',heading*.08);
 else if(weapon==='bow') draw(shadowDisk,wx,gy,wz,.10*bodyScale,1,.06*bodyScale,'#304245',0);
 else if(weapon==='staff') draw(shadowStrip,wx,gy,wz,.16*bodyScale,1,.05*bodyScale,'#304245',heading*.08);
}
function stampProjectedShadow(wx,wy,wz,bodyScale=1,hero=false,weapon='body',heading=0,colorA='#44595d',colorB='#33484c'){
 const p=projectShadowPoint(wx,wy,wz),stretch=1+Math.max(0,wy)*.33;
 const diskW=(hero?.31:.21)*bodyScale, diskZ=(hero?.20:.135)*bodyScale;
 const wedgeS=(hero?.34:.24)*bodyScale*stretch;
 // outer body + darker inner core for clearer read at gameplay zoom
 draw(shadowDisk,p[0],p[1],p[2],diskW,1,diskZ,colorA,SUN.yaw);
 draw(shadowDisk,p[0]-SUN.dir[0]*.03,p[1],p[2]-SUN.dir[2]*.03,diskW*.66,1,diskZ*.66,'#26373a',SUN.yaw);
 draw(shadowWedge,p[0]-.03*stretch,p[1],p[2]-.02*stretch,wedgeS,1,wedgeS,colorB,SUN.yaw);
 draw(shadowWedge,p[0]-.04*stretch,p[1],p[2]-.03*stretch,wedgeS*.72,1,wedgeS*.72,'#223235',SUN.yaw);
 const extra=projectShadowPoint(wx+.04*Math.sin(heading),wy+(hero?.95:.78),wz+.04*Math.cos(heading));
 if(weapon==='blade'){
  draw(shadowStrip,extra[0],extra[1],extra[2],.26*bodyScale*stretch,1,.17*bodyScale,'#26373a',SUN.yaw+heading*.15);
 }else if(weapon==='spear'){
  draw(shadowStrip,extra[0],extra[1],extra[2],.40*bodyScale*stretch,1,.095*bodyScale,'#26373a',SUN.yaw+heading*.08);
 }else if(weapon==='bow'){
  draw(shadowDisk,extra[0],extra[1],extra[2],.13*bodyScale,1,.095*bodyScale,'#2b3d40',SUN.yaw);
  draw(shadowStrip,extra[0]-.01,extra[1],extra[2],.22*bodyScale*stretch,1,.07*bodyScale,'#26373a',SUN.yaw+.65);
 }else if(weapon==='staff'){
  draw(shadowStrip,extra[0],extra[1],extra[2],.27*bodyScale*stretch,1,.08*bodyScale,'#26373a',SUN.yaw+.1);
  draw(shadowDisk,extra[0]+SUN.dir[0]*.09,extra[1],extra[2]+SUN.dir[2]*.09,.08*bodyScale,1,.058*bodyScale,'#2b3d40',SUN.yaw);
 }
}

// Crisp light-space silhouettes. Each raised box casts onto every lower exposed
// receiver it can reach along the common sunlight direction. The shadow triangles
// are merged once into one mesh for a single draw call per frame.
const SUN_SHADOW_TINT='#435c60';
function sunHull(points){
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 let lo=[],hi=[];
 for(const p of points){while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
 for(let i=points.length-1;i>=0;i--){const p=points[i];while(hi.length>1&&cross(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p)}
 return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function sunClip(poly,axis,threshold,keepGreater){
 const out=[];if(!poly.length)return out;
 const inside=p=>keepGreater?p[axis]>=threshold-1e-7:p[axis]<=threshold+1e-7;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],ain=inside(a),bin=inside(b);
  if(ain!==bin){const diff=b[axis]-a[axis],t=Math.abs(diff)<1e-8?0:(threshold-a[axis])/diff;out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
  if(bin)out.push(b);
 }
 return out;
}
function sunReceiverHeight(x,z){return heights[z][x]+(obstacles.has(`${x},${z}`)?.103:.020)}
function makeSunTerrainShadows(){
 const tris=[],normal=[0,1,0],allCasters=[];
 for(let z=0;z<H;z++)for(let x=0;x<W;x++)if(obstacles.has(`${x},${z}`))allCasters.push({x,z,half:.48,base:0,top:heights[z][x]+.18});
 allCasters.push({x:6,z:5,half:.38,base:terrain(6,5)+.12,top:terrain(6,5)+1.28});
 let clippedPieces=0;
 for(const caster of allCasters){
  for(let z=0;z<H;z++)for(let x=0;x<W;x++){
   // Own top cannot shadow itself. A receiver above the caster cannot be shadowed.
   if(x===caster.x&&z===caster.z)continue;
   const receiver=sunReceiverHeight(x,z);
   if(receiver>=caster.top-.04)continue;
   const vertical=caster.top-receiver,dx=SUN.dir[0]*vertical,dz=SUN.dir[2]*vertical;
   const r=caster.half,cx=caster.x,cz=caster.z;
   // Convex silhouette of the vertical extrusion of a rectangular caster.
   // The bounding prism and its projected top corners enclose a hard shadow.
   const corners=[[cx-r,cz-r],[cx+r,cz-r],[cx+r,cz+r],[cx-r,cz+r]];
   const poly=sunHull([...corners,...corners.map(([a,b])=>[a+dx,b+dz])]);
   const minX=Math.min(...poly.map(p=>p[0])),maxX=Math.max(...poly.map(p=>p[0]));
   const minZ=Math.min(...poly.map(p=>p[1])),maxZ=Math.max(...poly.map(p=>p[1]));
   if(x+.49<minX||x-.49>maxX||z+.49<minZ||z-.49>maxZ)continue;
   let clipped=poly;
   clipped=sunClip(clipped,0,x-.495,true);clipped=sunClip(clipped,0,x+.495,false);
   clipped=sunClip(clipped,1,z-.495,true);clipped=sunClip(clipped,1,z+.495,false);
   if(clipped.length<3)continue;
   clippedPieces++;
   // A smidge above the actual tile top avoids z-fighting on both GPU and fallback.
   const yy=receiver+.022;
   const point=([px,pz])=>[px-6,yy,pz-4.5];
   for(let j=1;j<clipped.length-1;j++)tris.push([[point(clipped[0]),normal],[point(clipped[j]),normal],[point(clipped[j+1]),normal]]);
  }
 }
 // Browser cache: only about a few hundred triangles regardless of total frames.
 const result=mesh(tris);
 result.receiverPieces=clippedPieces;
 return result;
}
// The old hand-projected terrain shadow mesh has been retired. Three.js provides shadows.

// All object outlines and cast/received shadows now belong to Three.js.
function pointTri(p,a,b,c){let sign=(q,r,s)=>(q.x-s.x)*(r.y-s.y)-(r.x-s.x)*(q.y-s.y);let d1=sign(p,a,b),d2=sign(p,b,c),d3=sign(p,c,a);return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0))}
function pickTile(p){let best=null,minY=-Infinity;for(let z=0;z<H;z++)for(let x=0;x<W;x++){let y=terrain(x,z)+.025,tl=project(x-.49,y,z-.49),tr=project(x+.49,y,z-.49),br=project(x+.49,y,z+.49),bl=project(x-.49,y,z+.49);if(pointTri(p,tl,tr,br)||pointTri(p,tl,br,bl)){if(y>minY){best={x,z};minY=y}}}return best}
function drawTerrain(){
 for(let z=0;z<H;z++)for(let x=0;x<W;x++){
  const top=heights[z][x],high=obstacles.has(`${x},${z}`);
  const color=high?(['#6e8290','#607784','#79909d'][(x*3+z)%3]):((x+z)%2?'#46647a':'#3d5a70');
  let [px,,pz]=world(x,0,z);
  draw(cube,px,(top-1.2)/2,pz,.985,top+1.2,.985,color);
  if(high){
   draw(cube,px,top+.045,pz,.90,.09,.90,'#8e9a96');
   draw(cube,px+.19,top+.094,pz-.21,.30,.014,.035,'#efe1bc');
   draw(cube,px-.19,top+.094,pz-.21,.09,.018,.045,'#ddd4ad');
   if((x+z)%2)draw(cube,px,top+.14,pz,.12,.14,.67,'#c6d7ca');
  }else if((x*4+z*9)%13===4){
   draw(cube,px-.24,top+.024,pz+.22,.15,.045,.11,'#6a8a81');
  }
 }
 const [bx,,bz]=world(6,0,5);let y=terrain(6,5);
 // v3.4: switch the objective to a hovering Sims / FF-style crystal.
 // It floats, slowly spins, and stays bright so it remains the visual focal point.
 const crystalBob=Math.sin(state.time*1.45)*.08;
 const spin=state.time*.42;
 draw(cube,bx,y+.05,bz,.96,.10,.96,'#5b7f74');
 draw(cube,bx,y+.15,bz,.54,.12,.54,'#7b9c92');
 draw(cube,bx,y+.23,bz,.34,.06,.34,'#a8c8bc');
 // aura pad
 draw(cube,bx,y+.092,bz,.74,.018,.74,'#92ddd6');
 draw(cube,bx,y+.098,bz,.48,.018,.48,'#c8fff7');
 // hovering main crystal: slender octa crystal with bright seams, like a plumbob / FF crystal hybrid
 draw(cone,bx,y+1.00+crystalBob,bz,.34,.92,.34, '#e8fff9', spin, true);
 draw(cone,bx,y+.47+crystalBob,bz,.28,-.58,.28,'#bdf6ee', spin, true);
 draw(cube,bx,y+.77+crystalBob,bz,.072,.62,.072,'#f9fff7', spin, true);
 // brighter edge seams
 draw(cube,bx,y+.77+crystalBob,bz+.058,.036,.56,.016,'#fff8c8', spin, true);
 draw(cube,bx+.058,y+.77+crystalBob,bz,.016,.56,.036,'#cffff1', spin, true);
 // tiny top sparkle
 draw(ball,bx,y+1.46+crystalBob,bz,.055,.055,.055,'#fff8d8');
 draw(cube,bx,y+1.46+crystalBob,bz,.13,.015,.015,'#fffbe1');
 draw(cube,bx,y+1.46+crystalBob,bz,.015,.13,.015,'#defff5');
 if(hover && Number.isFinite(hover.x) && Number.isFinite(hover.z) && !blocked(hover.x,hover.z)){
  let [x,,z]=world(hover.x,0,hover.z);
  draw(cube,x,terrain(hover.x,hover.z)+.065,z,.9,.04,.9,'#d8d1ae');
 }
}
// Original ceramic figure concept adapted to actual 3D game meshes.
// The v0.7 ceramic mesh profiles are restored, with a subtle 6% width increase to the body only.
// Faces remain blank, hats remain open kettle hats, and class colors stay on robes/capes for readability.
// Weapons are now class-specific in the actual game build rather than placeholders.
function soldier(x,y,z,color,heading,hero,type,t,motion,enemy=false,scale=1,outlineBoost=.08,banner=false){
 const k=(hero?1.00:.515)*scale;
 const bob=Math.sin(t*(motion?11:2)+x*17+z*11)*.009*(motion?2:1);
 const porcelain=enemy?'#df8c92':'#ddd4c7', robe=color;
 const mantle=enemy?'#d55b70':blendHex('#eadfce',color,.88), trim=enemy?'#a43e51':blendHex('#70828a',color,.87);
 const angle=heading,co=Math.cos(angle),si=Math.sin(angle);
 const part=(m,px,py,pz,sx,sy,sz,c)=>{
  const wx=x+(px*co+pz*si)*k, wy=y+py*k+bob, wz=z+(-px*si+pz*co)*k;
  draw(m,wx,wy,wz,sx*k,sy*k,sz*k,c,angle,true);
  if(outlineBoost>0 && (m===ceramicBody||m===ceramicHeroCape||m===ceramicHead||m===ceramicHat||m===ceramicShoulder)){
   const oc=enemy?blendHex('#ffeaf1',c,.40):blendHex('#f2fbff',c,.26);
   drawUnitOutline(m,wx,wy,wz,sx*k,sy*k,sz*k,oc,angle,outlineBoost);
  }
 };
 // V0.7 height is unchanged. Slight silhouette softening, not a fat/chunky redesign.
 const bodyW=1.06, bodyH=1.00;
 const shoulderW=1.04, shoulderH=1.00;
 const headW=1.02, headH=1.00;
 const hatW=1.02, hatH=1.00;
 part(ceramicBody,0,0,0,bodyW,bodyH,bodyW,robe);
 part(ceramicSkirtBand,0,0,0,bodyW,bodyH,bodyW,trim);
 if(hero)part(ceramicHeroCape,0,0,0,1.04,1.00,1.04,blendHex('#e8dccc',color,.72));
 part(ceramicShoulder,0,0,0,shoulderW,shoulderH,shoulderW,mantle);
 // Readable uniform front even at normal RTS zoom; ceramic head/helmet remain pale.
 part(cube,0,.32,.169,.105,.28,.028,enemy?'#e9798b':blendHex('#e6dbc8',color,.82));
 for(const side of [-1,1]){
  part(ball,side*.132,.575,.025,.074,.112,.075,robe);
  part(ball,side*.157,.512,.065,.059,.063,.063,porcelain);
 }
 part(ceramicHead,0,0,.015,headW,headH,headW,porcelain);
 part(ceramicHat,0,0,0,hatW,hatH,hatW,enemy?'#d77987':'#e2d8c9');
 const gripY=hero?.645:.515;
 part(ball,0,gripY,.118,.040,.042,.031,trim);
 // class-specific weapons in the actual game mesh
 if(type==='vanguard'){
  const wx=hero?.075:.165,wz=hero?.195:.105;
  part(swordBlade,wx,.065,wz,hero?1.95:1.32,hero?1.25:1.00,hero?1.42:1.18,'#f4efe6');
  part(cube,wx,.565,wz,.33,.042,.078,'#e8dac5');
  part(cube,wx,.655,wz,.072,.17,.07,'#cdbba4');
  part(ball,wx,.742,wz,.050,.054,.050,'#eadccc');
  part(ball,wx,.600,wz,.080,.063,.073,porcelain);
 }else if(type==='lancer'){
  const wx=hero?.145:.218,wz=hero?.13:.095;
  part(cube,wx,.690,wz,.038,hero?1.62:1.46,.038,enemy?'#b64b5b':'#e0d3c0');
  part(spearTip,wx,hero?1.575:1.455,wz,hero?1.08:1,hero?1.08:1,hero?1.08:1,enemy?'#f1979b':'#f6efe2');
  part(ball,wx,.515,wz,.066,.070,.066,porcelain);
  part(ball,wx,hero?1.535:1.416,wz,.061,.044,.061,trim);
 }else if(type==='archer'){
  const wx=hero?.16:.19,wz=hero?.11:.09;
  // Single sculpted C-shaped bow limb, with a straight string and a nocked arrow.
  part(curvedBow,wx,.02,wz,1,1,1,'#f1e5d3');
  part(cube,wx-.04,1.00,wz,.008,.945,.009,'#f8f0e4');
  part(cube,wx-.115,.99,wz,.22,.014,.014,'#dac4a8');
  part(cone,wx-.244,.99,wz,.035,.072,.035,'#f6f0e5');
  if(hero){
   // simple quiver silhouette on the back for extra readability
   part(cube,-.10,.90,-.045,.075,.24,.075,'#d9c7b1');
   for(const s of [-.022,0,.022]) part(cone,-.10+s,1.05,-.045,.028,.07,.028,'#efe6d8');
  }
 }else if(type==='knight'){
  part(cube,-.20,.60,.15,.25,.32,.10,'#c7e5dd');
  part(cube,-.20,.60,.22,.16,.23,.06,'#628c91');
  part(cube,.15,.69,.09,.05,.90,.05,'#d4d4c4');
 }else if(type==='healer'){
  const wx=hero?.145:.18,wz=hero?.115:.10;
  part(cube,wx,.725,wz,.040,hero?1.50:1.34,.040,'#e0d3c0');
  part(ball,wx,hero?1.53:1.39,wz,.075,.085,.075,'#f4ece0');
  part(ball,wx,hero?1.53:1.39,wz,.032,.034,.032,trim);
  for(const dx of [-.07,0,.07]) part(ball,wx+dx,hero?1.53:1.39,wz,.022,.026,.022,'#f4ece0');
  part(ceramicRidge,wx,hero?1.45:1.31,wz,1.10,1.00,1.10,'#e5d8c5');
  part(ball,wx,.545,wz,.063,.067,.063,porcelain);
 }
 if(banner){
  // A harmless visual marker: no aura, stat, or special gameplay attached.
  // The center soldier survives in the five-unit formation until the detachment is routed.
  const pennant=blendHex('#f7e4a6',color,.65);
  part(cube,-.10,1.12,-.025,.029,1.25,.029,'#ead8b2');
  part(cube,.035,1.45,-.025,.26,.31,.025,pennant);
  part(cube,.157,1.48,-.010,.035,.27,.031,blendHex('#fff4d5',color,.30));
  part(ball,-.10,1.76,-.025,.052,.054,.052,'#fff0cf');
 }
}
function localOff(lx,lz,heading){return{x:lx*Math.cos(heading)+lz*Math.sin(heading),z:-lx*Math.sin(heading)+lz*Math.cos(heading)}}
function lungeWave(attackPulse,delay,amp=.16,total=.34){const elapsed=total-Math.max(0,attackPulse||0);if(elapsed<delay)return 0;const span=Math.max(.06,total-delay);const prog=(elapsed-delay)/span;if(prog<=0||prog>=1)return 0;return Math.sin(prog*Math.PI)*amp}
function drawSquad(s,t){
 if(s.retired)return;const baseY=terrain(s.x,s.z),co=s.type==='knight'?'#91b9b3':colors[s.type];
 const hero=s.formation==='shield'?[0,.33]:s.formation==='spear'?[0,-.32]:[0,0];
 const soldiers=s.archetype==='regiment'?[[0,0],[-.28,-.25],[.28,-.25],[-.28,.25],[.28,.25]]:s.formation==='shield'?[[-.25,-.36],[.25,-.36],[-.25,-.1],[.25,-.1]]:s.formation==='spear'?[[-.22,0],[.22,0],[-.22,.28],[.22,.28]]:[[-.29,-.27],[.29,-.27],[-.29,.27],[.29,.27]];
 const [x,,z]=world(s.x,0,s.z),vd=s.strikeDir||{x:0,z:0};if(!s.alive){draw(cube,x,baseY+.04,z,.48,.07,.48,'#4b5558');return}
 if(selected===s.id&&owns(s.id)){draw(cube,x,baseY+.04,z,.87,.06,.87,'#e1c27d');draw(cube,x,baseY+.08,z,.75,.03,.75,'#5c6d62')}
 for(let i=0;i<s.soldiers;i++){const off=localOff(...soldiers[i%soldiers.length],s.heading),lunge=lungeWave(s.attackPulse||0,i*.04,.15,.34);
  soldier(x+off.x+vd.x*lunge,baseY,z+off.z+vd.z*lunge,s.flash>0?'#f2ebd6':co,s.heading,false,s.archetype==='regiment'&&s.type==='knight'?'knight':s.type,t,s.route.length,false,1,selected===s.id&&owns(s.id)?.22:.08,s.archetype==='regiment'&&i===0)}
 if(s.archetype!=='regiment'){
  const off=localOff(...hero,s.heading),lunge=lungeWave(s.attackPulse||0,.12,.11,.34);
  soldier(x+off.x+vd.x*lunge,baseY,z+off.z+vd.z*lunge,s.flash>0?'#ffffff':co,s.heading,true,s.type,t,s.route.length,false,s.archetype==='lone'?1.22:1,selected===s.id&&owns(s.id)?.22:.08);
 }
 if(s.archetype==='regiment')draw(shadowDisk,x,baseY+.06,z,.65,1,.65,'#79c8a9');
 const health=clamp(s.hp/s.maxHp,0,1);draw(cube,x,baseY+1.36,z,.64,.045,.09,'#2e454e');if(health>.001)draw(cube,x-.32+.32*health,baseY+1.37,z,.64*health,.055,.10,health>.35?'#8ce5b9':'#ec9f88');
}
function drawEnemy(e,t){
 let [x,,z]=world(e.x,0,e.z),y=terrain(e.x,e.z),sc=e.kind==='brute'?1.28:e.kind==='swift'?.90:1;
 const dir=e.strikeDir||{x:0,z:0},pulse=(e.attackPulse||0)/.23,lunge=pulse>0?Math.sin((1-pulse)*Math.PI)*.12:0;
 soldier(x+dir.x*lunge,y,z+dir.z*lunge,e.flash>0?'#f5adb0':'#ca5668',e.heading||0,false,'lancer',t,!!e.route?.length,true,sc,.08);
 const hp=clamp(e.hp/e.maxHp,0,1);
 draw(cube,x,y+(.74*sc),z,.44,.036,.06,'#743e4a');
 if(hp>.001)draw(cube,x-(1-hp)*.22,y+.74*sc+.008,z,.44*hp,.045,.065,'#ed8794');
}
function drawGroundShadows(){
 // The terrain mesh handles the tall tower silhouettes. Here we only project
 // moving unit and rook details with the same common upper-right sun.
 const sunCasts=(gx,gz,heading,hero,type,sc=1)=>{
  const [wx,,wz]=world(gx,0,gz),baseY=terrain(gx,gz);
  const weapon=type==='vanguard'?'blade':type==='lancer'?'spear':type==='archer'?'bow':'staff';
  stampUnitShadow(wx,wz,(hero?1.0:.70)*sc,hero,weapon,heading,'#536a6d','#3e5558');
 };
 for(const s of state.squads){
  if(!s.alive)continue;
  const h=s.formation==='shield'?[0,.33]:s.formation==='spear'?[0,-.32]:[0,0];
  const spots=s.formation==='balanced'?[[-.29,-.27],[.29,-.27],[-.29,.27],[.29,.27]]:s.formation==='shield'?[[-.25,-.36],[.25,-.36],[-.25,-.1],[.25,-.1]]:[[-.22,0],[.22,0],[-.22,.28],[.22,.28]];
  for(let i=0;i<s.soldiers;i++){const off=localOff(...spots[i],s.heading);sunCasts(s.x+off.x,s.z+off.z,s.heading,false,s.type,.9)}
  const off=localOff(...h,s.heading);sunCasts(s.x+off.x,s.z+off.z,s.heading,true,s.type,1.05);
 }
 for(const e of state.enemies)if(e.hp>0){
  const [wx,,wz]=world(e.x,0,e.z),sc=e.kind==='brute'?1.25:e.kind==='swift'?.9:1;
  stampUnitShadow(wx,wz,sc*.70,false,'spear',e.heading||0,'#72545c','#594048');
 }
}
function drawStrike(f){
 const a=world(f.x,0,f.z),b=world(f.tx,0,f.tz),t=1-f.life/f.max;
 const dx=b[0]-a[0],dz=b[2]-a[2],distance=Math.hypot(dx,dz)||1,y=terrain(f.tx,f.tz)+.30;
 const yaw=Math.atan2(dx,dz);
 if(f.kind==='slash'){
  draw(slashArc,b[0],y-.12,b[2],.88*(.6+.4*t),1.0,.88,'#fff3d4',yaw);
  draw(slashArc,b[0]-.11,y-.18,b[2]-.06,.65,.78,.65,'#efaf8d',yaw);
 } else if(f.kind==='stab'){
  const ex=a[0]+dx*Math.min(.82,distance*.65),ez=a[2]+dz*Math.min(.82,distance*.65),midX=(a[0]+ex)/2,midZ=(a[2]+ez)/2;
  draw(cube,midX,terrain(f.x,f.z)+.54,midZ,.060,.045,Math.max(.08,Math.hypot(ex-a[0],ez-a[2])),'#f8e8c5',yaw);
  draw(cube,midX+.07,terrain(f.x,f.z)+.45,midZ+.04,.023,.025,Math.max(.04,Math.hypot(ex-a[0],ez-a[2])*.73),'#d6e9da',yaw);
 } else if(f.kind==='bow'){
  const px=a[0]+dx*t,pz=a[2]+dz*t;
  draw(cube,px,terrain(f.x,f.z)+.61,pz,.029,.028,.35,'#fff4d2',yaw);
  draw(cube,px-dx/distance*.13,terrain(f.x,f.z)+.60,pz-dz/distance*.13,.015,.016,.38,'#f2c57d',yaw);
 } else if(f.kind==='heal'){
  draw(shadowDisk,b[0],terrain(f.tx,f.tz)+.70,b[2],.18+t*.28,1,.18+t*.28,'#c0fae4');
 }
}
function renderVectorFX(){
 const w=canvas.clientWidth,h=canvas.clientHeight;fxCtx.clearRect(0,0,w,h);
 const sunX=w*.93,sunY=h*.09,sunR=Math.max(w,h)*.48;
 const glow=fxCtx.createRadialGradient(sunX,sunY,0,sunX,sunY,sunR);
 glow.addColorStop(0,'rgba(255,247,214,.14)');
 glow.addColorStop(.18,'rgba(255,246,218,.08)');
 glow.addColorStop(.45,'rgba(255,245,220,.03)');
 glow.addColorStop(1,'rgba(255,245,220,0)');
 fxCtx.fillStyle=glow;fxCtx.fillRect(0,0,w,h);
 const wash=fxCtx.createLinearGradient(w,h*0.05,w*0.55,h*0.42);
 wash.addColorStop(0,'rgba(255,247,223,.035)');
 wash.addColorStop(1,'rgba(255,247,223,0)');
 fxCtx.fillStyle=wash;fxCtx.fillRect(0,0,w,h);
 const scale=Math.min(1.2,Math.max(.55,w/1150));
 for(const f of state.strikes||[]){
  const src=project(f.x,terrain(f.x,f.z)+.67,f.z),dst=project(f.tx,terrain(f.tx,f.tz)+.63,f.tz);
  const age=1-f.life/f.max,alpha=Math.min(1,Math.max(0,f.life/f.max*2.3));
  fxCtx.save();fxCtx.globalAlpha=alpha;fxCtx.lineCap='round';fxCtx.lineJoin='round';
  if(f.kind==='slash'){
   const x=dst.x,y=dst.y;
   fxCtx.beginPath();fxCtx.moveTo(x-33*scale,y+13*scale);fxCtx.quadraticCurveTo(x-4*scale,y-31*scale,x+30*scale,y-8*scale);
   fxCtx.lineWidth=5*scale;fxCtx.strokeStyle='#fff6df';fxCtx.stroke();
   fxCtx.beginPath();fxCtx.moveTo(x-28*scale,y+13*scale);fxCtx.quadraticCurveTo(x-3*scale,y-24*scale,x+27*scale,y-5*scale);
   fxCtx.lineWidth=2*scale;fxCtx.strokeStyle='#efac8a';fxCtx.stroke();
  }else if(f.kind==='stab'){
   let dx=dst.x-src.x,dy=dst.y-src.y,mag=Math.hypot(dx,dy)||1;let ux=dx/mag,uy=dy/mag;
   const start={x:src.x+ux*8*scale,y:src.y+uy*8*scale},end={x:src.x+ux*Math.min(mag,58*scale),y:src.y+uy*Math.min(mag,58*scale)};
   fxCtx.beginPath();fxCtx.moveTo(start.x,start.y);fxCtx.lineTo(end.x,end.y);fxCtx.strokeStyle='#fdf0d8';fxCtx.lineWidth=5*scale;fxCtx.stroke();
   fxCtx.beginPath();fxCtx.moveTo(start.x-uy*5*scale,start.y+ux*5*scale);fxCtx.lineTo(end.x,end.y);
   fxCtx.strokeStyle='#a7e4d7';fxCtx.lineWidth=2*scale;fxCtx.stroke();
  }else if(f.kind==='bow'){
   const x=src.x+(dst.x-src.x)*age,y=src.y+(dst.y-src.y)*age;
   let dx=dst.x-src.x,dy=dst.y-src.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
   fxCtx.beginPath();fxCtx.moveTo(x-ux*26*scale,y-uy*26*scale);fxCtx.lineTo(x+ux*10*scale,y+uy*10*scale);
   fxCtx.strokeStyle='#fff3ce';fxCtx.lineWidth=3.2*scale;fxCtx.stroke();
   fxCtx.beginPath();fxCtx.moveTo(x+ux*11*scale,y+uy*11*scale);fxCtx.lineTo(x-ux*1*scale-uy*4*scale,y-uy*1*scale+ux*4*scale);fxCtx.lineTo(x-ux*1*scale+uy*4*scale,y-uy*1*scale-ux*4*scale);fxCtx.closePath();fxCtx.fillStyle='#eebd78';fxCtx.fill();
  }else if(f.kind==='heal'){
   const x=dst.x,y=dst.y,r=(7+age*13)*scale;
   fxCtx.strokeStyle='#e2fff0';fxCtx.lineWidth=3*scale;
   fxCtx.beginPath();fxCtx.moveTo(x-r,y);fxCtx.lineTo(x+r,y);fxCtx.moveTo(x,y-r);fxCtx.lineTo(x,y+r);fxCtx.stroke();
  }
  fxCtx.restore();
 }
}
function render(){
 resize();startDraw();drawTerrain();
 const pieces=[...state.enemies.map(e=>({d:e.x+e.z,e,type:'enemy'})),...state.squads.map(s=>({d:s.x+s.z,e:s,type:'squad'}))];
 for(const p of pieces){p.type==='squad'?drawSquad(p.e,state.time):drawEnemy(p.e,state.time)}
 for(const e of state.effects){let [x,,z]=world(e.x,0,e.z),r=e.size*(1-e.life/e.max+.45);draw(cone,x,terrain(e.x,e.z)+.05,z,r,.09,r,e.c)}
 finishDraw();renderer.render(scene,camera);renderVectorFX();
}
// -------- Unified PC / touch command bar --------
// Portraits show the same simple faceless ceramic hero as the battlefield.
const ceramicPortrait='<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M8 43L12 28Q22 23 32 28L36 43Z" fill="#e8ddce"/><ellipse cx="22" cy="27" rx="10" ry="13" fill="#eee5d9"/><path d="M13 18Q13 5 22 5Q32 5 32 18Z" fill="#f7f0e6" stroke="#d9cbbc" stroke-width="1"/><ellipse cx="22" cy="19" rx="16" ry="4.6" fill="#e9ded0" stroke="#d7c7b6" stroke-width="1"/><path d="M22 7V17" stroke="#d3c6b4" stroke-width="1.5"/><path d="M36 40V24" stroke="#ede8da" stroke-width="2.5"/><path d="M31 27H40" stroke="#d5c5ab" stroke-width="2.5"/></svg>';
const portraits={vanguard:ceramicPortrait,lancer:ceramicPortrait,archer:ceramicPortrait,healer:ceramicPortrait};

const formShort={shield:'▣',balanced:'◇',spear:'➤'};
const fkeys={z:'shield',x:'balanced',c:'spear'};
function abilityDescriptions(s){
 if(s.archetype==='lone')return [
  {name:'Sweeping Cut',tags:['AoE','Melee'],icon:'✦'},
  {name:'Falling Blade',tags:['Strike','Melee'],icon:'⚔'},
  {name:'Champion Whirl',tags:['AoE','Melee'],icon:'⟲'},
  {name:'Legendfall',tags:['AoE','Ultimate'],icon:'✷'}].slice(0,s.cost);
 return [{name:s.ability,tags:[s.type==='healer'?'Heal':s.type==='vanguard'?'AoE':s.type==='archer'?'Ranged':'Reach'],icon:'✦'}]
}
function makeCards(){
 const root=$('bar');root.replaceChildren();const slots=slotAssignments();
 let number=0;
 for(let i=0;i<MAX_SLOTS;i++){
  const s=slots[i];if(s?.reserved)continue;number++;
  const card=document.createElement('div');
  if(!s){card.className='card emptyCard';card.innerHTML=`<span class="slot">${i+1}</span><div class="cardContent"><div class="rightPart"><div class="name">Empty slot</div><div class="sub">Recruit after a wave</div></div></div>`;card.style.opacity='.55';root.appendChild(card);continue}
  card.id='card-'+s.id;card.tabIndex=0;
  card.className='card'+(s.archetype==='lone'?' loneCard':s.archetype==='regiment'?' regimentCard':'');
  card.style.setProperty('--slots',s.cost);
  card.style.flexGrow=String(s.cost);
  card.setAttribute('aria-label',`${s.name}, ${s.cost} deployment slots`);
  const portrait=`<div class="faceCol"><button type="button" class="face" title="Select ${s.name}" aria-label="Select ${s.name}">${ceramicPortrait}${s.archetype==='hero'?'<span class="cooldown" hidden></span>':''}</button><span class="soldierCount"><span>♟</span><b class="soldierVal">${s.soldiers||'—'}</b></span></div>`;
  const hp=`<div class="health"><div class="hpbar"><div class="hpfill"></div></div><b class="healthValue">${Math.ceil(s.hp)}/${s.maxHp}</b></div>`;
  if(s.archetype==='lone'){
   const abilities=abilityDescriptions(s).map((a,j)=>`<button type="button" class="loneSkill" data-skill="${j}" aria-label="${a.name}, ability ${['Q','E','R','F'][j]}"><span class="abilityTop"><b>${['Q','E','R','F'][j]}</b><span class="abilityIcon">${a.icon}</span></span><strong>${a.name}</strong><span class="abilityTags">${a.tags.map(tag=>`<em>${tag}</em>`).join('')}</span><span class="loneSkillCD" hidden>0s</span></button>`).join('');
   card.innerHTML=`<span class="slot">${i+1}–${i+s.cost} · ${s.cost} slots</span><div class="loneLayout">${portrait}<div class="loneDetails"><div class="name">${s.name}</div><div class="sub">Solo fighter · ${s.cost} skills</div>${hp}</div><div class="loneAbilityGrid">${abilities}</div></div>`;
   card.querySelector('.face').onclick=e=>{e.stopPropagation();setSelected(s.id)};
   card.querySelectorAll('.loneSkill').forEach(b=>b.onclick=e=>{e.stopPropagation();setSelected(s.id);action(s.id,{type:'skill',which:Number(b.dataset.skill)})});
  }else if(s.archetype==='regiment'){
   const partner=partnerOf(s);
   card.innerHTML=`<span class="slot">${i+1} · 1 slot</span><div class="regimentTop"><b>${s.name}</b><small>2 independent detachments</small></div><div class="regimentHalves">
    ${[s,partner].filter(Boolean).map((half,j)=>`<button type="button" class="regHalf" data-half-id="${half.id}" aria-label="Select ${j===0?'Alpha':'Bravo'} detachment"><span class="regHalfHeader"><span class="regHalfGlyph">⚑</span><strong>${j===0?'Alpha':'Bravo'}</strong><small>5 troops</small></span><span class="regHalfHP"><span></span></span><small class="regHalfStat">${half.soldiers}/5 · ${Math.ceil(half.hp)} HP</small></button>`).join('')}
    </div>`;
   card.querySelectorAll('.regHalf').forEach(btn=>btn.onclick=e=>{e.stopPropagation();setSelected(Number(btn.dataset.halfId))});
  }else{
   card.innerHTML=`<span class="slot">${i+1}</span><div class="cardContent">${portrait}<div class="rightPart"><div class="name">${s.name}</div><div class="sub">${s.role}</div><div class="formation"><button type="button" class="currentForm" aria-label="Change formation">◇ Balanced</button><div class="formButtons">${Object.entries(fkeys).map(([key,val])=>`<button type="button" class="fbtn" data-key="${val}" title="${form[val].name}">${formShort[val]} ${key.toUpperCase()}</button>`).join('')}</div></div>${hp}</div></div>`;
   card.querySelector('.face').onclick=e=>{e.stopPropagation();setSelected(s.id);action(s.id,{type:'skill',which:0})};
   card.querySelectorAll('.fbtn').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();setSelected(s.id);action(s.id,{type:'formation',key:b.dataset.key})}));
   setupHold(card.querySelector('.currentForm'),s.id);
  }
  card.addEventListener('click',e=>{if(e.target.closest('button'))return;setSelected(s.id)});
  const face=card.querySelector('.face');if(face)face.style.background=`linear-gradient(160deg, ${blendHex('#435867',colors[s.type]||'#80a8ad',.50)}, #203249)`;
  root.appendChild(card);
 }
 cardsStamp=JSON.stringify(ownSquads().map(s=>[s.id,s.name,s.cost,s.retired,s.groupId]));updateCards();
}
function ensureCards(){const mark=JSON.stringify(ownSquads().map(s=>[s.id,s.name,s.cost,s.retired,s.groupId]));if(mark!==cardsStamp)makeCards()}
function setSelected(id){if(!owns(id)){notify('That unit belongs to another player.',1.5);return}selected=id;dirty=true;updateCards()}
function syncHUD(){if(!state)return;$('beaconText').textContent=`${Math.ceil(state.beacon)} / ${state.maxBeacon}`;$('beaconFill').style.width=`${clamp(state.beacon/state.maxBeacon*100,0,100)}%`;
 $('waveText').textContent=`${state.wave} / ${MAX_WAVES}`;$('enemyText').textContent=`${state.enemies.length+state.queue.length} left`;
 const challenge=state.wavePlan||waveDifficulty(Math.max(1,state.wave),players().length);
 $('scaleText').textContent=`${challenge.players}P · ${Math.round(challenge.multiplier*100)}%`;
 $('pauseBtn').textContent=state.paused?'▶ Resume':'Ⅱ Pause';$('speedBtn').textContent=`${state.speed}× Speed`;
 $('endOverlay').hidden=state.phase!=='ended';ensureCards();updateCards();renderFlow();}
function updateCards(){if(!state)return;
 for(const s of ownDeployments()){
  const card=$('card-'+s.id);if(!card)continue;
  const family=s.archetype==='regiment'?[s,partnerOf(s)].filter(Boolean):[s];
  card.classList.toggle('active',family.some(t=>t.id===selected));
  card.classList.toggle('dead',family.every(t=>!t.alive));
  card.style.borderTopColor=colors[s.type]||'#90b1bc';
  if(s.archetype==='regiment'){
   for(const t of family){const btn=card.querySelector(`[data-half-id="${t.id}"]`);if(!btn)continue;
    btn.classList.toggle('selected',selected===t.id);btn.classList.toggle('routed',!t.alive);
    btn.disabled=!t.alive||state.phase!=='combat';
    btn.querySelector('.regHalfStat').textContent=`${t.soldiers}/${t.soldiersMax} · ${Math.ceil(t.hp)} HP`;
    btn.querySelector('.regHalfHP>span').style.width=`${100*clamp(t.hp/t.maxHp,0,1)}%`;
   }continue;
  }
  const soldier=card.querySelector('.soldierVal');if(soldier)soldier.textContent=s.soldiers||'—';
  const hv=card.querySelector('.healthValue');if(hv)hv.textContent=`${Math.ceil(s.hp)}/${s.maxHp}`;
  const hpfill=card.querySelector('.hpfill');if(hpfill)hpfill.style.width=`${100*clamp(s.hp/s.maxHp,0,1)}%`;
  if(s.archetype==='lone'){
   card.querySelectorAll('.loneSkill').forEach(b=>{const i=Number(b.dataset.skill),key=i===0?'cooldown':`cooldown${i+1}`,cd=s[key]||0;
    const layer=b.querySelector('.loneSkillCD');layer.hidden=cd<.05;layer.textContent=Math.ceil(cd)+'s';
    b.disabled=!s.alive||state.phase!=='combat'||cd>.05;
   });
   const face=card.querySelector('.face');if(face)face.disabled=!s.alive||state.phase!=='combat';
   continue;
  }
  const cd=s.cooldown||0,overlay=card.querySelector('.cooldown');if(overlay){overlay.hidden=cd<.05;overlay.textContent=Math.ceil(cd)}
  const face=card.querySelector('.face');if(face)face.disabled=!s.alive||state.phase!=='combat';
  const f=card.querySelector('.currentForm');if(f){f.textContent=`${formShort[s.formation]} ${form[s.formation].name}`;f.disabled=!s.alive||state.phase!=='combat';}
  card.querySelectorAll('.fbtn').forEach(b=>{b.classList.toggle('on',b.dataset.key===s.formation);b.disabled=!s.alive||state.phase!=='combat'});
 }
}
let hold=null;
function setupHold(trigger,id){trigger.addEventListener('pointerdown',e=>{if(!owns(id)||state.squads[id]?.archetype!=='hero'||state.phase!=='combat')return;e.stopPropagation();e.preventDefault();if(hold)finishHold(null);hold={id,trigger,startX:e.clientX,startY:e.clientY,pointer:e.pointerId,open:false,choice:null};hold.timer=setTimeout(()=>{if(hold?.id===id)openPopup()},350);try{trigger.setPointerCapture(e.pointerId)}catch{}});
trigger.addEventListener('pointermove',e=>{if(!hold||hold.pointer!==e.pointerId)return;if(hold.open)highlightPopup(e.clientX,e.clientY);else if(Math.hypot(e.clientX-hold.startX,e.clientY-hold.startY)>22){clearTimeout(hold.timer);}});
trigger.addEventListener('pointerup',e=>{if(!hold||hold.pointer!==e.pointerId)return;e.stopPropagation();if(hold.open){highlightPopup(e.clientX,e.clientY);finishHold(hold.choice)}else{const id=hold.id;finishHold(null);let next={shield:'balanced',balanced:'spear',spear:'shield'}[state.squads[id].formation];setSelected(id);action(id,{type:'formation',key:next})}});
trigger.addEventListener('pointercancel',()=>finishHold(null));trigger.addEventListener('contextmenu',e=>{e.preventDefault();if(!hold){hold={id,trigger,open:true,choice:null};openPopup()}})}
function openPopup(){if(!hold)return;hold.open=true;popup.hidden=false;popup.innerHTML=Object.keys(form).map(k=>`<button class="popupBtn" data-val="${k}" type="button"><span>${formShort[k]}</span>${form[k].name}</button>`).join('');const rect=hold.trigger.getBoundingClientRect(),sr=stage.getBoundingClientRect();let top=rect.top-sr.top-76,left=rect.left-sr.left+rect.width/2-123;popup.style.top=Math.max(12,top)+'px';popup.style.left=clamp(left,5,sr.width-255)+'px';popup.querySelectorAll('button').forEach(b=>b.onclick=()=>{let id=hold?.id;if(id===undefined)return;finishHold(b.dataset.val)});notify('Slide to a formation, then release.',1.3)}
function highlightPopup(x,y){if(!hold?.open)return;hold.choice=null;popup.querySelectorAll('.popupBtn').forEach(b=>{let r=b.getBoundingClientRect(),yes=x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;b.classList.toggle('highlight',yes);if(yes)hold.choice=b.dataset.val})}
function finishHold(option){if(!hold)return;clearTimeout(hold.timer);let id=hold.id;hold=null;popup.hidden=true;popup.innerHTML='';if(option){setSelected(id);action(id,{type:'formation',key:option})}}
function canvasPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function findSquad(p){let best=null,closest=28;for(const s of state.squads){if(!s.alive||s.retired)continue;let a=project(s.x,terrain(s.x,s.z)+.4,s.z),d=Math.hypot(a.x-p.x,a.y-p.y);if(d<closest){closest=d;best=s}}return best}
function commandAt(p,forced=false){if(state.phase!=='combat')return;let clicked=findSquad(p);if(clicked&&!forced){setSelected(clicked.id);return}let tile=pickTile(p);if(tile&&!blocked(tile.x,tile.z))action(selected,{type:'move',x:tile.x,z:tile.z});else notify('That tile is blocked or outside the battlefield.',1.2)}
canvas.addEventListener('pointerdown',e=>{if(e.button===2)return;pointerDown={...canvasPos(e),pid:e.pointerId};try{canvas.setPointerCapture(e.pointerId)}catch{}});
canvas.addEventListener('pointerup',e=>{if(!pointerDown||pointerDown.pid!==e.pointerId)return;const p=canvasPos(e);if(Math.hypot(p.x-pointerDown.x,p.y-pointerDown.y)<22)commandAt(p);pointerDown=null});
canvas.addEventListener('pointermove',e=>{hover=pickTile(canvasPos(e))});canvas.addEventListener('pointerleave',()=>{hover=null});canvas.addEventListener('contextmenu',e=>{e.preventDefault();commandAt(canvasPos(e),true)});
// User-controlled A/B test: return instantly to the exact Clean Slate appearance.
function updateShadowToggle(){
 renderer.shadowMap.enabled=shadowsEnabled;
 sun.castShadow=shadowsEnabled;
 for(const receiver of shadowReceivers)receiver.visible=shadowsEnabled;
 const button=$('shadowBtn');
 button.textContent=shadowsEnabled?'◩ Shadows ON':'◨ Shadows OFF';
 button.setAttribute('aria-pressed',String(shadowsEnabled));
 button.title=shadowsEnabled?'Disable cast shadows to compare with Clean Slate':'Enable directional cast shadows';
}
$('shadowBtn').onclick=()=>{shadowsEnabled=!shadowsEnabled;updateShadowToggle();dirty=true;notify(shadowsEnabled?'Hard sunlight shadows enabled':'Clean Slate lighting (shadows disabled)',1.35)};
updateShadowToggle();
$('pauseBtn').onclick=()=>{if(net.mode==='guest'||state.phase!=='combat')return;state.paused=!state.paused;dirty=true;syncHUD()};
$('speedBtn').onclick=()=>{if(net.mode==='guest'||state.phase!=='combat')return;state.speed=state.speed===1?2:1;syncHUD()};
$('resetBtn').onclick=()=>{if(net.mode==='guest')leaveLocal();else if(net.mode==='host')leaveLocal();else reset()};
$('playAgain').onclick=()=>{if(net.mode==='guest')leaveLocal();else if(net.mode==='host')leaveLocal();else reset()};
window.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)||!$('lobby').hidden||state.phase!=='combat')return;
 const k=e.key.toLowerCase();if([' ','1','2','3','4','q','e','r','f','z','x','c','h','escape'].includes(k))e.preventDefault();
 if(k>='1'&&k<='4'){const s=slotAssignments()[Number(k)-1];if(s){const target=e.shiftKey&&s.archetype==='regiment'?partnerOf(s):s;setSelected((target||s).reserved?(target||s).unit.id:(target||s).id)}}
 else if(['q','e','r','f'].includes(k))action(selected,{type:'skill',which:['q','e','r','f'].indexOf(k)});
 else if(fkeys[k]&&state.squads[selected]?.archetype==='hero')action(selected,{type:'formation',key:fkeys[k]});else if(k==='h')action(selected,{type:'hold'});
 else if(k===' '||k==='escape')$('pauseBtn').click()
});
function updateSkillDock(){const dock=$('skillDock'),s=state.squads[selected];dock.hidden=state.phase!=='combat'||!s||!owns(s.id)||!s.alive||s.archetype!=='hero';
 if(dock.hidden)return;
 const labels=s.archetype==='lone'?['Sweeping Cut','Falling Blade','Champion Whirl','Legendfall'].slice(0,s.cost):[s.ability];
 const hash=s.id+'|'+labels.join('|');if(dock.dataset.hash!==hash){dock.dataset.hash=hash;dock.innerHTML='';labels.forEach((name,i)=>{const btn=document.createElement('button');btn.type='button';btn.dataset.skill=i;btn.innerHTML=`<b>${['Q','E','R','F'][i]}</b> ${name}`;btn.onclick=()=>{setSelected(s.id);action(s.id,{type:'skill',which:i})};dock.appendChild(btn)})}
 dock.querySelectorAll('button').forEach((b,i)=>{const k=i===0?'cooldown':'cooldown'+(i+1);const cd=s[k]||0;b.disabled=cd>.05;b.title=cd>.05?Math.ceil(cd)+'s left':'Ready';b.style.opacity=cd>.05?'.52':'1'});
}
function renderFlow(){if(!state)return;
 const me=net.slot;
 const mark=JSON.stringify([state.phase,net.mode,net.slot,state.shopVersion,state.ready[me],state.wallet[me],state.drafts[me],state.offers[me],ownSquads().map(s=>[s.id,s.name,s.cost,s.level,s.hp,s.retired]),net.members.map(m=>m.slot)]);
 if(mark===uiStamp){updateSkillDock();return}uiStamp=mark;
 const phase=state.phase;const start=$('mainMenu'),draft=$('draftScreen'),shop=$('shopScreen');
 start.hidden=phase!=='menu'||!$('lobby').hidden;draft.hidden=phase!=='draft';shop.hidden=phase!=='shop';
 if(phase==='draft'){
 const d=state.drafts[me],choices=$('draftChoices'),waiting=!!state.ready[me];choices.replaceChildren();
 const options=d?[{kind:'lone',icon:'⚔',name:'Lone Swordsman',blurb:'Takes 2 slots. One powerful fighter, no soldiers. Starts with Sweeping Cut (Q) and Falling Blade (E).',cost:'2 of 4 slots'},
 {kind:'hero',icon:'♞',name:(specs.find(s=>s.type===d.hero)||specs[0]).name+' + Squad',blurb:'Random offensive hero. Four soldiers and one active skill. Flexible upgrades later.',cost:'1 of 4 slots'},
 {kind:'regiment',icon:'▥',name:KIND_NAMES[d.regiment]+' Regiment',blurb:'Two independently controlled five-soldier detachments, each with a visual banner carrier. No formations.',cost:'1 of 4 slots'}]:[];
 options.forEach(o=>{const b=document.createElement('button');b.type='button';b.className='draftChoice';b.disabled=waiting;b.innerHTML=`<span class="glyph">${o.icon}</span><span class="kind">${o.kind==='lone'?'Lone hero':o.kind==='hero'?'Hero + army':'Soldiers only'}</span><strong>${o.name}</strong><span class="desc">${o.blurb}</span><span class="cost">${o.cost} · Choose</span>`;b.onclick=()=>playerAction({type:'draft',choice:o.kind});choices.appendChild(b)});
 const opening=waveDifficulty(1,players().length);
 $('draftHint').textContent=waiting?'Your choice is locked. Waiting for the other players.':`Pick ONE offensive starting unit. Wave 1: ${opening.count} enemies (${opening.players}P · ${Math.round(opening.multiplier*100)}%). The other slots remain free.`;
 $('draftProgress').textContent=`${players().filter(p=>state.ready[p]).length} / ${players().length} players drafted`;
 }
 if(phase==='shop'){
 const cash=state.wallet[me]||0,ready=!!state.ready[me];$('shopWallet').innerHTML=`${cash} <small>supplies</small>`;
 const offers=$('shopOffers');offers.replaceChildren();for(const [i,o] of (state.offers[me]||[]).entries()){
  const b=document.createElement('button');b.className='offerBtn';b.disabled=ready||cash<3||freeSlots(me)<1;
  const nm=o.kind==='hero'?(specs.find(s=>s.type===o.type)||specs[0]).name+' + Squad':KIND_NAMES[o.type]+' Regiment';
  b.innerHTML=`<b>+ ${nm}</b><small>${o.kind==='hero'?'A flexible hero with four soldiers.':'Two independent groups of five; each has a visual banner.'} Uses 1 slot.</small><span>3 supplies · Recruit</span>`;
  b.onclick=()=>playerAction({type:'purchase',purchase:{kind:'buy',index:i}});offers.appendChild(b)
 }
 const roster=$('shopRoster');roster.replaceChildren();for(const u of ownDeployments()){
  const box=document.createElement('div');box.className='rosterItem';box.innerHTML=`<b>${u.name}</b><small>${u.cost} slot${u.cost!==1?'s':''} · level ${u.level} · ${u.archetype==='regiment'?'Alpha + Bravo detachments':u.alive?'active':'routed'} · ${u.mutation||'no mutation'}</small>`;
  const row=document.createElement('div');row.style.cssText='display:flex;gap:5px;flex-wrap:wrap;margin-top:7px';
  const add=(label,kind,price,allowed)=>{const b=document.createElement('button');b.textContent=label+' · '+price;b.disabled=ready||cash<price||!allowed;b.style.cssText='padding:6px 8px;min-height:31px;font-size:11px';b.onclick=()=>playerAction({type:'purchase',purchase:{kind,unitId:u.id}});row.appendChild(b)};
  add('Upgrade','upgrade',2,u.alive);if(u.archetype==='lone'&&u.cost<4)add('Promote','promote',3,freeSlots(me)>=1);
  add('Retire','retire',2,ownDeployments().length>1);box.appendChild(row);roster.appendChild(box)
 }
 const next=state.wave<MAX_WAVES?waveDifficulty(state.wave+1,players().length):null;
 $('shopHint').textContent=next?`Wave ${state.wave} survived · +3 supplies. Next wave: ${next.count} enemies (${next.players}P · ${Math.round(next.multiplier*100)}%). Adapt or save supplies.`:`Final wave survived · +3 supplies. Prepare to finish the run.`;
 $('shopStatus').textContent=ready?'Ready. Waiting for other players…':`${freeSlots(me)} free slots · retirement costs 2 supplies and loses all upgrades.`;
 $('shopReady').disabled=ready;$('shopReady').textContent=ready?'✓ Ready — waiting…':state.wave>=MAX_WAVES?'Finish run':'Ready for next wave';
 }
 updateSkillDock();
}
$('shopReady').onclick=()=>playerAction({type:'purchase',purchase:{kind:'ready'}});
$('startSolo').onclick=()=>{if(net.mode!=='solo')leaveLocal();startDraft([0])};
$('startMultiplayer').onclick=()=>{$('mainMenu').hidden=true;$('lobby').hidden=false;uiStamp='';lobbyButtons()};
// -------- Shared match relay. Browser host simulates the battle for now. --------
async function api(path,data){let r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let j=await r.json();if(!r.ok)throw Error(j.error||'Server error');return j}
function netLabel(str){$('netStatus').textContent=str}
function lobbyButtons(){let joined=net.mode==='host'||net.mode==='guest';$('hostRoom').hidden=joined;$('joinRoom').hidden=joined;$('leaveRoom').hidden=!joined;
 $('beginOnline').hidden=net.mode!=='host';$('beginOnline').disabled=net.mode!=='host'||state.phase==='combat'||state.phase==='draft'||state.phase==='shop';
 $('roomCode').readOnly=joined;$('netPlayers').textContent=joined?'Room '+net.room+' · '+net.members.map(m=>`P${m.slot+1}: ${m.name}`).join(' · '):'';
 $('shareRoom').hidden=!joined;
 $('resetBtn').disabled=net.mode==='guest';$('pauseBtn').disabled=net.mode==='guest';$('speedBtn').disabled=net.mode==='guest';}
function listen(){net.events?.close();net.events=new EventSource(`/api/events?room=${encodeURIComponent(net.room)}&token=${encodeURIComponent(net.token)}`);
 net.events.addEventListener('roster',e=>{net.members=JSON.parse(e.data).members;
  if(net.mode==='host'&&state.phase!=='menu'&&state.phase!=='lobby'){
   state.players=state.players.filter(p=>net.members.some(m=>m.slot===p));
   if(state.phase==='draft'&&state.players.length&&state.players.every(p=>state.ready[p]))beginWave();
   if(state.phase==='shop'&&state.players.length&&state.players.every(p=>state.ready[p])){if(state.wave>=MAX_WAVES)end(true);else beginWave()}
  }lobbyButtons();dirty=true;uiStamp='';renderFlow()});
 net.events.addEventListener('command',e=>{if(net.mode!=='host')return;const d=JSON.parse(e.data);if(!net.members.some(m=>m.slot===d.fromSlot))return;
  if(d.action?.type==='draft'||d.action?.type==='purchase')applyPlayerAction(d.fromSlot,d.action);
  else if(state.squads[d.squadId]?.owner===d.fromSlot)applyAction(d.squadId,d.action)});
 net.events.addEventListener('snapshot',e=>{if(net.mode!=='guest')return;try{const snap=JSON.parse(e.data);if(!Array.isArray(snap.squads)||!Array.isArray(snap.players))return;
  state=snap;state.strikes=state.strikes||[];state.effects=state.effects||[];
  $('lobby').hidden=state.phase!=='lobby';
  if(!owns(selected))selected=ownSquads()[0]?.id??-1;uiStamp='';syncHUD();}catch(err){netLabel('Snapshot error: '+err.message)}});
 net.events.addEventListener('closed',()=>{netLabel('Room closed.');leaveLocal()});net.events.onerror=()=>{if(net.mode!=='solo')netLabel('Reconnecting…')}
}
async function room(mode){try{const name=$('playerName').value.trim().slice(0,16)||'Commander';const d=await api(mode==='host'?'create':'join',{name,room:$('roomCode').value.trim().toUpperCase()});
 net.mode=mode;net.room=d.room;net.token=d.token;net.slot=d.slot;net.members=d.members||[];
 state=makeState();state.phase='lobby';selected=-1;uiStamp='';cardsStamp='';listen();lobbyButtons();
 netLabel(`${mode==='host'?'Hosting':'Joined'} ${net.room}. ${mode==='host'?'Start the draft when everyone joins.':'Waiting for the host to start.'}`);
 $('roomCode').value=net.room;makeCards();renderFlow();}catch(e){netLabel('Connection error: '+e.message)}}
function leaveLocal(){net.events?.close();net.events=null;net.mode='solo';net.room='';net.token='';net.slot=0;net.members=[];
 $('lobby').hidden=true;reset();lobbyButtons()}
$('lobbyBtn').onclick=()=>{$('lobby').hidden=!$('lobby').hidden;uiStamp='';if(!$('lobby').hidden)$('mainMenu').hidden=true;else renderFlow()};
$('lobbyClose').onclick=()=>{$('lobby').hidden=true;uiStamp='';renderFlow()};
$('backFromLobby').onclick=()=>{if(net.mode!=='solo')leaveLocal();else{$('lobby').hidden=true;reset()}};
$('hostRoom').onclick=()=>room('host');$('joinRoom').onclick=()=>room('guest');
$('shareRoom').onclick=async()=>{
 if(!net.room)return;
 const url=new URL(window.location.href);url.searchParams.set('room',net.room);url.hash='';
 const invite=url.toString();
 // On Android, open the native share sheet if available; otherwise copy the link.
 if(navigator.share){try{await navigator.share({title:'Veilwards co-op',text:'Join my Veilwards room '+net.room,url:invite});return}
 catch(e){if(e?.name==='AbortError')return}}
 try{await navigator.clipboard.writeText(invite);netLabel('Invite link copied. Send it to your friends!')}
 catch(e){netLabel('Share this link: '+invite)}
};

$('beginOnline').onclick=()=>{if(net.mode!=='host')return;startDraft(net.members.map(m=>m.slot));lobbyButtons()};
$('leaveRoom').onclick=async()=>{try{await api('leave',{room:net.room,token:net.token})}catch{}leaveLocal()};
function sendSnapshot(){if(net.mode!=='host'||net.sending)return;net.sending=true;fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:net.room,token:net.token,state})}).catch(()=>{}).finally(()=>{net.sending=false})}
let hudLast=0,drawLast=0;function frame(t){const dt=Math.min((t-lastTime)/1000,.06);lastTime=t;update(dt);
 if(t-drawLast>14){render();drawLast=t}
 if(dirty&&t-hudLast>150){syncHUD();hudLast=t;dirty=false}
 if(net.mode==='host'&&t-net.lastSend>180){net.lastSend=t;sendSnapshot()}
 if(toastEl.classList.contains('show')&&t>toastTimeout)toastEl.classList.remove('show');requestAnimationFrame(frame)}
window.__VEILWARDS_DEV__={read:()=>state,project,select:id=>setSelected(id),draft:(choice)=>draftPick(net.slot,choice),purchase:(purchase)=>processShop(net.slot,purchase),command:(id,a)=>action(id,a),
 difficulty:(wave,playerCount)=>waveDifficulty(wave,playerCount),
 renderer:'Three.js r180',threeRevision:THREE.REVISION,scene,rendererInstance:renderer,shadowsEnabled:()=>shadowsEnabled,setShadows:on=>{shadowsEnabled=!!on;updateShadowToggle()}};
reset();lobbyButtons();
const inviteCode=new URLSearchParams(window.location.search).get('room');
if(inviteCode&&/^[A-F0-9]{6}$/i.test(inviteCode)){
 $('roomCode').value=inviteCode.toUpperCase();
 $('mainMenu').hidden=true;$('lobby').hidden=false;
 netLabel('Invitation for room '+inviteCode.toUpperCase()+'. Enter your name and tap Join.');
}
requestAnimationFrame(frame);
})();

import './styles.css';
import { createMaterials, enhanceWorld } from './realism.js';

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

THREE.DefaultLoadingManager.onLoad=()=>document.getElementById('loading')?.remove();

/* ============================================================
   CONSTANTS
============================================================ */
const GROUND_SIZE = 800, HALF = 400, SEG = 200;
const EYE = 1.7;
const GRAV = 25, WALK = 8, JUMP = 9;
const SUN_TILT = Math.PI * 0.24;
let dayPeriod = 240, yearPeriod = 480, masterVolume = 0.6;
let sunAngle = Math.PI * 0.12, yearPhase = 0;
let fogDensity = 0.009;
let seasonMode = 'auto', manualSeason = 0;
let timePaused = false;
const SEASONS = ['Spring','Summer','Autumn','Winter'];
const seasonOf = p => SEASONS[Math.floor(p) % 4];

/* ============================================================
   NOISE
============================================================ */
const h2 = (x,y) => { const n = Math.sin(x*127.1 + y*311.7) * 43758.5453; return n - Math.floor(n); };
function vn(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  return h2(xi,yi)*(1-u)*(1-v)+h2(xi+1,yi)*u*(1-v)+h2(xi,yi+1)*(1-u)*v+h2(xi+1,yi+1)*u*v;}
function fbm(x,y,o=4){let t=0,a=1,f=1,m=0;for(let i=0;i<o;i++){t+=vn(x*f,y*f)*a;m+=a;a*=.5;f*=2;}return t/m;}

/* ============================================================
   RIVERS + POND + WATER MASKS
============================================================ */
const riverZ  = x => Math.sin(x*0.0080)*130 + Math.sin(x*0.0210+1.7)*30 + Math.cos(x*0.0035)*60 + 20;
const riverZ2 = x => Math.sin(x*0.0110+2.2)*70 + Math.cos(x*0.0055-1.1)*45 - 380;
const streamZ = x => Math.sin(x*0.035+0.5)*25 + 220;
const RH = 15, RB = 50, RF = -8.5, RL = -2.5;
const RH2 = 10, RF2 = -6, SH = 5, SF = -4;
const POND = { x: 45, z: 60, r: 12, wy: 0, fy: -4.0, bank: 10 };
const dR  = (x,z) => Math.abs(z - riverZ(x));
const dR2 = (x,z) => Math.abs(z - riverZ2(x));
const dS  = (x,z) => Math.abs(z - streamZ(x));
const dP  = (x,z) => Math.hypot(x - POND.x, z - POND.z);
const inWater = (x,z) => dR(x,z) < RH || dR2(x,z) < RH2 || dS(x,z) < SH || dP(x,z) < POND.r;
function carve(h, d, half, bank, floor){
  if(d >= bank) return h;
  if(d <= half) return floor;
  const t = (d - half) / (bank - half), s = t*t*(3 - 2*t);
  return floor*(1 - s) + h*s;
}

/* ============================================================
   BIOMES + TERRAIN  (12 biome families preserved)
============================================================ */
const BD = {
  mountain:{e:.85,m:.40,t:.40}, forest:{e:.42,m:.75,t:.55}, jungle:{e:.40,m:.90,t:.80},
  grassland:{e:.38,m:.50,t:.60}, desert:{e:.30,m:.10,t:.85}, tundra:{e:.55,m:.30,t:.15}, swamp:{e:.10,m:.90,t:.55}
};
const BK = Object.keys(BD);
function biomes(x,z){
  const s = 0.0009;
  const e = fbm(x*s+100, z*s+100, 3), m = fbm(x*s+400, z*s+400, 3), t = fbm(x*s+800, z*s+800, 3);
  const w = {}; let tot = 0;
  for(const k of BK){ const b = BD[k];
    const d2 = (e-b.e)**2 + (m-b.m)**2 + (t-b.t)**2;
    const ww = 1/(d2 + 0.02); w[k] = ww; tot += ww;
  }
  for(const k of BK) w[k] /= tot;
  return w;
}
const dom = w => { let b='grassland', v=-1; for(const k in w) if(w[k]>v){v=w[k];b=k;} return b; };

function bh(name,x,z){
  switch(name){
    case'mountain':{ const r=1-Math.abs(fbm(x*0.005,z*0.005,5)*2-1); return 30+Math.pow(r,1.4)*160+fbm(x*0.02,z*0.02,3)*8; }
    case'forest': return 5+fbm(x*0.006,z*0.006,4)*14;
    case'jungle': return 4+fbm(x*0.007,z*0.007,4)*10;
    case'grassland': return 2+fbm(x*0.005,z*0.005,4)*6;
    case'desert':{ const dx=x*0.055+z*0.02, dz=z*0.06-x*0.015; return 2+Math.sin(dx)*Math.cos(dz)*3+fbm(x*0.01,z*0.01,3)*2; }
    case'tundra': return 4+fbm(x*0.007,z*0.007,3)*8;
    case'swamp': return -2.5+fbm(x*0.02,z*0.02,2)*1.5;
    default: return 4;
  }
}
function terrainH(x,z){
  const w = biomes(x,z); let h = 0;
  for(const k in w) h += bh(k,x,z)*w[k];
  h += fbm(x*0.05,z*0.05,2)*0.8;
  h = Math.max(h, 1.5);
  const ds = Math.hypot(x,z);
  h *= 0.35 + 0.65*THREE.MathUtils.smoothstep(ds,20,60);
  h = carve(h, dR(x,z), RH, RB, RF);
  h = carve(h, dR2(x,z), RH2, RH2+30, RF2);
  h = carve(h, dS(x,z), SH, SH+15, SF);
  const dp = dP(x,z);
  if(dp < POND.r + POND.bank){
    if(dp <= POND.r) h = POND.fy;
    else { const t = (dp - POND.r)/POND.bank, s = t*t*(3-2*t); h = POND.fy*(1-s) + h*s; }
  }
  return h;
}

const _hCache = new Map();
const H_CACHE_CELL = 3;
const H_CACHE_INV = 1 / H_CACHE_CELL;
function terrainHCached(x,z){
  const gx=THREE.MathUtils.clamp((x+HALF)/GROUND_SIZE*SEG,0,SEG-.0001), gz=THREE.MathUtils.clamp((z+HALF)/GROUND_SIZE*SEG,0,SEG-.0001);
  const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,i=iz*(SEG+1)+ix;
  const a=gp.getY(i),b=gp.getY(i+SEG+1),c=gp.getY(i+SEG+2),d=gp.getY(i+1);
  return u+v<=1?a+(d-a)*u+(b-a)*v:c+(b-c)*(1-u)+(d-c)*(1-v);
}

/* ============================================================
   RENDERER / SCENE / CAMERA
============================================================ */
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('world').appendChild(renderer.domElement);
const pbr = createMaterials(renderer);
const MAXA = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9bb8d3, fogDensity);
const camera = new THREE.PerspectiveCamera(65, innerWidth/innerHeight, 0.08, 5000);

/* ============================================================
   SKY + CELESTIAL + CONSTELLATIONS
============================================================ */
const sky = new Sky();
sky.scale.setScalar(40000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 14; skyU.rayleigh.value = 0.8; skyU.mieCoefficient.value = 0.005;
skyU.mieDirectionalG.value = 0.8;
skyU.sunPosition.value = new THREE.Vector3(0,1,0);

const skyRoot = new THREE.Group(); scene.add(skyRoot);
const celGrp = new THREE.Group(); skyRoot.add(celGrp);

function glowTex(s = 256){
  const c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(255,240,200,1)');
  g.addColorStop(0.15,'rgba(255,220,150,0.75)');
  g.addColorStop(0.45,'rgba(255,180,90,0.25)');
  g.addColorStop(1,'rgba(255,150,60,0)');
  x.fillStyle = g; x.fillRect(0,0,s,s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(28,16,16), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }));
sunMesh.position.set(3000,0,0); celGrp.add(sunMesh);
const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffddaa, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sunHalo.scale.set(400,400,1); sunHalo.position.set(3000,0,0); celGrp.add(sunHalo);

const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(20,16,16), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false }));
moonMesh.position.set(-3000,0,0); celGrp.add(moonMesh);
const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xaabbdd, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
moonHalo.scale.set(200,200,1); moonHalo.position.set(-3000,0,0); celGrp.add(moonHalo);

const SC = 800, starPos = new Float32Array(SC*3);
for(let i=0;i<SC;i++){
  const th = 2*Math.PI*Math.random(), ph = Math.acos(2*Math.random()-1), r = 2000;
  starPos[i*3] = r*Math.sin(ph)*Math.cos(th);
  starPos[i*3+1] = r*Math.sin(ph)*Math.sin(th);
  starPos[i*3+2] = r*Math.cos(ph);
}
const bgStarGeo = new THREE.BufferGeometry();
bgStarGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const bgStarMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
celGrp.add(new THREE.Points(bgStarGeo, bgStarMat));

const consts = [
  { s:[[-0.25,0.35,-0.9],[0.1,0.35,-0.93],[-0.15,0.15,-0.98],[-0.05,0.13,-0.99],[0.05,0.11,-0.99],[-0.25,-0.1,-0.96],[0.1,-0.15,-0.98]],
    e:[[0,2],[2,3],[3,4],[4,1],[0,5],[5,2],[1,6],[6,4]] },
  { s:[[0.55,0.55,0.63],[0.45,0.5,0.74],[0.35,0.48,0.8],[0.3,0.42,0.86],[0.2,0.42,0.88],[0.2,0.52,0.83],[0.3,0.52,0.8]],
    e:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]] },
  { s:[[-0.88,0.45,-0.2],[-0.8,0.35,-0.3],[-0.85,0.48,0],[-0.75,0.38,0.3],[-0.8,0.5,0.4]], e:[[0,1],[1,2],[2,3],[3,4]] }
];
const csP = [], clP = [];
for(const c of consts){
  for(const p of c.s){ const v = new THREE.Vector3(...p).normalize().multiplyScalar(1995); csP.push(v.x,v.y,v.z); }
  for(const [a,b] of c.e){
    const A = new THREE.Vector3(...c.s[a]).normalize().multiplyScalar(1995);
    const B = new THREE.Vector3(...c.s[b]).normalize().multiplyScalar(1995);
    clP.push(A.x,A.y,A.z,B.x,B.y,B.z);
  }
}
const csG = new THREE.BufferGeometry(); csG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(csP), 3));
const csM = new THREE.PointsMaterial({ color: 0xf0f4ff, size: 9, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
celGrp.add(new THREE.Points(csG, csM));
const clG = new THREE.BufferGeometry(); clG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(clP), 3));
const clM = new THREE.LineBasicMaterial({ color: 0x99bbff, transparent: true, opacity: 0 });
celGrp.add(new THREE.LineSegments(clG, clM));

/* ============================================================
   LIGHTS
============================================================ */
const ambient = new THREE.AmbientLight(0xa8c4e0, 0.45); scene.add(ambient);
const hemi = new THREE.HemisphereLight(0x9bb8d3, 0x2e4a2a, 0.6); scene.add(hemi);

const sunLight = new THREE.DirectionalLight(0xfff2cc, 3.0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 800;
sunLight.shadow.camera.left = -80; sunLight.shadow.camera.right = 80;
sunLight.shadow.camera.top = 80; sunLight.shadow.camera.bottom = -80;
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.05;
scene.add(sunLight); scene.add(sunLight.target);

const moonLight = new THREE.DirectionalLight(0x8899cc, 0);
scene.add(moonLight); scene.add(moonLight.target);

/* ============================================================
   TEXTURES
============================================================ */
function grassTex(s = 512){
  const c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = '#4a6b34'; x.fillRect(0,0,s,s);
  for(let i=0;i<s*s*0.2;i++){
    const h = 90+Math.random()*45, st = 25+Math.random()*35, l = 15+Math.random()*30;
    x.fillStyle = `hsl(${h},${st}%,${l}%)`;
    x.fillRect(Math.random()*s, Math.random()*s, 1+Math.random()*2, 2+Math.random()*3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60,60);
  t.anisotropy = MAXA; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function waterTex(s = 256){
  const c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0,0,0,s);
  g.addColorStop(0,'#0a2540'); g.addColorStop(0.5,'#1a4a70'); g.addColorStop(1,'#0a2540');
  x.fillStyle = g; x.fillRect(0,0,s,s);
  for(let i=0;i<200;i++){
    const py = Math.random()*s, a = 0.06 + Math.random()*0.2;
    x.strokeStyle = `rgba(160,220,255,${a})`;
    x.lineWidth = 1 + Math.random()*2.5;
    x.beginPath(); let px = 0; x.moveTo(0, py);
    for(let k=0;k<12;k++){ px += s/12; x.lineTo(px, py + (Math.random()-0.5)*6); }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(15,15);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const grassT = grassTex(), waterTexture = waterTex();

/* ============================================================
   GROUND
============================================================ */
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, SEG, SEG);
groundGeo.rotateX(-Math.PI/2);
const gp = groundGeo.attributes.position;
for(let i=0;i<gp.count;i++) gp.setY(i, terrainH(gp.getX(i), gp.getZ(i)));
gp.needsUpdate = true; groundGeo.computeVertexNormals();
groundGeo.matrixAutoUpdate = false;

const gn = groundGeo.attributes.normal;
const gcol = new Float32Array(gp.count*3);
const BC = {
  mountain: new THREE.Color(0.42,0.40,0.38), forest: new THREE.Color(0.20,0.34,0.14),
  jungle: new THREE.Color(0.12,0.40,0.12), grassland: new THREE.Color(0.48,0.66,0.36),
  desert: new THREE.Color(0.88,0.78,0.55), tundra: new THREE.Color(0.55,0.60,0.58),
  swamp: new THREE.Color(0.18,0.22,0.12)
};
const _ct = new THREE.Color();
for(let i=0;i<gp.count;i++){
  const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i), ny = gn.getY(i);
  const w = biomes(x,z); _ct.setRGB(0,0,0);
  for(const k in w) _ct.add(BC[k].clone().multiplyScalar(w[k]));
  const st = 1 - THREE.MathUtils.smoothstep(ny, 0.72, 0.94);
  _ct.lerp(new THREE.Color(0.48,0.44,0.38), st*0.75);
  const dRR = Math.min(dR(x,z), dR2(x,z), dS(x,z));
  const bk = 1 - THREE.MathUtils.smoothstep(dRR, 10, 25);
  _ct.lerp(new THREE.Color(0.72,0.62,0.42), bk*0.7);
  const hT = THREE.MathUtils.smoothstep(y, 0, 50);
  _ct.multiplyScalar(0.82 + hT*0.28);
  gcol[i*3] = _ct.r; gcol[i*3+1] = _ct.g; gcol[i*3+2] = _ct.b;
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
const groundMat = pbr.ground;
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
ground.matrixAutoUpdate = false; ground.updateMatrix();
scene.add(ground);

const grid = new THREE.GridHelper(GROUND_SIZE, 200, 0, 0x001a00);
grid.material.opacity = 0.25; grid.material.transparent = true;
grid.position.y = 0.05; grid.visible = false;
scene.add(grid);

const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, transparent: true, opacity: 0, depthWrite: false });
const snowGround = new THREE.Mesh(groundGeo, snowMat);
snowGround.position.y = 0.06; snowGround.receiveShadow = true;
snowGround.matrixAutoUpdate = false; snowGround.updateMatrix();
scene.add(snowGround);

/* ============================================================
   WATER — river + pond
============================================================ */
const waterMat = new THREE.MeshStandardMaterial({
  map: waterTexture, color: 0x4a90c8, transparent: true, opacity: 0.72,
  roughness: 0.15, metalness: 0.35, depthWrite: false
});
const waterGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
waterGeo.rotateX(-Math.PI/2);
const waterMesh = new THREE.Mesh(waterGeo, waterMat);
waterMesh.position.y = RL;
waterMesh.matrixAutoUpdate = false; waterMesh.updateMatrix();
scene.add(waterMesh);

const pondMesh = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 40).rotateX(-Math.PI/2), waterMat);
pondMesh.position.set(POND.x, POND.wy, POND.z);
pondMesh.matrixAutoUpdate = false; pondMesh.updateMatrix();
scene.add(pondMesh);

(function pondRocks(){
  const rockMat = pbr.rock;
  const count = 22;
  for(let i = 0; i < count; i++){
    const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
    const r = POND.r + 0.2 + Math.random() * 0.9;
    const rx = POND.x + Math.cos(a) * r;
    const rz = POND.z + Math.sin(a) * r;
    const size = 0.5 + Math.random() * 0.55;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 2), rockMat);
    const ry = terrainH(rx, rz);
    rock.position.set(rx, ry + size * 0.35, rz);
    rock.rotation.set(Math.random()*0.5, Math.random()*6.28, Math.random()*0.5);
    rock.castShadow = true; rock.receiveShadow = true;
    scene.add(rock);
  }
})();

/* ============================================================
   MOUNTAINS
============================================================ */
function createMount(x, z, h, r){
  const geo = new THREE.ConeGeometry(r, h, 20, 12);
  const pos = geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const py = pos.getY(i), hN = (py + h/2) / h;
    if(hN > 0.02 && hN < 0.99){
      const px = pos.getX(i), pz = pos.getZ(i);
      const a = Math.atan2(pz, px);
      let fbm1 = 0, amp = 1, freq = 1;
      for(let oct=0;oct<4;oct++){ fbm1 += Math.sin(a*freq*2.7 + py*0.13*freq)*amp; amp*=0.55; freq*=2.1; }
      let fbm2 = 0, amp2 = 1, freq2 = 1;
      for(let oct=0;oct<3;oct++){ fbm2 += Math.cos(a*freq2*5.3 + py*0.29*freq2)*amp2; amp2*=0.5; freq2*=1.9; }
      const ridge = 1 - Math.abs(fbm1*0.5);
      const craggy = ridge*0.30 + fbm2*0.09;
      const scale = 1 + craggy + Math.sin(a*11 + py*0.4)*0.06;
      pos.setX(i, px*scale); pos.setZ(i, pz*scale);
      pos.setY(i, py + Math.sin(a*4.7 + py*0.6)*0.7);
    }
  }
  pos.needsUpdate = true; geo.computeVertexNormals();

  const snowThreshold = 0.60;
  const colors = new Float32Array(pos.count*3);
  const rockCol = new THREE.Color(0x4a4a52), darkRock = new THREE.Color(0x26262c), snowCol = new THREE.Color(0xf6f9ff);
  for(let i=0;i<pos.count;i++){
    const y = pos.getY(i), hN = (y + h/2)/h;
    let c;
    if(hN > snowThreshold) c = snowCol.clone().lerp(rockCol, Math.max(0, (snowThreshold + 0.05 - hN) * 8));
    else c = darkRock.clone().lerp(rockCol, hN);
    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h/2 - 1.5, z);
  m.castShadow = true; m.receiveShadow = true;
  m.matrixAutoUpdate = false; m.updateMatrix();
  scene.add(m);
}
for(let i=0;i<14;i++){
  const a = (i/14)*Math.PI*2 + (Math.random()-0.5)*0.12;
  const d = HALF - 80 + Math.random()*40;
  const h = 90 + Math.random()*120;
  const r = 40 + Math.random()*35;
  createMount(Math.cos(a)*d, Math.sin(a)*d, h, r);
}

/* ============================================================
   TREES
============================================================ */
function leafTex(hMin, hR, sB, sR, lB, lR, cnt, size = 128){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.clearRect(0,0,size,size);
  for(let i=0;i<cnt;i++){
    const cx = size*0.5 + (Math.random()-0.5)*size*0.85;
    const cy = size*0.5 + (Math.random()-0.5)*size*0.85;
    const r = size*(0.03 + Math.random()*0.05);
    x.save(); x.translate(cx,cy); x.rotate(Math.random()*Math.PI*2);
    const h = hMin + Math.random()*hR, st = sB + Math.random()*sR, l = lB + Math.random()*lR;
    const gr = x.createLinearGradient(-r,0,r,0);
    gr.addColorStop(0, `hsl(${h},${st}%,${Math.max(5,l-12)}%)`);
    gr.addColorStop(1, `hsl(${h},${st}%,${l}%)`);
    x.fillStyle = gr;
    x.beginPath(); x.ellipse(0,0,r,r*0.55,0,0,Math.PI*2); x.fill();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAXA;
  return t;
}
function needleTex(){
  const s = 128;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d'); x.clearRect(0,0,s,s);
  const cx = s/2, cy = s/2;
  for(let i=0;i<60;i++){
    const a = Math.random()*Math.PI*2, len = s*(0.28 + Math.random()*0.26);
    x.strokeStyle = `hsl(${100 + Math.random()*30},40%,${28 + Math.random()*30}%)`;
    x.lineWidth = 0.7 + Math.random()*1.5;
    x.beginPath(); x.moveTo(cx,cy); x.lineTo(cx + Math.cos(a)*len, cy + Math.sin(a)*len); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAXA;
  return t;
}
const oakLeafM = new THREE.MeshStandardMaterial({ map: leafTex(85,40,35,30,55,25,55), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
const pineLeafM = new THREE.MeshStandardMaterial({ map: needleTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95, color: 0x3a5828 });
const blossomLeafM = new THREE.MeshStandardMaterial({ map: leafTex(330,25,70,25,72,18,55), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, transparent: true, opacity: 1 });
const barkM = pbr.bark;
const pineBarkM = pbr.bark.clone(); pineBarkM.color.set(0xa5a39a);

const _up = new THREE.Vector3(0,1,0), _one = new THREE.Vector3(1,1,1);
function addSeg(a, b, r1, r2, out){
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  if(len < 0.001) return;
  const g = new THREE.CylinderGeometry(r2, r1, len, 5, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, _one);
  g.applyMatrix4(m);
  out.push(g);
}
function addCard(p, s, out){
  const g = new THREE.PlaneGeometry(s, s);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI*2, Math.random()*Math.PI));
  const m = new THREE.Matrix4().compose(p.clone(), q, _one);
  g.applyMatrix4(m);
  out.push(g);
}
function addCl(p, r, c, out){
  for(let i=0;i<c;i++){
    const pp = p.clone().add(new THREE.Vector3((Math.random()-0.5)*r*2, (Math.random()-0.5)*r*2, (Math.random()-0.5)*r*2));
    addCard(pp, r*(0.9 + Math.random()*0.5), out);
  }
}
function buildBr(start, dir, len, rad, depth, bG, lG, cfg){
  const end = start.clone().addScaledVector(dir, len);
  addSeg(start, end, rad, rad*cfg.tp, bG);
  if(depth <= 0 || len < cfg.minL){ addCl(end, cfg.lR, cfg.cpc, lG); return; }
  for(let i=0;i<cfg.bf();i++){
    let perp;
    if(Math.abs(dir.dot(_up)) > 0.95) perp = new THREE.Vector3(1,0,0);
    else perp = new THREE.Vector3().crossVectors(dir, _up).normalize();
    perp.applyAxisAngle(dir, Math.random()*Math.PI*2);
    const ang = (Math.random()*2 - 1)*cfg.bA;
    const nd = dir.clone().applyAxisAngle(perp, ang);
    nd.y += cfg.uB; nd.normalize();
    const nl = len*cfg.dec*(0.85 + Math.random()*0.3);
    buildBr(end, nd, nl, rad*cfg.tp, depth-1, bG, lG, cfg);
  }
}
function mkOak(){
  const b = [], l = [];
  const tH = 10 + Math.random()*3, tR = 0.5 + Math.random()*0.2;
  addSeg(new THREE.Vector3(0,0,0), new THREE.Vector3(0,tH,0), tR, tR*0.55, b);
  const m = 3 + Math.floor(Math.random()*2), ba = Math.random()*Math.PI*2;
  for(let i=0;i<m;i++){
    const a = ba + (i/m)*Math.PI*2 + (Math.random()-0.5)*0.5;
    const up = 0.5 + Math.random()*0.35, out = Math.sqrt(Math.max(0, 1 - up*up));
    const dir = new THREE.Vector3(Math.cos(a)*out, up, Math.sin(a)*out).normalize();
    buildBr(new THREE.Vector3(0,tH,0), dir, 3.2, tR*0.55, 3, b, l,
      { tp:0.68, bf:()=>2+(Math.random()<0.4?1:0), bA:0.55, uB:0.10, dec:0.76, minL:0.5, lR:1.4, cpc:6 });
  }
  return { trunk: mergeGeometries(b), leaf: mergeGeometries(l) };
}
function mkPine(){
  const b = [], l = [];
  const tH = 12 + Math.random()*5;
  addSeg(new THREE.Vector3(0,0,0), new THREE.Vector3(0,tH,0), 0.45, 0.06, b);
  const tiers = 8 + Math.floor(Math.random()*3);
  for(let t=0;t<tiers;t++){
    const y = 2 + (t/(tiers-1))*(tH - 3);
    const r = 3.0 * (1 - (t/tiers)*0.94) * (0.85 + Math.random()*0.25);
    const cnt = 4 + Math.floor(Math.random()*2), ba = Math.random()*Math.PI*2;
    for(let i=0;i<cnt;i++){
      const a = ba + (i/cnt)*Math.PI*2;
      const dir = new THREE.Vector3(Math.cos(a), 0.08 + Math.random()*0.1, Math.sin(a)).normalize();
      const st = new THREE.Vector3(0, y, 0);
      const end = st.clone().addScaledVector(dir, r);
      addSeg(st, end, 0.06, 0.014, b);
      addCl(end, 0.6, 2, l);
      addCl(st.clone().lerp(end, 0.55), 0.45, 1, l);
    }
  }
  return { trunk: mergeGeometries(b), leaf: mergeGeometries(l) };
}
function mkBlossom(){
  const b = [], l = [];
  const tH = 4 + Math.random()*2;
  addSeg(new THREE.Vector3(0,0,0), new THREE.Vector3(0,tH,0), 0.4, 0.26, b);
  const m = 3 + Math.floor(Math.random()*2), ba = Math.random()*Math.PI*2;
  for(let i=0;i<m;i++){
    const a = ba + (i/m)*Math.PI*2 + (Math.random()-0.5)*0.4;
    const up = 0.5 + Math.random()*0.25, out = Math.sqrt(Math.max(0, 1 - up*up));
    const dir = new THREE.Vector3(Math.cos(a)*out, up, Math.sin(a)*out).normalize();
    buildBr(new THREE.Vector3(0,tH,0), dir, 2.6, 0.22, 3, b, l,
      { tp:0.65, bf:()=>2+(Math.random()<0.45?1:0), bA:0.6, uB:0.10, dec:0.72, minL:0.35, lR:1.1, cpc:6 });
  }
  return { trunk: mergeGeometries(b), leaf: mergeGeometries(l) };
}
const oakP = [], pineP = [], blossomP = [];
for(let i=0;i<3;i++){ oakP.push(mkOak()); pineP.push(mkPine()); blossomP.push(mkBlossom()); }

const _ray = new THREE.Raycaster();
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3(0,-1,0);
function terrainYRay(x,z){return terrainHCached(x,z);}

const worldColliders = [];
const houseColliders = [];
function registerCollider(center, size){
  worldColliders.push({ box: new THREE.Box3(
    new THREE.Vector3(center.x - size.x/2, center.y - size.y/2, center.z - size.z/2),
    new THREE.Vector3(center.x + size.x/2, center.y + size.y/2, center.z + size.z/2)
  )});
}
function addHouseCollider(cx, cz, rot, lx, ly, lz, sx, sy, sz, baseY){
  houseColliders.push({ cx, cz, rot, lx, ly, lz, sx, sy, sz, baseY });
}

const treeGroup = new THREE.Group(), swayTrees = [];
treeGroup.matrixAutoUpdate = false;
scene.add(treeGroup);
const placed = new Set();

function instTree(protos, lM, bM, x, z, s, cr, hMul){
  const pr = protos[Math.floor(Math.random()*protos.length)];
  const g = new THREE.Group();
  const tr = new THREE.Mesh(pr.trunk, bM); tr.castShadow = true;
  const lf = new THREE.Mesh(pr.leaf, lM); lf.castShadow = true;
  g.add(tr, lf);
  const groundY = terrainYRay(x, z);
  g.position.set(x, groundY, z);
  g.rotation.y = Math.random()*Math.PI*2;
  g.scale.set(s, s*hMul, s);
  const trunkR = 0.45 * s, trunkH = Math.min(5.5 * s, 7);
  registerCollider(new THREE.Vector3(x, groundY + trunkH/2, z), new THREE.Vector3(trunkR*2, trunkH, trunkR*2));
  return g;
}

const HOUSE  = { x: 80,  z: -40, rot: -0.3 };
const HOUSE2 = { x: 130, z: -40, rot: -0.3 };

/* ============================================================
   CABIN BUILDER
============================================================ */
const cabinInstances = [];

function buildAsianCabin(cx, cz, rot, opts){
  const withRamp = !!opts.withRamp;
  const withKitchen = !!opts.withKitchen;
  const withBedroom = !!opts.withBedroom;
  const withWorkerDesk = !!opts.withWorkerDesk;

  const baseY = terrainH(cx, cz);
  const houseBaseY = baseY - 0.2;

  const group = new THREE.Group();
  group.position.set(cx, houseBaseY, cz);
  group.rotation.y = rot;
  group.updateMatrix();
  scene.add(group);

  const CW = 13, CD = 10;
  const CHW = CW/2, CHD = CD/2;
  const TH = 0.3;
  const FH = 3.4;
  const SLAB = 0.3;

  const woodDark = pbr.wood.clone(); woodDark.color.set(0x847b6b);
  const woodMid = pbr.wood;
  const stone = pbr.rock;
  const glass    = new THREE.MeshPhysicalMaterial({ color: 0xa9d3e6, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const floorMat = pbr.wood;
  const roofMat  = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.85 });
  const metal    = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.85 });
  const marble   = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.35 });
  const bedMat   = new THREE.MeshStandardMaterial({ color: 0xf0eae0, roughness: 0.85 });
  const pillowMat= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const fabricSofa = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.94 });
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.3, emissive: 0x1a4a90, emissiveIntensity: 0.7 });

  const add = (w,h,d,x,y,z,mat, noShadow) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z);
    if(!noShadow){ m.castShadow = true; m.receiveShadow = true; }
    group.add(m);
    return m;
  };

  add(CW + 1.6, 2.4, CD + 1.6, 0, -1.2, 0, stone);
  add(CW, SLAB, CD, 0, 0.15, 0, floorMat);

  const floorTop   = 0.3;
  const wallBaseY  = floorTop;
  const wallHeight = FH;
  const frontZ =  CHD - TH/2;
  const backZ  = -CHD + TH/2;
  const leftX  = -CHW + TH/2;
  const rightX =  CHW - TH/2;

  const doorW = 3.2;
  const frontSideW = (CW - doorW) / 2;

  add(CW, wallHeight, TH, 0, wallBaseY + wallHeight/2, backZ, woodDark);
  add(TH, wallHeight, CD, leftX,  wallBaseY + wallHeight/2, 0, woodDark);
  add(TH, wallHeight, CD, rightX, wallBaseY + wallHeight/2, 0, woodDark);
  add(frontSideW, wallHeight, TH, -CHW + frontSideW/2, wallBaseY + wallHeight/2, frontZ, woodDark);
  add(frontSideW, wallHeight, TH,  CHW - frontSideW/2, wallBaseY + wallHeight/2, frontZ, woodDark);
  add(doorW, 0.7, TH, 0, wallBaseY + wallHeight - 0.35, frontZ, woodDark);

  const glassH = wallHeight - 1.3;
  add(frontSideW - 0.4, glassH, 0.08, -CHW + frontSideW/2, wallBaseY + 0.8 + glassH/2, frontZ - 0.02, glass, true);
  add(frontSideW - 0.4, glassH, 0.08,  CHW - frontSideW/2, wallBaseY + 0.8 + glassH/2, frontZ - 0.02, glass, true);
  add(0.08, glassH, CD - 1.6, leftX + 0.02,  wallBaseY + 0.8 + glassH/2, 0, glass, true);
  add(0.08, glassH, CD - 1.6, rightX - 0.02, wallBaseY + 0.8 + glassH/2, 0, glass, true);
  add(CW - 1.6, glassH, 0.08, 0, wallBaseY + 0.8 + glassH/2, backZ + 0.02, glass, true);

  const doorPanelH = wallHeight - 0.6;
  const doorPanelW = doorW / 2 - 0.05;
  const slideY = wallBaseY + doorPanelH/2;
  const slideL = add(doorPanelW, doorPanelH, 0.06, -doorPanelW/2 - 0.02, slideY, frontZ - 0.02, glass, true);
  const slideR = add(doorPanelW, doorPanelH, 0.06,  doorPanelW/2 + 0.02, slideY, frontZ - 0.02, glass, true);
  for(const [sx, g] of [[-1, slideL], [1, slideR]]){
    add(0.06, doorPanelH, 0.08, g.position.x - doorPanelW/2*sx, slideY, frontZ - 0.01, woodMid, true);
    add(0.06, doorPanelH, 0.08, g.position.x + doorPanelW/2*sx, slideY, frontZ - 0.01, woodMid, true);
  }

  const slabCenterY = wallBaseY + FH + SLAB/2;
  const slabTopY    = wallBaseY + FH + SLAB;
  const op = { x0: -2, x1: 2.8, z0: -3.5, z1: 0.5 };

  add(op.x0 - (-CHW), SLAB, CD, (-CHW + op.x0)/2, slabCenterY, 0, floorMat);
  add(CHW - op.x1,   SLAB, CD, (op.x1 + CHW)/2, slabCenterY, 0, floorMat);
  add(op.x1 - op.x0, SLAB, op.z0 - (-CHD), (op.x0 + op.x1)/2, slabCenterY, (-CHD + op.z0)/2, floorMat);
  add(op.x1 - op.x0, SLAB, CHD - op.z1,   (op.x0 + op.x1)/2, slabCenterY, (op.z1 + CHD)/2, floorMat);

  const y2Base = slabTopY;
  const h2 = FH * 0.8;
  add(CW, h2, TH, 0, y2Base + h2/2, backZ, woodDark);
  add(TH, h2, CD, leftX,  y2Base + h2/2, 0, woodDark);
  add(TH, h2, CD, rightX, y2Base + h2/2, 0, woodDark);
  for(let i = 0; i < 8; i++){
    const rx = -CHW + 1 + i * (CW - 2) / 7;
    add(0.08, 0.9, 0.08, rx, y2Base + 0.45, frontZ, woodMid, true);
  }
  add(CW - 1.5, 0.08, 0.12, 0, y2Base + 0.9, frontZ, woodMid, true);
  add(CW - 1.4, h2 - 0.6, 0.06, 0, y2Base + h2/2, backZ + 0.02, glass, true);
  add(0.06, h2 - 0.6, CD - 1.6, leftX + 0.02,  y2Base + h2/2, 0, glass, true);
  add(0.06, h2 - 0.6, CD - 1.6, rightX - 0.02, y2Base + h2/2, 0, glass, true);

  const roofGeo = new THREE.ConeGeometry(1, 1, 4, 1);
  roofGeo.rotateY(Math.PI/4);
  const roofBaseY = y2Base + h2;
  add(CW + 3, 0.2, CD + 3, 0, roofBaseY + 0.1, 0, roofMat);
  const mainRoof = new THREE.Mesh(roofGeo, roofMat);
  mainRoof.scale.set(CHW + 1, 2.8, CHD + 1);
  mainRoof.position.y = roofBaseY + 1.5;
  mainRoof.castShadow = true;
  group.add(mainRoof);
  const upperRoof = new THREE.Mesh(roofGeo, roofMat);
  upperRoof.scale.set(CHW - 1, 1.6, CHD - 0.5);
  upperRoof.position.y = roofBaseY + 3.0;
  upperRoof.castShadow = true;
  group.add(upperRoof);

  const l1 = new THREE.PointLight(0xffaa66, 2.4, 12, 2);
  l1.position.set(0, floorTop + 2.4, 0); group.add(l1);
  const l2 = new THREE.PointLight(0xffaa66, 2.0, 12, 2);
  l2.position.set(0, y2Base + 2.2, 0); group.add(l2);

  // Ground floor: sofa + coffee table
  add(3.6, 0.5, 1.3, -3.0, floorTop + 0.25, backZ + 2.4, fabricSofa);
  add(3.6, 0.6, 0.3, -3.0, floorTop + 0.75, backZ + 1.85, fabricSofa);
  add(0.3, 0.5, 1.3, -4.7, floorTop + 0.5, backZ + 2.4, fabricSofa);
  add(1.6, 0.1, 1.0, -3.0, floorTop + 0.55, backZ + 3.8, woodMid);
  for(const [ox, oz] of [[-0.7,-0.42],[0.7,-0.42],[-0.7,0.42],[0.7,0.42]]){
    add(0.08, 0.5, 0.08, -3.0 + ox, floorTop + 0.25, backZ + 3.8 + oz, woodDark, true);
  }

  if(withKitchen){
    const kx = CHW - 1.4, kz = backZ + 2.2;
    add(2.2, 0.85, 0.75, kx, floorTop + 0.42, kz, woodDark);
    add(2.3, 0.06, 0.85, kx, floorTop + 0.88, kz, marble);
    add(0.6, 0.06, 0.4, kx - 0.3, floorTop + 0.92, kz, metal);
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), metal);
    faucet.position.set(kx - 0.55, floorTop + 1.05, kz - 0.15); group.add(faucet);
    const faucetHead = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), metal);
    faucetHead.rotation.z = Math.PI/2;
    faucetHead.position.set(kx - 0.45, floorTop + 1.2, kz - 0.15); group.add(faucetHead);
    add(2.2, 0.7, 0.4, kx, floorTop + 2.5, kz - 0.15, woodMid);
  }

  const dx = CHW - 3.4, dz = frontZ - 2.5;
  add(1.8, 0.08, 1.0, dx, floorTop + 0.75, dz, woodMid);
  for(const [cx2, cz2] of [[-0.8,-0.4],[0.8,-0.4],[-0.8,0.4],[0.8,0.4]]){
    add(0.08, 0.72, 0.08, dx + cx2, floorTop + 0.36, dz + cz2, woodDark, true);
  }
  for(const cp of [
    { x: dx - 0.6, z: dz - 0.75, ry: 0 },
    { x: dx + 0.6, z: dz - 0.75, ry: 0 },
    { x: dx - 0.6, z: dz + 0.75, ry: Math.PI },
    { x: dx + 0.6, z: dz + 0.75, ry: Math.PI }
  ]){
    const cg = new THREE.Group();
    cg.position.set(cp.x, floorTop, cp.z);
    cg.rotation.y = cp.ry;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), woodMid);
    seat.position.y = 0.45; seat.castShadow = true; cg.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.05), woodMid);
    back.position.set(0, 0.7, -0.2); back.castShadow = true; cg.add(back);
    for(const [lx, lz] of [[-0.18,-0.18],[0.18,-0.18],[-0.18,0.18],[0.18,0.18]]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), woodDark);
      leg.position.set(lx, 0.22, lz); cg.add(leg);
    }
    group.add(cg);
  }

  // Second floor bedroom
  if(withBedroom){
    const bx = -CHW + 3.0, bz = backZ + 3.2;
    add(4.0, 0.35, 5.4, bx, y2Base + 0.18, bz, woodDark);
    add(3.7, 0.35, 5.1, bx, y2Base + 0.55, bz, bedMat);
    add(0.15, 1.1, 5.4, bx - 2.05, y2Base + 0.9, bz, woodMid);
    add(1.6, 0.2, 0.9, bx - 1.1, y2Base + 0.85, bz - 1.9, pillowMat);
    add(1.6, 0.2, 0.9, bx + 1.1, y2Base + 0.85, bz - 1.9, pillowMat);
    add(3.7, 0.08, 3.4, bx, y2Base + 0.75, bz + 0.9, new THREE.MeshStandardMaterial({color:0x3a4a68, roughness:0.9}));
    const wx = -CHW + 1.0, wz = frontZ - 1.0;
    add(0.8, 2.2, 2.0, wx, y2Base + 1.1, wz, woodDark);
    add(0.03, 1.9, 0.03, wx + 0.42, y2Base + 1.0, wz - 0.5, metal, true);
    add(0.03, 1.9, 0.03, wx + 0.42, y2Base + 1.0, wz + 0.5, metal, true);
    const sx = bx + 2.4, sz = bz - 2.4;
    add(0.6, 0.55, 0.6, sx, y2Base + 0.28, sz, woodMid);
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6), metal);
    lampBase.position.set(sx, y2Base + 0.75, sz); group.add(lampBase);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.25, 12, 1, true), new THREE.MeshStandardMaterial({color:0xffd080, roughness:0.9, side:THREE.DoubleSide}));
    lampShade.position.set(sx, y2Base + 1.0, sz); group.add(lampShade);
    const lampLight = new THREE.PointLight(0xffb860, 0.8, 5, 2);
    lampLight.position.set(sx, y2Base + 0.9, sz); group.add(lampLight);
  }

  // Worker desk — placed clear of the ramp opening
  if(withWorkerDesk){
    const deskX = 4.8, deskZ = backZ + 1.0;
    add(2.0, 0.06, 0.9, deskX, y2Base + 0.75, deskZ, woodMid);
    for(const [ox, oz] of [[-0.9,-0.35],[0.9,-0.35],[-0.9,0.35],[0.9,0.35]]){
      add(0.06, 0.75, 0.06, deskX + ox, y2Base + 0.38, deskZ + oz, woodDark, true);
    }
    const chairX = deskX, chairZ = deskZ + 1.1;
    const chairGrp = new THREE.Group();
    chairGrp.position.set(chairX, y2Base, chairZ);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.55), fabricSofa);
    seat.position.y = 0.45; seat.castShadow = true; chairGrp.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.06), fabricSofa);
    back.position.set(0, 0.8, 0.25); back.castShadow = true; chairGrp.add(back);
    for(const [lx, lz] of [[-0.22,-0.22],[0.22,-0.22],[-0.22,0.22],[0.22,0.22]]){
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), metal);
      leg.position.set(lx, 0.22, lz); chairGrp.add(leg);
    }
    group.add(chairGrp);
    add(0.42, 0.02, 0.28, deskX, y2Base + 0.79, deskZ - 0.05, screenMat, true);
    const laptopScreen = add(0.42, 0.28, 0.02, deskX, y2Base + 0.94, deskZ - 0.19, screenMat, true);
    laptopScreen.rotation.x = -0.18;
    const lapGlow = new THREE.PointLight(0x6aa0ff, 0.6, 3, 2);
    lapGlow.position.set(deskX, y2Base + 0.95, deskZ - 0.1); group.add(lapGlow);
    group.userData.workerChair = {
      x: cx + chairX*Math.cos(rot) - chairZ*Math.sin(rot),
      y: houseBaseY + y2Base + 0.45,
      z: cz + chairX*Math.sin(rot) + chairZ*Math.cos(rot),
      rotY: Math.PI + rot
    };
  }

  // Sloped ramp — IDENTICAL for both cabins
  if(withRamp){
    const rampZc = (op.z0 + op.z1) / 2;
    const rampD  = op.z1 - op.z0 - 0.3;
    const startX = op.x1 - 0.3;
    const endX   = op.x0 + 0.3;
    const yStart = wallBaseY;
    const yEnd   = slabTopY;
    const run    = startX - endX;
    const rise   = yEnd - yStart;
    const len    = Math.hypot(run, rise);
    const angle  = Math.atan2(rise, run);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, rampD), woodMid);
    ramp.position.set((startX + endX)/2, (yStart + yEnd)/2 - 0.1, rampZc);
    ramp.rotation.z = angle;
    ramp.castShadow = true; ramp.receiveShadow = true;
    group.add(ramp);
    const nSteps = 12;
    for(let i = 0; i < nSteps; i++){
      const t = (i + 0.5) / nSteps;
      const sx = startX + (endX - startX) * t;
      const sy = yStart + (yEnd - yStart) * t;
      const st = new THREE.Mesh(new THREE.BoxGeometry(run/nSteps * 0.9, 0.06, rampD - 0.1), woodDark);
      st.position.set(sx, sy + 0.04, rampZc);
      group.add(st);
    }
    for(const rz of [op.z0 + 0.15, op.z1 - 0.15]){
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), woodMid);
      rail.position.set((startX + endX)/2, (yStart + yEnd)/2 + 0.9, rz);
      rail.rotation.z = angle;
      group.add(rail);
    }
  }

  const addCol = (lx, ly, lz, sx, sy, sz) => addHouseCollider(cx, cz, rot, lx, ly, lz, sx, sy, sz, houseBaseY);
  addCol(0, wallBaseY + wallHeight/2, backZ, CW, wallHeight, TH);
  addCol(leftX,  wallBaseY + wallHeight/2, 0, TH, wallHeight, CD);
  addCol(rightX, wallBaseY + wallHeight/2, 0, TH, wallHeight, CD);
  addCol(-CHW + frontSideW/2, wallBaseY + wallHeight/2, frontZ, frontSideW, wallHeight, TH);
  addCol( CHW - frontSideW/2, wallBaseY + wallHeight/2, frontZ, frontSideW, wallHeight, TH);
  addCol(0, y2Base + h2/2, backZ, CW, h2, TH);
  addCol(leftX,  y2Base + h2/2, 0, TH, h2, CD);
  addCol(rightX, y2Base + h2/2, 0, TH, h2, CD);

  cabinInstances.push({
    cx, cz, rot, baseY,
    floorTopLocal: floorTop,
    slabTopLocal: slabTopY,
    op, hasRamp: withRamp, CHW, CHD,
    lights: [l1, l2],
    worldX: cx, worldZ: cz
  });

  return { group, slideL, slideR, userData: group.userData };
}

const cabin1 = buildAsianCabin(HOUSE.x,  HOUSE.z,  HOUSE.rot,  { withRamp: true,  withKitchen: true,  withBedroom: false });
const cabin2 = buildAsianCabin(HOUSE2.x, HOUSE2.z, HOUSE2.rot, { withRamp: true,  withKitchen: false, withBedroom: true, withWorkerDesk: true });

function floorHeightAt(x, z, currentY){
  let bestY = -Infinity;
  for(const cab of cabinInstances){
    const dx = x - cab.cx, dz = z - cab.cz;
    const c = Math.cos(cab.rot), s = Math.sin(cab.rot);
    const lx = dx*c - dz*s;
    const lz = dx*s + dz*c;
    if(Math.abs(lx) > cab.CHW || Math.abs(lz) > cab.CHD) continue;
    const groundFloorY  = cab.baseY + cab.floorTopLocal;
    const secondFloorY  = cab.baseY + cab.slabTopLocal;
    let y;
    if(cab.hasRamp){
      const op = cab.op;
      if(lx > op.x0 && lx < op.x1 && lz > op.z0 && lz < op.z1){
        const t = Math.max(0, Math.min(1, (op.x1 - lx) / (op.x1 - op.x0)));
        y = groundFloorY + t * (secondFloorY - groundFloorY);
      } else {
        y = currentY > (groundFloorY + secondFloorY) / 2 ? secondFloorY : groundFloorY;
      }
    } else {
      y = currentY > (groundFloorY + secondFloorY) / 2 ? secondFloorY : groundFloorY;
    }
    if(y > bestY) bestY = y;
  }
  return bestY;
}

/* ============================================================
   FLOWER GARDEN
============================================================ */
const GARDEN = { x: 63, z: 24, w: 6, d: 3 };
const gardenGroup = new THREE.Group();
scene.add(gardenGroup);
const gardenFlowers = [];
const gardenPetalMats = [];

(function buildGarden(){
  const gy = terrainH(GARDEN.x, GARDEN.z);
  gardenGroup.position.set(GARDEN.x, gy, GARDEN.z);

  const borderMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x2e1c0e, roughness: 1.0 });
  const wallH = 0.35, wallT = 0.15;
  const w = GARDEN.w, d = GARDEN.d;

  const mkWall = (ww, hh, dd, xx, yy, zz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), borderMat);
    m.position.set(xx, yy, zz);
    m.castShadow = true; m.receiveShadow = true;
    gardenGroup.add(m);
  };
  mkWall(w + wallT, wallH, wallT, 0, wallH/2, -d/2 - wallT/2);
  mkWall(w + wallT, wallH, wallT, 0, wallH/2,  d/2 + wallT/2);
  mkWall(wallT, wallH, d, -w/2 - wallT/2, wallH/2, 0);
  mkWall(wallT, wallH, d,  w/2 + wallT/2, wallH/2, 0);

  const soil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), soilMat);
  soil.position.set(0, 0.14, 0);
  soil.receiveShadow = true;
  gardenGroup.add(soil);

  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.85, side: THREE.DoubleSide });
  const tulipCols = [0xff3b6b, 0xffa940, 0xffe25a, 0xe25aff, 0xff7a3b];
  const roseCols  = [0xc00030, 0xe83060, 0xff88aa, 0xf0c8d8];
  const petalMats = {};
  function getPetalMat(c){
    if(!petalMats[c]){
      petalMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide });
      gardenPetalMats.push(petalMats[c]);
    }
    return petalMats[c];
  }
  function getRoseMat(c){
    if(!petalMats['r'+c]){
      petalMats['r'+c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, side: THREE.DoubleSide, flatShading: true });
      gardenPetalMats.push(petalMats['r'+c]);
    }
    return petalMats['r'+c];
  }
  const daisyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  gardenPetalMats.push(daisyMat);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xffc840 });
  const tulipCoreMat = new THREE.MeshStandardMaterial({ color: 0xffee88, emissive: 0x554400, emissiveIntensity: 0.3 });

  const geoStem = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5);
  const geoStemRose = new THREE.CylinderGeometry(0.018, 0.022, 0.45, 5);
  const geoStemDaisy = new THREE.CylinderGeometry(0.015, 0.018, 0.4, 5);
  const geoLeafP = new THREE.PlaneGeometry(0.12, 0.28);
  const geoLeafR = new THREE.PlaneGeometry(0.14, 0.22);
  const geoPetalS = new THREE.SphereGeometry(0.05, 8, 6);
  const geoPetalR = new THREE.SphereGeometry(0.06, 6, 5);
  const geoPetalRi = new THREE.SphereGeometry(0.045, 6, 5);
  const geoPetalD = new THREE.SphereGeometry(0.045, 6, 4);
  const geoCore = new THREE.SphereGeometry(0.03, 8, 6);
  const geoCoreD = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12);

  const mkTulip = (px, pz) => {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(geoStem, stemMat); stem.position.y = 0.25; g.add(stem);
    for(const s of [-1, 1]){
      const leaf = new THREE.Mesh(geoLeafP, leafMat);
      leaf.position.set(s*0.07, 0.2, 0);
      leaf.rotation.z = s*0.5; g.add(leaf);
    }
    const bloomCol = tulipCols[(Math.random()*5)|0];
    const petalMat = getPetalMat(bloomCol);
    for(let i=0;i<6;i++){
      const a = (i/6)*Math.PI*2;
      const petal = new THREE.Mesh(geoPetalS, petalMat);
      petal.position.set(Math.cos(a)*0.05, 0.55, Math.sin(a)*0.05);
      petal.scale.set(0.6, 1.2, 0.6); g.add(petal);
    }
    const core = new THREE.Mesh(geoCore, tulipCoreMat); core.position.y = 0.58; g.add(core);
    g.position.set(px, 0.28, pz);
    return g;
  };
  const mkRose = (px, pz) => {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(geoStemRose, stemMat); stem.position.y = 0.22; g.add(stem);
    const leaf = new THREE.Mesh(geoLeafR, leafMat);
    leaf.position.set(0.08, 0.25, 0); leaf.rotation.z = -0.7; g.add(leaf);
    const roseCol = roseCols[(Math.random()*4)|0];
    const petalMat = getRoseMat(roseCol);
    for(let i=0;i<6;i++){
      const a = (i/6)*Math.PI*2;
      const p = new THREE.Mesh(geoPetalR, petalMat);
      p.position.set(Math.cos(a)*0.06, 0.45, Math.sin(a)*0.06);
      p.scale.set(1.1, 0.55, 0.7); p.rotation.y = a; g.add(p);
    }
    for(let i=0;i<4;i++){
      const a = (i/4)*Math.PI*2 + 0.4;
      const p = new THREE.Mesh(geoPetalRi, petalMat);
      p.position.set(Math.cos(a)*0.03, 0.5, Math.sin(a)*0.03);
      p.scale.set(0.9, 0.6, 0.7); g.add(p);
    }
    const core = new THREE.Mesh(geoCore, petalMat); core.position.y = 0.53; g.add(core);
    g.position.set(px, 0.28, pz);
    return g;
  };
  const mkDaisy = (px, pz) => {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(geoStemDaisy, stemMat); stem.position.y = 0.2; g.add(stem);
    for(let i=0;i<10;i++){
      const a = (i/10)*Math.PI*2;
      const petal = new THREE.Mesh(geoPetalD, daisyMat);
      petal.position.set(Math.cos(a)*0.075, 0.42, Math.sin(a)*0.075);
      petal.scale.set(0.8, 0.25, 1.4); petal.rotation.y = a; g.add(petal);
    }
    const center = new THREE.Mesh(geoCoreD, coreMat); center.position.y = 0.43; g.add(center);
    g.position.set(px, 0.28, pz);
    return g;
  };

  const step = 0.36;
  for(let fx = -w/2 + 0.3; fx <= w/2 - 0.3; fx += step){
    for(let fz = -d/2 + 0.3; fz <= d/2 - 0.3; fz += step){
      if(Math.random() < 0.25) continue;
      const jx = fx + (Math.random()-0.5)*0.2;
      const jz = fz + (Math.random()-0.5)*0.2;
      const r = Math.random();
      let f;
      if(r < 0.4) f = mkTulip(jx, jz);
      else if(r < 0.75) f = mkRose(jx, jz);
      else f = mkDaisy(jx, jz);
      gardenGroup.add(f);
      gardenFlowers.push(f);
    }
  }
})();

/* ============================================================
   TREES AROUND CABINS + MONKEYS
============================================================ */
const TREE_GRID = 6;
let tC = 0;
const MAXT = 320;

for(let x=-HALF+50;x<HALF-50;x+=TREE_GRID){
  if(tC >= MAXT) break;
  for(let z=-HALF+50;z<HALF-50;z+=TREE_GRID){
    if(tC >= MAXT) break;
    const jx = x + (Math.random()-0.5)*TREE_GRID*0.9;
    const jz = z + (Math.random()-0.5)*TREE_GRID*0.9;
    if(inWater(jx, jz)) continue;
    if(Math.hypot(jx - HOUSE.x, jz - HOUSE.z) < 25) continue;
    if(Math.hypot(jx - HOUSE2.x, jz - HOUSE2.z) < 25) continue;
    if(Math.hypot(jx - POND.x, jz - POND.z) < POND.r + 8) continue;
    const h = terrainH(jx, jz);
    if(h > 60 || h < 0.5) continue;
    const w = biomes(jx, jz);
    if(w.desert > 0.35) continue;
    const slope = Math.abs(terrainH(jx+2, jz) - h) + Math.abs(terrainH(jx, jz+2) - h);
    if(slope > 3.5) continue;
    const clump = fbm(jx*0.02, jz*0.02, 3);
    let d = 0;
    if(w.forest > 0.35) d = 0.9;
    else if(w.jungle > 0.4) d = 0.9;
    else if(w.forest > 0.2) d = 0.4;
    else if(w.grassland > 0.3) d = 0.12;
    else if(w.tundra > 0.3) d = 0.18;
    else if(w.swamp > 0.3) d = 0.25;
    d *= 0.4 + clump * 1.2;
    if(Math.random() > d) continue;
    let sp; const r = Math.random();
    if(w.jungle > 0.4) sp = r < 0.5 ? 'oak' : r < 0.85 ? 'blossom' : 'pine';
    else if(w.forest > 0.35) sp = r < 0.45 ? 'oak' : r < 0.8 ? 'pine' : 'blossom';
    else if(w.tundra > 0.3) sp = r < 0.8 ? 'pine' : 'oak';
    else sp = r < 0.5 ? 'oak' : 'blossom';
    const hMul = 0.85 + Math.random()*0.5;
    const x0 = jx, z0 = jz, s = 0.85 + Math.random()*0.5;
    let g = null;
    if(sp === 'oak') g = instTree(oakP, oakLeafM, barkM, x0, z0, s, 0.5, hMul);
    else if(sp === 'pine') g = instTree(pineP, pineLeafM, pineBarkM, x0, z0, s, 0.45, hMul);
    else if(sp === 'blossom') g = instTree(blossomP, blossomLeafM, barkM, x0, z0, s, 0.45, hMul);
    if(g){
      const key = `${Math.round(x0)}_${Math.round(z0)}`;
      if(placed.has(key)) continue;
      placed.add(key);
      treeGroup.add(g);
      swayTrees.push({ obj: g, phase: Math.random()*Math.PI*2 });
      tC++;
    }
  }
}

const houseTreeKids = [];
for(let i=0;i<20;i++){
  const angle = Math.PI * (0.15 + (i/19) * 1.7);
  const radius = 16 + Math.random()*6;
  const cx = HOUSE.x + Math.cos(angle)*radius;
  const cz = HOUSE.z + Math.sin(angle)*radius;
  const s = 1.0 + Math.random()*0.5;
  const type = Math.random() < 0.5 ? 'pine' : 'oak';
  const g = type === 'pine'
    ? instTree(pineP, pineLeafM, pineBarkM, cx, cz, s, 0.5, 0.9 + Math.random()*0.4)
    : instTree(oakP, oakLeafM, barkM, cx, cz, s, 0.5, 0.9 + Math.random()*0.4);
  treeGroup.add(g);
  swayTrees.push({ obj: g, phase: Math.random()*Math.PI*2 });
  houseTreeKids.push(g);
}

/* ============================================================
   MONKEYS
============================================================ */
function mkAnim(parts){
  const geos = [];
  for(const p of parts){
    let g;
    if(p.type === 'sphere') g = new THREE.SphereGeometry(p.r, 8, 6);
    else if(p.type === 'capsule') g = new THREE.CapsuleGeometry(p.r, p.h ?? 0.1, 3, 6);
    else if(p.type === 'box') g = new THREE.BoxGeometry(p.w, p.h, p.d);
    else continue;
    if(p.sx || p.sy || p.sz) g.scale(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    if(p.rx) g.rotateX(p.rx); if(p.ry) g.rotateY(p.ry); if(p.rz) g.rotateZ(p.rz);
    g.translate(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    const c = new THREE.Color(p.color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n*3);
    for(let i=0;i<n;i++){ arr[i*3] = c.r; arr[i*3+1] = c.g; arr[i*3+2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  return mergeGeometries(geos);
}
const monkeyBodyGeo = mkAnim([
  { type:'sphere', r:0.28, x:0, y:0.55, sx:1.2, sy:1.0, sz:0.9, color:'#8b5e3c' },
  { type:'sphere', r:0.15, x:0.1, y:0.42, z:0, color:'#a08060' }
]);
const monkeyHeadGeo = mkAnim([
  { type:'sphere', r:0.18, x:0, y:0, color:'#a07050' },
  { type:'sphere', r:0.08, x:0.1, y:0.10, z:0.14, color:'#8b5e3c' },
  { type:'sphere', r:0.08, x:0.1, y:0.10, z:-0.14, color:'#8b5e3c' },
  { type:'sphere', r:0.025, x:0.17, y:0.12, z:0.10, color:'#000' },
  { type:'sphere', r:0.025, x:0.17, y:0.12, z:-0.10, color:'#000' },
  { type:'sphere', r:0.07, x:0.24, y:0.03, color:'#c09070' }
]);
const monkeyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
const monkeyTailMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.88 });

const treeMonkeys = [];
function makeTreeMonkey(treeRef){
  const g = new THREE.Group();
  const body = new THREE.Mesh(monkeyBodyGeo, monkeyMat); body.castShadow = true; g.add(body);
  const headGrp = new THREE.Group();
  const headMesh = new THREE.Mesh(monkeyHeadGeo, monkeyMat); headMesh.castShadow = true;
  headGrp.add(headMesh);
  headGrp.position.set(0.28, 0.78, 0);
  g.add(headGrp);
  const tailGrp = new THREE.Group();
  const tailMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.55, 3, 6), monkeyTailMat);
  tailMesh.position.y = -0.33; tailMesh.castShadow = true;
  tailGrp.add(tailMesh);
  tailGrp.position.set(-0.15, 0.6, 0);
  tailGrp.rotation.z = 0.8; g.add(tailGrp);
  const armL = new THREE.Group();
  armL.position.set(0.15, 0.68, 0.22);
  const armLMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.32, 3, 6), monkeyTailMat);
  armLMesh.position.y = -0.16; armLMesh.castShadow = true;
  armL.add(armLMesh); g.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.15, 0.68, -0.22);
  const armRMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.32, 3, 6), monkeyTailMat);
  armRMesh.position.y = -0.16; armRMesh.castShadow = true;
  armR.add(armRMesh); g.add(armR);
  scene.add(g);

  const baseY = treeRef.position.y + (7 + Math.random() * 3) * treeRef.scale.y;
  const homeAng = Math.random() * Math.PI * 2;
  const homeRad = 0.5 + Math.random() * 0.8;
  const homeX = treeRef.position.x + Math.cos(homeAng) * homeRad;
  const homeZ = treeRef.position.z + Math.sin(homeAng) * homeRad;

  const m = {
    mesh: g, head: headGrp, tail: tailGrp, armL, armR,
    tree: treeRef, homeX, homeZ, baseY,
    phase: Math.random() * Math.PI * 2,
    state: 'perched',
    timer: 6 + Math.random() * 10, t: 0
  };
  g.position.set(homeX, baseY, homeZ);
  return m;
}
for(let i = 0; i < 6; i++){
  const tree = houseTreeKids[i % houseTreeKids.length];
  if(!tree) continue;
  treeMonkeys.push(makeTreeMonkey(tree));
}

/* ============================================================
   PARTICLE TEXTURE + FLAME SYSTEM
============================================================ */
function particleTex(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const PART_TEX = particleTex();

class FlameSystem {
  constructor(parent, origin, opts){
    this.count = opts.count;
    this.origin = origin;
    this.riseSpeed = opts.riseSpeed;
    this.life = opts.life;
    this.spread = opts.spread;
    this.size = opts.size;
    this.positions = new Float32Array(this.count * 3);
    this.colors    = new Float32Array(this.count * 3);
    this.data = [];
    for(let i = 0; i < this.count; i++){
      this.data.push({
        vx: (Math.random()-0.5) * 0.25,
        vy: this.riseSpeed * (0.6 + Math.random()*0.8),
        vz: (Math.random()-0.5) * 0.25,
        life: Math.random() * this.life,
        maxLife: this.life * (0.7 + Math.random()*0.6),
        phase: Math.random() * Math.PI * 2,
        baseX: (Math.random()-0.5) * this.spread,
        baseZ: (Math.random()-0.5) * this.spread
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo = geo;
    const mat = new THREE.PointsMaterial({
      size: this.size, map: PART_TEX, vertexColors: true,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }
  update(dt, now){
    const o = typeof this.origin === 'function' ? this.origin() : this.origin;
    const arr = this.positions, col = this.colors;
    for(let i = 0; i < this.count; i++){
      const d = this.data[i];
      d.life += dt;
      if(d.life >= d.maxLife){
        d.life = 0;
        d.maxLife = this.life * (0.7 + Math.random()*0.6);
        d.vx = (Math.random()-0.5) * 0.25;
        d.vy = this.riseSpeed * (0.6 + Math.random()*0.8);
        d.vz = (Math.random()-0.5) * 0.25;
        d.phase = Math.random() * Math.PI * 2;
        d.baseX = (Math.random()-0.5) * this.spread;
        d.baseZ = (Math.random()-0.5) * this.spread;
      }
      const t = d.life / d.maxLife;
      const twistX = Math.sin(now * 4 + d.phase) * 0.06 * t;
      const twistZ = Math.cos(now * 3.7 + d.phase * 1.3) * 0.06 * t;
      arr[i*3]   = o.x + d.baseX + d.vx * d.life + twistX;
      arr[i*3+1] = o.y + d.vy * d.life;
      arr[i*3+2] = o.z + d.baseZ + d.vz * d.life + twistZ;
      let r, g, b;
      if(t < 0.25){ r = 1.0; g = 0.95; b = 0.7; }
      else if(t < 0.65){ r = 1.0; g = 0.55 - (t-0.25)*0.6; b = 0.15 - (t-0.25)*0.3; }
      else { r = 0.9 - (t-0.65)*2.0; g = 0.15 - (t-0.65)*0.4; b = 0.05; }
      if(r < 0) r = 0; if(g < 0) g = 0; if(b < 0) b = 0;
      const fade = 1 - t;
      col[i*3]   = r * fade;
      col[i*3+1] = g * fade;
      col[i*3+2] = b * fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/* ============================================================
   WATER STREAM — ballistic aimed at garden centre
============================================================ */
class WaterStream {
  constructor(){
    this.count = 60;
    this.positions = new Float32Array(this.count * 3);
    this.data = [];
    for(let i = 0; i < this.count; i++){
      this.data.push({ active: false, x:0, y:0, z:0, vx:0, vy:0, vz:0, life: 0, src: null });
      this.positions[i*3+1] = -1000;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo = geo;
    const mat = new THREE.PointsMaterial({
      color: 0xaaddff, size: 0.075, map: PART_TEX, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.onGardenHit = null;
  }
  _claim(){
    for(let i = 0; i < this.count; i++) if(!this.data[i].active) return this.data[i];
    return null;
  }
  emit(pos, dir, src='npc'){
    const d = this._claim(); if(!d) return;
    d.active = true; d.src = src;
    d.x = pos.x + (Math.random()-0.5)*0.05;
    d.y = pos.y + (Math.random()-0.5)*0.05;
    d.z = pos.z + (Math.random()-0.5)*0.05;
    const speed = 1.8 + Math.random()*0.6;
    d.vx = dir.x * speed + (Math.random()-0.5)*0.35;
    d.vy = dir.y * speed + (Math.random()-0.5)*0.15;
    d.vz = dir.z * speed + (Math.random()-0.5)*0.35;
    d.life = 0;
  }
  emitBallistic(from, to, flightTime=0.9, src='npc'){
    const d = this._claim(); if(!d) return;
    const g = 9.8;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    d.active = true; d.src = src;
    d.x = from.x + (Math.random()-0.5)*0.05;
    d.y = from.y + (Math.random()-0.5)*0.05;
    d.z = from.z + (Math.random()-0.5)*0.05;
    d.vx = dx / flightTime + (Math.random()-0.5)*0.15;
    d.vz = dz / flightTime + (Math.random()-0.5)*0.15;
    d.vy = (dy + 0.5*g*flightTime*flightTime) / flightTime + (Math.random()-0.5)*0.1;
    d.life = 0;
  }
  update(dt){
    const arr = this.positions;
    for(let i = 0; i < this.count; i++){
      const d = this.data[i];
      if(!d.active){ arr[i*3+1] = -1000; continue; }
      d.vy -= 9.8 * dt;
      d.vx *= (1 - 0.4*dt);
      d.vz *= (1 - 0.4*dt);
      d.x += d.vx*dt; d.y += d.vy*dt; d.z += d.vz*dt;
      d.life += dt;
      const land = terrainHCached(d.x, d.z) + 0.1;
      if(d.y <= land || d.life > 3){
        if(this.onGardenHit && d.src === 'player'){
          if(Math.abs(d.x - GARDEN.x) < GARDEN.w/2 + 0.8 &&
             Math.abs(d.z - GARDEN.z) < GARDEN.d/2 + 0.8){
            this.onGardenHit();
          }
        }
        d.active = false;
        arr[i*3+1] = -1000;
        continue;
      }
      arr[i*3] = d.x; arr[i*3+1] = d.y; arr[i*3+2] = d.z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
const waterStream = new WaterStream();

/* ============================================================
   PLAYER + CONTROLS + TORCH
============================================================ */
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(camera);
camera.position.set(94, terrainHCached(94,44)+EYE,44);
camera.lookAt(100,terrainH(100,20)+1.8,20);
controls.pointerSpeed=.7;

const overlay = document.getElementById('overlay');
let menuOpen = false;
let started=false, fallbackMode=false;
const menu = document.getElementById('menu');

document.getElementById('startGame').addEventListener('click', requestPlay);
controls.addEventListener('lock', () => {
  overlay.classList.add('hidden'); menu.classList.add('hidden'); menuOpen = false; started=true; document.body.classList.remove('landing');
});
controls.addEventListener('unlock', () => { if(!menuOpen){overlay.classList.remove('hidden');document.body.classList.add('landing');} clearInput(); });

const bodyMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x2a4d8f, roughness: 0.75 })
);
bodyMesh.visible = false;
scene.add(bodyMesh);

let torchOn = false;
const torchStick = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.045, 0.7, 6),
  new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.95 })
);
torchStick.position.set(0.34, -0.34, -0.6);
torchStick.rotation.x = -0.2;
torchStick.visible = false;
camera.add(torchStick);

const torchSpot = new THREE.SpotLight(0xffcc88, 0, 60, Math.PI/5, 0.5, 1.2);
torchSpot.castShadow = true;
torchSpot.shadow.mapSize.set(512, 512);
torchSpot.shadow.camera.near = 0.5; torchSpot.shadow.camera.far = 40;
torchSpot.shadow.bias = -0.0008;
camera.add(torchSpot);
camera.add(torchSpot.target);
torchSpot.target.position.set(0, 0, -20);

const torchPoint = new THREE.PointLight(0xffaa55, 0, 18, 2);
torchPoint.position.set(0.34, -0.02, -0.6);
camera.add(torchPoint);

const torchFlame = new FlameSystem(camera, { x: 0.34, y: -0.02, z: -0.6 }, {
  count: 22, riseSpeed: 0.55, life: 0.85, spread: 0.06, size: 0.22
});
torchFlame.points.visible = false;

function setTorch(on){
  torchOn = on;
  torchSpot.intensity = on ? 15 : 0;
  torchPoint.intensity = on ? 5 : 0;
  torchStick.visible = on;
  torchFlame.points.visible = on;
}
document.addEventListener('keydown', e => { if(e.code === 'KeyT' && !e.repeat && isPlaying()) setTorch(!torchOn); });

/* ============================================================
   AUDIO
============================================================ */
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();
const audioNodes = [];

function resumeAudio(){
  if(listener.context.state === 'suspended') listener.context.resume().catch(()=>{});
  setTimeout(() => {
    if(listener.context.state === 'running'){
      if(ambientSound.buffer && !ambientSound.isPlaying) ambientSound.play();
      if(riverAudio.buffer && !riverAudio.isPlaying) riverAudio.play();
      if(fireAudio.buffer && !fireAudio.isPlaying) fireAudio.play();
    }
  }, 60);
}
document.addEventListener('click', resumeAudio);
document.addEventListener('keydown', resumeAudio);

const ambientSound = new THREE.Audio(listener);
audioLoader.load('/audio/rain.wav',
  (buf) => { ambientSound.setBuffer(buf); ambientSound.setLoop(true); ambientSound.setVolume(0.35*masterVolume);
    if(listener.context.state === 'running') ambientSound.play(); },
  undefined, e => console.warn('ambient fail', e));
audioNodes.push(ambientSound);

const riverAudioAnchor = new THREE.Object3D();
riverAudioAnchor.position.set(0, RL + 0.5, riverZ(0));
scene.add(riverAudioAnchor);
const riverAudio = new THREE.PositionalAudio(listener);
riverAudio.setRefDistance(30); riverAudio.setMaxDistance(200); riverAudio.setRolloffFactor(1.5);
riverAudioAnchor.add(riverAudio);
audioLoader.load('/audio/river.wav',
  (buf) => { riverAudio.setBuffer(buf); riverAudio.setLoop(true); riverAudio.setVolume(1.6*masterVolume);
    if(listener.context.state === 'running') riverAudio.play(); },
  undefined, e => console.warn('river fail', e));
audioNodes.push(riverAudio);

let muted = false;
function setMuted(m){
  muted = m;
  listener.setMasterVolume(m ? 0 : 1); document.getElementById('mut').textContent=m?'Sound off · M':'Sound on · M';
  if(!m){
    if(ambientSound.buffer) ambientSound.setVolume(0.35*masterVolume);
    if(riverAudio.buffer) riverAudio.setVolume(1.6*masterVolume);
  }
}
document.addEventListener('keydown', e => { if(e.code === 'KeyM' && !e.repeat && !e.target.matches('input,select')) setMuted(!muted); });
document.getElementById('mut').addEventListener('click', e => { e.currentTarget.blur(); setMuted(!muted); });

/* ============================================================
   CAMPFIRE + GRILL + CHAIRS
============================================================ */
const CAMPFIRE_POS = { x: 100, z: 20 };
const campfireGroup = new THREE.Group();
let campfireLight = null;
{
  const stoneM = pbr.rock;
  for(let i=0;i<10;i++){
    const a = (i/10)*Math.PI*2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stoneM);
    st.position.set(Math.cos(a)*1.05, 0.15, Math.sin(a)*1.05);
    st.castShadow = true;
    campfireGroup.add(st);
  }
  const logM = pbr.bark;
  for(let i=0;i<4;i++){
    const a = (i/4)*Math.PI*2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 5), logM);
    log.rotation.z = Math.PI/2; log.rotation.y = a;
    log.position.y = 0.15; log.castShadow = true;
    campfireGroup.add(log);
  }
  campfireLight = new THREE.PointLight(0xff7020, 4, 20, 2);
  campfireLight.position.y = 1.0;
  campfireLight.castShadow = true;
  campfireLight.shadow.mapSize.set(512, 512);
  campfireGroup.add(campfireLight);
  campfireGroup.position.set(CAMPFIRE_POS.x, terrainH(CAMPFIRE_POS.x, CAMPFIRE_POS.z), CAMPFIRE_POS.z);
  scene.add(campfireGroup);
}

const campfireFlame = new FlameSystem(campfireGroup, { x: 0, y: 0.4, z: 0 }, {
  count: 70, riseSpeed: 0.9, life: 1.1, spread: 0.5, size: 0.34
});

// Wire grill above campfire
const grillGroup = new THREE.Group();
grillGroup.position.y = 1.15;
campfireGroup.add(grillGroup);
{
  const grillMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.7 });
  const frameW = 1.4, frameD = 0.8;
  for(let i = 0; i < 5; i++){
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, frameW, 6), grillMat);
    bar.rotation.z = Math.PI/2;
    bar.position.set(0, 0, -frameD/2 + (i/4) * frameD);
    grillGroup.add(bar);
  }
  for(let i = 0; i < 8; i++){
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, frameD, 6), grillMat);
    bar.rotation.x = Math.PI/2;
    bar.position.set(-frameW/2 + (i/7) * frameW, 0, 0);
    grillGroup.add(bar);
  }
  for(const [ox, oz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), grillMat);
    leg.position.set(ox * frameW/2, -0.25, oz * frameD/2);
    grillGroup.add(leg);
  }
}

const fireAudio = new THREE.PositionalAudio(listener);
fireAudio.setRefDistance(8); fireAudio.setMaxDistance(45); fireAudio.setRolloffFactor(2);
campfireGroup.add(fireAudio);
audioLoader.load('/audio/fire.wav',
  (buf) => { fireAudio.setBuffer(buf); fireAudio.setLoop(true); fireAudio.setVolume(2.5*masterVolume);
    if(listener.context.state === 'running') fireAudio.play(); },
  undefined, e => console.warn('fire fail', e));
audioNodes.push(fireAudio);

const chairs = [];
function makeChair(x, z, rotY){
  const g = new THREE.Group();
  const woodMat = pbr.wood;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.55), woodMat);
  seat.position.y = 0.45; seat.castShadow = true; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.06), woodMat);
  back.position.set(0, 0.73, -0.245); back.castShadow = true; g.add(back);
  for(const [dx, dz] of [[-0.22,-0.22],[0.22,-0.22],[-0.22,0.22],[0.22,0.22]]){
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), woodMat);
    leg.position.set(dx, 0.225, dz); leg.castShadow = true; g.add(leg);
  }
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  return { x, z, rotY, occupied: false, owner: null };
}
for(let i=0;i<3;i++){
  const angle = -Math.PI/2 + (i-1)*0.6;
  const cx = CAMPFIRE_POS.x + Math.cos(angle)*2.6;
  const cz = CAMPFIRE_POS.z + Math.sin(angle)*2.6;
  const rotY = Math.atan2(CAMPFIRE_POS.x - cx, CAMPFIRE_POS.z - cz);
  chairs.push(makeChair(cx, cz, rotY));
}

/* ============================================================
   SITTING
============================================================ */
let isSitting = false, sittingChair = null;
const sitPrompt = document.getElementById('sitPrompt');

function findNearestEmptyChair(px, pz, maxDist){
  let best = null, bestD = maxDist;
  for(const c of chairs){
    if(c.occupied) continue;
    const d = Math.hypot(px - c.x, pz - c.z);
    if(d < bestD){ bestD = d; best = c; }
  }
  return best;
}
document.addEventListener('keydown', e => {
  if(e.code !== 'KeyN' || e.repeat || !isPlaying()) return;
  const pp = camera.position;
  if(isSitting){
    isSitting = false;
    if(sittingChair){ sittingChair.occupied = false; sittingChair.owner = null; sittingChair = null; }
    pp.y = terrainH(pp.x, pp.z) + EYE;
    sitPrompt.style.display = 'none';
  } else {
    const c = findNearestEmptyChair(pp.x, pp.z, 2.5);
    if(c){
      isSitting = true;
      sittingChair = c;
      c.occupied = true; c.owner = 'player';
      pp.set(c.x, terrainH(c.x, c.z) + 1.15, c.z);
      sitPrompt.style.display = 'none';
      document.getElementById('npcCallout').style.display = 'none';
    }
  }
});

/* ============================================================
   NPC PERSON
============================================================ */
function makePerson(shirtCol, pantsCol, skinCol){
  const g = new THREE.Group();
  const skin  = new THREE.MeshStandardMaterial({ color: skinCol, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtCol, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsCol, roughness: 0.9 });
  const hair  = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.65, 0.25), shirt);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);

  const headGrp = new THREE.Group();
  headGrp.position.set(0, 1.62, 0);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  headMesh.castShadow = true; headGrp.add(headMesh);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI*2, 0, Math.PI*0.6), hair);
  hairCap.position.y = 0.01; headGrp.add(hairCap);
  g.add(headGrp);

  const armL = new THREE.Group();
  const aLU = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.35, 3, 6), skin);
  aLU.position.y = -0.18; aLU.castShadow = true; armL.add(aLU);
  armL.position.set(-0.28, 1.42, 0); armL.rotation.z = 0.15; g.add(armL);

  const armR = new THREE.Group();
  const aRU = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.35, 3, 6), skin);
  aRU.position.y = -0.18; aRU.castShadow = true; armR.add(aRU);
  armR.position.set(0.28, 1.42, 0); armR.rotation.z = -0.15; g.add(armR);

  const legL = new THREE.Group();
  const legLMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.55, 3, 6), pants);
  legLMesh.position.y = -0.28; legLMesh.castShadow = true;
  legL.add(legLMesh);
  legL.position.set(-0.12, 0.72, 0); g.add(legL);

  const legR = new THREE.Group();
  const legRMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.55, 3, 6), pants);
  legRMesh.position.y = -0.28; legRMesh.castShadow = true;
  legR.add(legRMesh);
  legR.position.set(0.12, 0.72, 0); g.add(legR);

  return { group: g, head: headGrp, torso, armL, armR, legL, legR };
}

/* ============================================================
   GARDENER + WATERING CAN
============================================================ */
const GARDEN_WORK_X = GARDEN.x;
const GARDEN_WORK_Z = GARDEN.z + 3.2;
const gardener = makePerson(0x4a6a3a, 0x3a4a3a, 0xd8a888);
gardener.group.position.set(GARDEN_WORK_X, terrainH(GARDEN_WORK_X, GARDEN_WORK_Z), GARDEN_WORK_Z);
gardener.group.rotation.y = Math.PI;
gardener.workX = GARDEN_WORK_X; gardener.workZ = GARDEN_WORK_Z;
gardener.workY = terrainH(GARDEN_WORK_X, GARDEN_WORK_Z);
gardener.defaultRotY = Math.PI;
gardener.state = 'work';
gardener.chairClaimed = false;
gardener.currentChair = chairs[0];
gardener.walkPhase = 0;
gardener.walkSpeed = 1.8;
gardener.targetX = GARDEN_WORK_X; gardener.targetZ = GARDEN_WORK_Z;
gardener.isGardener = true;
gardener.eatingTimer = 0;
scene.add(gardener.group);

const wateringCan = new THREE.Group();
{
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.35, metalness: 0.75 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.20, 10), metalMat);
  body.castShadow = true; wateringCan.add(body);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.042, 0.30, 8), metalMat);
  spout.position.set(0.16, 0.08, 0); spout.rotation.z = -Math.PI*0.42; spout.castShadow = true;
  wateringCan.add(spout);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.028, 0.05, 8), metalMat);
  nozzle.position.set(0.30, 0.19, 0); nozzle.castShadow = true;
  wateringCan.add(nozzle);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 10, Math.PI), metalMat);
  handle.position.set(-0.11, 0.03, 0); handle.rotation.z = Math.PI/2;
  wateringCan.add(handle);
  const nozzleMarker = new THREE.Object3D();
  nozzleMarker.position.set(0.32, 0.20, 0);
  wateringCan.add(nozzleMarker);
  wateringCan.userData.nozzleMarker = nozzleMarker;
}
wateringCan.position.set(0, -0.52, 0.18);
wateringCan.visible = false;
gardener.armR.add(wateringCan);

/* ============================================================
   PLAYER'S WATER POT (P KEY)
============================================================ */
const playerPot = new THREE.Group();
{
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.4, metalness: 0.75 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 12), metalMat);
  body.castShadow = true; playerPot.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 16), metalMat);
  rim.rotation.x = Math.PI/2; rim.position.y = 0.11; playerPot.add(rim);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.035, 0.22, 8), metalMat);
  spout.position.set(0.16, 0.05, 0); spout.rotation.z = -Math.PI*0.42; playerPot.add(spout);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.022, 0.05, 8), metalMat);
  nozzle.position.set(0.27, 0.14, 0); playerPot.add(nozzle);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.014, 6, 12, Math.PI), metalMat);
  handle.rotation.z = Math.PI/2;
  handle.position.set(-0.14, 0.02, 0);
  playerPot.add(handle);
  const nozzleMarker = new THREE.Object3D();
  nozzleMarker.position.set(0.29, 0.16, 0);
  playerPot.add(nozzleMarker);
  playerPot.userData.nozzleMarker = nozzleMarker;
}
playerPot.position.set(0.55, -0.5, -0.7);
playerPot.rotation.set(0, 0, 0);
playerPot.visible = false;
camera.add(playerPot);

/* ============================================================
   FISHING ROD (NO dangling hook line — simplified)
============================================================ */
const fishingRod = new THREE.Group();
{
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xa0a8b0, roughness: 0.35, metalness: 0.8 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 1.5, 6), rodMat);
  rod.rotation.x = Math.PI * 0.42;
  rod.position.set(0.30, -0.20, -0.85);
  fishingRod.add(rod);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0x0f0805, roughness: 0.95 }));
  grip.rotation.x = Math.PI * 0.42;
  grip.position.set(0.36, -0.30, -0.42);
  fishingRod.add(grip);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), metalMat);
  reel.rotation.z = Math.PI/2;
  reel.position.set(0.22, -0.32, -0.52);
  fishingRod.add(reel);
  const tipMarker = new THREE.Object3D();
  tipMarker.position.set(0.24, 0.06, -1.60);
  fishingRod.add(tipMarker);
  fishingRod.userData.tipMarker = tipMarker;
}
fishingRod.visible = false;
camera.add(fishingRod);

// Bobber (still rendered, but NO line is drawn to it)
const bobber = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 10, 8),
  new THREE.MeshStandardMaterial({ color: 0xff3030, roughness: 0.5 })
);
bobber.visible = false;
scene.add(bobber);

/* ============================================================
   WORKER
============================================================ */
const workerChairInfo = cabin2.userData.workerChair;
const worker = makePerson(0x5a5a8a, 0x2a2a3a, 0xd0a888);
worker.group.position.set(workerChairInfo.x, workerChairInfo.y - 0.28, workerChairInfo.z);
worker.group.rotation.y = workerChairInfo.rotY;
worker.workX = workerChairInfo.x; worker.workZ = workerChairInfo.z;
worker.workY = workerChairInfo.y - 0.28;
worker.defaultRotY = workerChairInfo.rotY;
worker.state = 'work';
worker.chairClaimed = false;
worker.currentChair = chairs[1];
worker.walkPhase = 0;
worker.walkSpeed = 1.8;
worker.targetX = workerChairInfo.x; worker.targetZ = workerChairInfo.z;
worker.eatingTimer = 0;
scene.add(worker.group);

/* ============================================================
   LABELS
============================================================ */
function makeLabel(text){
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.8)';
  if(x.roundRect){ x.beginPath(); x.roundRect(0,0,512,128,20); x.fill(); }
  else { x.fillRect(0,0,512,128); }
  x.fillStyle = 'white';
  x.font = 'bold 30px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(3.0, 0.75, 1);
  return sprite;
}
const gardenerLabel = makeLabel('Press [N] to join us');
gardenerLabel.position.set(0, 2.4, 0); gardenerLabel.visible = false;
gardener.group.add(gardenerLabel);
const workerLabel = makeLabel('Press [N] to join us');
workerLabel.position.set(0, 2.4, 0); workerLabel.visible = false;
worker.group.add(workerLabel);
gardener.group.userData.label = gardenerLabel;
worker.group.userData.label = workerLabel;

// Pot-offer billboard — exact text as requested
const potOfferLabel = makeLabel('Do you want water pot, take it');
potOfferLabel.position.set(0, 2.4, 0);
potOfferLabel.visible = false;
gardener.group.add(potOfferLabel);

// Thank-you billboards (after feast)
const thanksLabel = makeLabel('Thanks for the delicious meal, friend!');
thanksLabel.position.set(0, 2.5, 0);
thanksLabel.visible = false;
gardener.group.add(thanksLabel);
const thanksLabel2 = makeLabel('Thanks for the delicious meal, friend!');
thanksLabel2.position.set(0, 2.5, 0);
thanksLabel2.visible = false;
worker.group.add(thanksLabel2);

/* ============================================================
   STATE
============================================================ */
let holdingPot = false;
let gardenerHasPot = true;
let gardenerDialogActive = false;

let hasRod = false;
let fishingState = 'idle';
let biteTimer = 0;
let biteWindow = 0;
let caughtFish = 0;
let bobberBaseY = 0;
let lineCastDelay = 0;

let grillState = 'idle';
let grillCookTimer = 0;
const grillFishList = [];
const RAW_FISH_COLOR    = new THREE.Color(0xc8c8d0);
const COOKED_FISH_COLOR = new THREE.Color(0x8a3a10);

let bloomLevel = 0;

let mouseDown = false;

/* ============================================================
   UI + MENU
============================================================ */
const keys = {};
document.addEventListener('keydown', e => { if(e.target.matches('input,select,textarea')) return; keys[e.code] = true; if(isPlaying() && ['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault(); });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

const mDay = document.getElementById('mDay'), mDayV = document.getElementById('mDayV');
const mFog = document.getElementById('mFog'), mFogV = document.getElementById('mFogV');
const mVol = document.getElementById('mVol'), mVolV = document.getElementById('mVolV');
const mSeasMode = document.getElementById('mSeasMode');
const mSeasRow = document.getElementById('mSeasRow');
const mSeas = document.getElementById('mSeas'), mSeasV = document.getElementById('mSeasV');

mDay.addEventListener('input', () => { dayPeriod = parseFloat(mDay.value); mDayV.textContent = dayPeriod + 's'; });
mFog.addEventListener('input', () => { fogDensity = parseFloat(mFog.value); scene.fog.density = fogDensity; mFogV.textContent = fogDensity.toFixed(4); });
mVol.addEventListener('input', () => {
  masterVolume = parseFloat(mVol.value); mVolV.textContent = masterVolume.toFixed(2);
  if(!muted){
    if(ambientSound.buffer) ambientSound.setVolume(0.35*masterVolume);
    if(riverAudio.buffer) riverAudio.setVolume(1.6*masterVolume);
    if(fireAudio.buffer) fireAudio.setVolume(2.5*masterVolume);
  }
});
mSeasMode.addEventListener('change', () => {
  seasonMode = mSeasMode.value;
  mSeasRow.style.display = seasonMode === 'manual' ? 'flex' : 'none';
});
mSeas.addEventListener('input', () => {
  manualSeason = parseFloat(mSeas.value);
  mSeasV.textContent = SEASONS[Math.floor(manualSeason) % 4];
});

function openMenu(){
  menuOpen = true; clearInput(); menu.classList.remove('hidden'); overlay.classList.add('hidden'); document.body.classList.remove('landing');
  if(controls.isLocked) controls.unlock();
}
function closeMenu(){
  menuOpen = false; menu.classList.add('hidden');
  requestPlay();
}
document.getElementById('mResume').addEventListener('click', closeMenu);

document.addEventListener('keydown', e => {
  if(e.code === 'Tab'){ e.preventDefault(); if(menuOpen) closeMenu(); else openMenu(); }
  if(e.code === 'Escape' && menuOpen) closeMenu();
});
document.getElementById('cur').addEventListener('click', e => { e.currentTarget.blur(); if(menuOpen) closeMenu(); else openMenu(); });
document.getElementById('tg').addEventListener('click', e => { grid.visible = !grid.visible; e.currentTarget.blur(); });
document.getElementById('tp').addEventListener('click', e => {
  timePaused = !timePaused;
  e.currentTarget.textContent = timePaused ? 'Resume time' : 'Pause time';
  e.currentTarget.blur();
});

const toastEl = document.getElementById('toast');
let toastT = null;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  if(toastT) clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.style.opacity = '0'; }, 2500);
}

// Large bite popup
const bitePopupEl = document.getElementById('bitePopup');
function showBitePopup(){
  bitePopupEl.innerHTML = '🐟 A fish took the bite!<span class="sub">Press [I] to pull it in!</span>';
  bitePopupEl.classList.add('show');
}
function hideBitePopup(){
  bitePopupEl.classList.remove('show');
}

document.getElementById('tel').addEventListener('click', e => {
  e.currentTarget.blur();
  standUp();
  const pp = camera.position;
  for(let i=0;i<40;i++){
    const x = (Math.random()-0.5) * (GROUND_SIZE-100);
    const z = (Math.random()-0.5) * (GROUND_SIZE-100);
    const h = terrainH(x, z);
    if(h < 1 || h > 50 || inWater(x, z) || collidesAt(x,terrainHCached(x,z)+EYE,z)) continue;
    pp.set(x, terrainHCached(x,z) + EYE, z);
    verticalVelocity = 0;
    toast('Teleported!');
    return;
  }
});
document.addEventListener('keydown', e => { if(e.code === 'KeyF' && !e.repeat) document.getElementById('tel').click(); });

/* ============================================================
   NEW INPUT — P (pot), O (rod), I (reel), Shift+O (grill), LMB (pour/cast)
============================================================ */
document.addEventListener('keydown', e => {
  if(!isPlaying()) return;

  // P — water pot toggle
  if(e.code === 'KeyP' && !e.repeat){
    if(holdingPot){
      holdingPot = false;
      gardenerHasPot = true;
      playerPot.visible = false;
      wateringCan.visible = false;
      toast('You returned the water pot to the gardener.');
    } else if(gardenerDialogActive && gardenerHasPot && !hasRod){
      holdingPot = true;
      gardenerHasPot = false;
      wateringCan.visible = false;
      playerPot.visible = true;
      toast('You took the water pot. Hold Left-click to pour.');
    }
  }

  // O — rod toggle / Shift+O — grill
  if(e.code === 'KeyO' && !e.repeat){
    if(e.shiftKey){
      e.preventDefault();
      tryGrillFish();
    } else {
      if(hasRod){
        hasRod = false;
        fishingRod.visible = false;
        bobber.visible = false;
        fishingState = 'idle';
        hideBitePopup();
        toast('Rod stowed. Fish bag: ' + caughtFish);
      } else if(!holdingPot){
        const pp = camera.position;
        const nearRiver = dR(pp.x, pp.z) < RH + 6 || dR2(pp.x, pp.z) < RH2 + 6;
        const nearPond  = dP(pp.x, pp.z) < POND.r + 6;
        if(nearRiver || nearPond){
          hasRod = true;
          fishingRod.visible = true;
          toast('Fishing rod ready. Left-click to cast.');
        } else {
          toast('You need to be near the Pond or River.');
        }
      }
    }
  }

  // I — reel in the fish (only during bite window)
  if(e.code === 'KeyI' && !e.repeat){
    if(fishingState === 'bite' && biteWindow > 0){
      caughtFish++;
      document.getElementById('bagCount').textContent = caughtFish;
      fishingState = 'idle';
      bobber.visible = false;
      hideBitePopup();
      toast('Caught a fish! Total in bag: ' + caughtFish);
      showCaughtFish();
    }
  }
});

document.addEventListener('mousedown', e => {
  if(e.button !== 0) return;
  if(!isPlaying()) return;
  mouseDown = true;
  if(hasRod && fishingState === 'idle'){
    castLine();
  }
});
document.addEventListener('mouseup', e => { if(e.button === 0) mouseDown = false; });

/* ----------------------------------------------------------
   FISHING actions
---------------------------------------------------------- */
function castLine(){

  const pp = camera.position;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  forward.y = 0; forward.normalize();
  const targetPos = pp.clone().add(forward.multiplyScalar(5.5));
  if(!inWater(targetPos.x,targetPos.z)){toast('Face the water before casting.');return;}
  fishingState='casting';lineCastDelay=.35+Math.random()*.35;
  targetPos.y = (dP(targetPos.x, targetPos.z) < POND.r) ? POND.wy : RL + 0.05;
  bobber.position.copy(targetPos);
  bobber.position.y = targetPos.y + 1.2;
  bobberBaseY = targetPos.y;
  bobber.visible = true;
  toast('Casting line...');
}

let caughtFishMesh = null;
function showCaughtFish(){
  if(caughtFishMesh){
    camera.remove(caughtFishMesh);
    caughtFishMesh = null;
  }
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, roughness: 0.4, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat);
  body.scale.set(2.0, 1.0, 0.7);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.08, 6), mat);
  tail.rotation.z = Math.PI/2;
  tail.position.x = -0.16;
  g.add(tail);
  g.position.set(0.28, -0.35, -0.9);
  g.rotation.z = 0.5;
  camera.add(g);
  caughtFishMesh = g;
  setTimeout(() => {
    if(caughtFishMesh === g){
      camera.remove(g);
      caughtFishMesh = null;
    }
  }, 1600);
}

/* ----------------------------------------------------------
   GRILL
---------------------------------------------------------- */
function tryGrillFish(){
  if(grillState !== 'idle'){ toast('Grill already in use.'); return; }
  if(caughtFish <= 0){ toast('You have no fish in your bag.'); return; }
  const pp = camera.position;
  const dist = Math.hypot(pp.x - CAMPFIRE_POS.x, pp.z - CAMPFIRE_POS.z);
  if(dist > 3.0){ toast('Get closer to the campfire to grill.'); return; }
  const nightish = _lastElev < DAY_THRESHOLD;
  if(!nightish){ toast('Grilling is a nighttime feast. Wait for dusk.'); return; }

  const n = Math.min(6, caughtFish);
  for(let i = 0; i < n; i++){
    const fish = makeGrillFish();
    const row = Math.floor(i / 3);
    const col = i % 3;
    fish.position.set((col - 1) * 0.4, 0.08, (row - 0.5) * 0.35);
    grillGroup.add(fish);
    grillFishList.push({ mesh: fish, mat: fish.userData.mat });
  }
  caughtFish -= n;
  document.getElementById('bagCount').textContent = caughtFish;
  grillState = 'cooking';
  grillCookTimer = 6.0;
  toast(`Grilling ${n} fish... 6 seconds`);
}

function makeGrillFish(){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, roughness: 0.5, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat);
  body.scale.set(2.0, 1.0, 0.65);
  body.castShadow = true;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 6), mat);
  tail.rotation.z = Math.PI/2;
  tail.position.x = -0.13;
  g.add(tail);
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), new THREE.MeshStandardMaterial({ color: 0x000000 }));
  eye1.position.set(0.08, 0.02, 0.03);
  g.add(eye1);
  const eye2 = eye1.clone(); eye2.position.z = -0.03; g.add(eye2);
  g.userData.mat = mat;
  return g;
}

/* ============================================================
   COLLISION
============================================================ */
const PLAYER_HALF = new THREE.Vector3(0.32, 0.85, 0.32);
const _playerBox = new THREE.Box3();
function collidesAt(x, y, z){
  const cy = y - EYE + PLAYER_HALF.y;
  _playerBox.min.set(x - PLAYER_HALF.x, cy - PLAYER_HALF.y, z - PLAYER_HALF.z);
  _playerBox.max.set(x + PLAYER_HALF.x, cy + PLAYER_HALF.y, z + PLAYER_HALF.z);
  for(let i=0;i<worldColliders.length;i++){
    if(_playerBox.intersectsBox(worldColliders[i].box)) return true;
  }
  for(let i=0;i<houseColliders.length;i++){
    const c = houseColliders[i];
    const dx = x - c.cx, dz = z - c.cz;
    const co = Math.cos(c.rot), si = Math.sin(c.rot);
    const lx = dx*co - dz*si;
    const lz = dx*si + dz*co;
    const ly = cy - c.baseY;
    if(Math.abs(lx - c.lx) < PLAYER_HALF.x + c.sx/2 &&
       Math.abs(ly - c.ly) < PLAYER_HALF.y + c.sy/2 &&
       Math.abs(lz - c.lz) < PLAYER_HALF.z + c.sz/2){
      return true;
    }
  }
  return false;
}

/* ============================================================
   COMPASS + MINIMAP
============================================================ */
const compassEl = document.getElementById('compass');
const cardEls = { N: document.getElementById('cN'), E: document.getElementById('cE'), S: document.getElementById('cS'), W: document.getElementById('cW') };
const CB = { N:0, E:90, S:180, W:270 };
const CWc = 520, HF = 100;
function mkPOI(name, color){ const el = document.createElement('div'); el.className='poi'; el.style.color=color; el.textContent=name; compassEl.appendChild(el); return el; }
const pRiver  = mkPOI('River',  '#6ec8ff');
const pHouse1 = mkPOI('House',  '#ffcc80');
const pHouse2 = mkPOI('House2', '#ffcc80');
const pCamp   = mkPOI('Fire',   '#ff8030');
const pGarden = mkPOI('Garden', '#a0ff80');
const pPond   = mkPOI('Pond',   '#4ac8ff');

function norm180(d){ while(d > 180) d -= 360; while(d < -180) d += 360; return d; }
function upCompass(yaw){
  const head = ((-yaw*180/Math.PI) % 360 + 360) % 360;
  for(const k in cardEls){
    const el = cardEls[k], diff = norm180(CB[k] - head);
    if(Math.abs(diff) > HF){ el.style.display = 'none'; continue; }
    el.style.display = 'block';
    el.style.left = `${CWc/2 + (diff/HF)*(CWc/2)}px`;
    el.style.transform = 'translate(-50%,-50%)';
  }
  const p = camera.position;
  function place(el, tx, tz, name){
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    const brg = ((Math.atan2(dx, -dz)*180/Math.PI) % 360 + 360) % 360;
    const diff = norm180(brg - head);
    const off = Math.abs(diff) > HF;
    const u = off ? (diff > 0 ? HF : -HF) : diff;
    el.style.display = 'block';
    el.style.left = `${CWc/2 + (u/HF)*(CWc/2)}px`;
    el.textContent = off ? (diff > 0 ? '▶ ' : '◀ ') + name[0] + Math.round(dist) : `${name} ${Math.round(dist)}m`;
  }
  place(pRiver,  p.x, riverZ(p.x), 'River');
  place(pHouse1, HOUSE.x, HOUSE.z, 'House');
  place(pHouse2, HOUSE2.x, HOUSE2.z, 'House2');
  place(pCamp,   CAMPFIRE_POS.x, CAMPFIRE_POS.z, 'Fire');
  place(pGarden, GARDEN.x, GARDEN.z, 'Garden');
  place(pPond,   POND.x, POND.z, 'Pond');
}
const biomeLabel = document.getElementById('biomeLabel');

const mm = document.getElementById('minimap');
const mmCtx = mm.getContext('2d');
const MMS = 160;
const mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = MMS;
{
  const c = mmBase.getContext('2d');
  const step = 4;
  for(let py=0;py<MMS;py+=step){
    for(let px=0;px<MMS;px+=step){
      const wx = ((px/MMS) - 0.5) * GROUND_SIZE;
      const wz = ((py/MMS) - 0.5) * GROUND_SIZE;
      const b = dom(biomes(wx, wz));
      const col = BC[b];
      c.fillStyle = `rgb(${col.r*255|0},${col.g*255|0},${col.b*255|0})`;
      c.fillRect(px, py, step, step);
    }
  }
  c.strokeStyle = '#3080d0'; c.lineWidth = 1.5;
  for(const rz of [riverZ, riverZ2]){
    c.beginPath();
    for(let i=0;i<=60;i++){
      const wx = -HALF + (i/60)*GROUND_SIZE;
      const wz = rz(wx);
      const px = ((wx/GROUND_SIZE) + 0.5) * MMS;
      const py = ((wz/GROUND_SIZE) + 0.5) * MMS;
      if(i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
  }
  const ppx = ((POND.x/GROUND_SIZE) + 0.5) * MMS;
  const ppy = ((POND.z/GROUND_SIZE) + 0.5) * MMS;
  c.fillStyle = '#40a0d0';
  c.beginPath(); c.arc(ppx, ppy, POND.r * (MMS/GROUND_SIZE) + 1, 0, Math.PI*2); c.fill();
  for(const H of [HOUSE, HOUSE2]){
    const hx = ((H.x/GROUND_SIZE) + 0.5) * MMS;
    const hy = ((H.z/GROUND_SIZE) + 0.5) * MMS;
    c.fillStyle = '#c85028'; c.fillRect(hx-3, hy-3, 6, 6);
  }
  const gx = ((GARDEN.x/GROUND_SIZE) + 0.5) * MMS;
  const gz = ((GARDEN.z/GROUND_SIZE) + 0.5) * MMS;
  c.fillStyle = '#a0e060'; c.fillRect(gx-3, gz-3, 6, 6);
  const cxf = ((CAMPFIRE_POS.x/GROUND_SIZE) + 0.5) * MMS;
  const czf = ((CAMPFIRE_POS.z/GROUND_SIZE) + 0.5) * MMS;
  c.fillStyle = '#ff8030';
  c.beginPath(); c.arc(cxf, czf, 3, 0, Math.PI*2); c.fill();
}
function upMinimap(yaw){
  mmCtx.clearRect(0, 0, MMS, MMS);
  mmCtx.save();
  mmCtx.beginPath(); mmCtx.arc(MMS/2, MMS/2, MMS/2-3, 0, Math.PI*2); mmCtx.clip();
  mmCtx.drawImage(mmBase, 0, 0);
  const p = camera.position;
  const cx = ((p.x/GROUND_SIZE) + 0.5) * MMS;
  const cy = ((p.z/GROUND_SIZE) + 0.5) * MMS;
  const blink = (Math.sin(performance.now()*0.008) + 1)/2;
  mmCtx.fillStyle = `rgba(255,220,50,${0.5 + blink*0.5})`;
  mmCtx.beginPath(); mmCtx.arc(cx, cy, 3.5, 0, Math.PI*2); mmCtx.fill();
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  mmCtx.strokeStyle = 'rgba(255,220,50,0.9)'; mmCtx.lineWidth = 2;
  mmCtx.beginPath(); mmCtx.moveTo(cx, cy); mmCtx.lineTo(cx + dx*12, cy + dz*12); mmCtx.stroke();
  mmCtx.restore();
}

/* ============================================================
   SEASONS
============================================================ */
const LC = {
  spring: { oak: 0xc8d890, blossom: 0xffb0d0, pine: 0x5a8040 },
  summer: { oak: 0x38581e, blossom: 0x88c060, pine: 0x1f3a14 },
  autumn: { oak: 0xc86018, blossom: 0xa85838, pine: 0x2a4a18 },
  winter: { oak: 0xf0f4ff, blossom: 0xf4f6ff, pine: 0x8aa898 }
};
const BO = { spring: 1, summer: 0.55, autumn: 0.15, winter: 0.05 };
const GT = [new THREE.Color(0xd8e8b0), new THREE.Color(0xffffff), new THREE.Color(0xd8a860), new THREE.Color(0xb8c0cc)];
const SO = [0, 0, 0.05, 0.9];
const lerpC = (a, p) => { const i = Math.floor(p)%4, t = p - i; return a[i].clone().lerp(a[(i+1)%4], t); };
const lerpN = (a, p) => { const i = Math.floor(p)%4, t = p - i; return a[i]*(1-t) + a[(i+1)%4]*t; };
function upTrees(season){
  season = season.toLowerCase();
  const pal = LC[season] || LC.summer;
  oakLeafM.color.setHex(pal.oak);
  blossomLeafM.color.setHex(pal.blossom);
  pineLeafM.color.setHex(pal.pine);
  blossomLeafM.opacity = BO[season] ?? 1;
  if(season === 'winter'){
    const w = new THREE.Color(0xffffff);
    oakLeafM.color.lerp(w, 0.85);
    pineLeafM.color.lerp(w, 0.55);
    blossomLeafM.color.lerp(w, 0.9);
  }
}

/* ============================================================
   TEMP OBJECTS
============================================================ */
const _tmpSunDir = new THREE.Vector3();
const _tmpLightDir = new THREE.Vector3();
const _tmpFogColor = new THREE.Color();
const _tmpFogA = new THREE.Color();
const _tmpFogB = new THREE.Color();
const _tmpSunTint = new THREE.Color();
const _tmpSunTintB = new THREE.Color();
const _tmpEuler = new THREE.Euler();
const _tmpGroundColor = new THREE.Color();
let _lastElev = 1;

function isPlayerSeated(){ return isSitting && sittingChair && sittingChair.owner === 'player'; }

/* ============================================================
   NPC STEP (with eating override)
============================================================ */
function npcStep(npc, delta, now, isNight, opts){
  const seated = opts.seated || isPlayerSeated();
  const isGardener = !!npc.isGardener;

  // Eating overrides everything
  if(npc.eatingTimer > 0){
    npc.eatingTimer -= delta;
    const t = 1 - npc.eatingTimer / 5.0;
    if(npc.currentChair){
      npc.group.position.x = npc.currentChair.x;
      npc.group.position.z = npc.currentChair.z;
      npc.group.position.y = terrainHCached(npc.currentChair.x, npc.currentChair.z) + 0.45 - 0.72;
    }
    npc.legL.rotation.x = -1.45;
    npc.legR.rotation.x = -1.45;
    if(t < 0.2){
      npc.armR.rotation.x = THREE.MathUtils.lerp(-0.3, -1.4, t / 0.2);
      npc.armL.rotation.x = -0.3;
    } else if(t < 0.8){
      const et = (t - 0.2) / 0.6;
      npc.armR.rotation.x = -1.4 + Math.abs(Math.sin(et * Math.PI * 3)) * 0.9;
      npc.armL.rotation.x = -0.3 - Math.abs(Math.sin(et * Math.PI * 3 + 0.5)) * 0.4;
    } else {
      npc.armR.rotation.x = THREE.MathUtils.lerp(-0.5, -0.15, (t - 0.8) / 0.2);
      npc.armL.rotation.x = -0.15;
      const pp = camera.position;
      npc.group.rotation.y = Math.atan2(pp.x - npc.group.position.x, pp.z - npc.group.position.z);
      npc.head.rotation.y = 0;
    }
    if(t >= 1){
      npc.eatingTimer = 0;
      const lbl = isGardener ? thanksLabel : thanksLabel2;
      lbl.visible = true;
      setTimeout(() => { lbl.visible = false; }, 5000);
      npcCallout.textContent = 'Thanks for the delicious meal, friend!';
      npcCallout.style.display = 'block';
      setTimeout(() => { npcCallout.style.display = 'none'; }, 5000);
    }
    return;
  }

  if(isNight && npc.state === 'work'){
    if(!npc.chairClaimed){
      npc.chairClaimed = true;
      let c = npc.currentChair;
      if(!c || (c.occupied && c.owner !== npc)) c = chairs.find(ch => !ch.occupied);
      if(c){ npc.currentChair = c; c.occupied = true; c.owner = npc; }
    }
    if(npc.currentChair){
      npc.targetX = npc.currentChair.x;
      npc.targetZ = npc.currentChair.z;
      npc.state = 'walking';
    }
  }
  if(!isNight && (npc.state === 'walking' || npc.state === 'sitting')){
    if(npc.chairClaimed && npc.currentChair && npc.currentChair.owner === npc){
      npc.currentChair.occupied = false;
      npc.currentChair.owner = null;
    }
    npc.chairClaimed = false;
    npc.targetX = npc.workX;
    npc.targetZ = npc.workZ;
    npc.state = 'walking';
  }

  if(npc.state === 'walking'){
    const dx = npc.targetX - npc.group.position.x;
    const dz = npc.targetZ - npc.group.position.z;
    const dist = Math.hypot(dx, dz);
    if(dist > 0.15){
      const step = Math.min(dist, npc.walkSpeed * delta);
      npc.group.position.x += (dx/dist) * step;
      npc.group.position.z += (dz/dist) * step;
      const targetY = terrainHCached(npc.group.position.x, npc.group.position.z);
      npc.group.position.y = THREE.MathUtils.lerp(npc.group.position.y, targetY, Math.min(1, delta * 5));
      const tYaw = Math.atan2(dx, dz);
      let diff = tYaw - npc.group.rotation.y;
      while(diff > Math.PI) diff -= Math.PI*2;
      while(diff < -Math.PI) diff += Math.PI*2;
      npc.group.rotation.y += diff * Math.min(1, delta * 4);
      npc.walkPhase += delta * 7;
      const swing = Math.sin(npc.walkPhase) * 0.55;
      npc.legL.rotation.x =  swing;
      npc.legR.rotation.x = -swing;
      npc.armL.rotation.x = -swing * 0.7;
      npc.armR.rotation.x =  swing * 0.7;
      npc.armL.rotation.z = 0.15;
      npc.armR.rotation.z = -0.15;
      if(npc.group.userData.label) npc.group.userData.label.visible = false;
      return;
    }
    if(isNight && npc.currentChair) npc.state = 'sitting';
    else {
      npc.state = 'work';
      npc.group.position.x = npc.workX; npc.group.position.z = npc.workZ;
      npc.group.position.y = npc.workY;
    }
  }

  if(npc.state === 'sitting' && npc.currentChair){
    const c = npc.currentChair;
    npc.group.position.x = c.x;
    npc.group.position.z = c.z;
    const seatY = terrainHCached(c.x, c.z) + 0.45;
    npc.group.position.y = seatY - 0.72;
    npc.legL.rotation.x = -1.45;
    npc.legR.rotation.x = -1.45;
    if(seated){
      const fireX = CAMPFIRE_POS.x, fireZ = CAMPFIRE_POS.z;
      npc.group.rotation.y = Math.atan2(fireX - c.x, fireZ - c.z);
      npc.torso.position.y = 1.15 + Math.sin(now * 1.2 + npc.walkPhase) * 0.012;
      npc.head.rotation.y = Math.sin(now * 0.5) * 0.15;
      npc.armL.rotation.x = -0.15;
      npc.armR.rotation.x = -0.15;
      npc.armL.rotation.z = 0.15;
      npc.armR.rotation.z = -0.15;
    } else {
      const pp = camera.position;
      npc.group.rotation.y = Math.atan2(pp.x - c.x, pp.z - c.z);
      npc.torso.position.y = 1.15 + Math.sin(now * 1.5) * 0.01;
      npc.head.rotation.y = 0;
      npc.armL.rotation.x = -0.3;
      npc.armR.rotation.x = -0.3;
      npc.armL.rotation.z = 0.15;
      npc.armR.rotation.z = -0.15;
    }
    if(npc.group.userData.label) npc.group.userData.label.visible = !seated;
    return;
  }

  // WORK / IDLE
  npc.legL.rotation.x = 0;
  npc.legR.rotation.x = 0;
  const pp = camera.position;
  const distToPlayer = Math.hypot(pp.x - npc.group.position.x, pp.z - npc.group.position.z);

  // Gardener pot-dialogue override
  if(isGardener && gardenerDialogActive){
    const dx = pp.x - npc.group.position.x;
    const dz = pp.z - npc.group.position.z;
    npc.group.rotation.y = Math.atan2(dx, dz);
    npc.armL.rotation.x = -0.2;
    npc.armR.rotation.x = -0.5;
    npc.armL.rotation.z = 0.15;
    npc.armR.rotation.z = -0.15;
    npc.head.rotation.y = 0;
    if(npc.group.userData.label) npc.group.userData.label.visible = false;
    return;
  }

  if(distToPlayer < 5){
    const dx = pp.x - npc.group.position.x;
    const dz = pp.z - npc.group.position.z;
    const tYaw = Math.atan2(dx, dz);
    let diff = tYaw - npc.group.rotation.y;
    while(diff > Math.PI) diff -= Math.PI*2;
    while(diff < -Math.PI) diff += Math.PI*2;
    npc.group.rotation.y += diff * Math.min(1, delta * 3);
    npc.armR.rotation.z = -0.15 + Math.sin(now * 10) * 0.85;
    npc.armR.rotation.x = -0.9 + Math.sin(now * 10) * 0.2;
    npc.armL.rotation.x = -0.4;
    npc.armL.rotation.z = 0.15;
    npc.head.rotation.y = 0;
    if(npc.group.userData.label) npc.group.userData.label.visible = false;
  } else {
    if(!isGardener){
      npc.armR.rotation.x = -0.9 + Math.sin(now*1.6)*0.35;
      npc.armR.rotation.z = -0.15;
    }
    npc.armL.rotation.x = -0.4 + Math.sin(now*1.6 + 0.4)*0.15;
    npc.armL.rotation.z = 0.15;
    npc.head.rotation.y = 0;
    let diff = npc.defaultRotY - npc.group.rotation.y;
    while(diff > Math.PI) diff -= Math.PI*2;
    while(diff < -Math.PI) diff += Math.PI*2;
    npc.group.rotation.y += diff * Math.min(1, delta * 2);
    if(npc.group.userData.label) npc.group.userData.label.visible = false;
  }
}

/* ============================================================
   GARDENER WATERING — ballistic to garden centre
============================================================ */
function updateGardenerWatering(now, delta, isNight){
  const pp = camera.position;
  const distToPlayer = Math.hypot(pp.x - gardener.group.position.x, pp.z - gardener.group.position.z);
  const canWater = !isNight
    && gardener.state === 'work'
    && !gardenerDialogActive
    && distToPlayer >= 5
    && gardenerHasPot;

  if(canWater){
    wateringCan.visible = true;
    const tilt = -0.9 + Math.sin(now * 1.4) * 0.06;
    gardener.armR.rotation.x = tilt;
    gardener.armR.rotation.z = -0.05;
    wateringCan.rotation.x = 0.7;

    const nozzleWorld = new THREE.Vector3();
    wateringCan.userData.nozzleMarker.getWorldPosition(nozzleWorld);
    const target = new THREE.Vector3(GARDEN.x, terrainH(GARDEN.x, GARDEN.z) + 0.4, GARDEN.z);
    waterStream.emitBallistic(nozzleWorld, target, 0.85, 'npc');
  } else {
    wateringCan.visible = false;
    wateringCan.rotation.x = 0;
  }
}

function updateWorkerTyping(now){
  if(worker.state === 'work' && worker.eatingTimer <= 0){
    const typeSpeed = 8;
    const liftL = Math.sin(now * typeSpeed) * 0.05;
    const liftR = Math.sin(now * typeSpeed + 1.7) * 0.05;
    worker.armL.rotation.x = -1.15 + liftL;
    worker.armR.rotation.x = -1.15 + liftR;
    worker.armL.rotation.z = 0.35;
    worker.armR.rotation.z = -0.35;
    worker.legL.rotation.x = -1.45;
    worker.legR.rotation.x = -1.45;
    worker.head.rotation.y = Math.sin(now * 0.3) * 0.08;
    worker.head.rotation.x = 0.1;
  }
}

/* ============================================================
   PLAYER POUR
============================================================ */
function updatePlayerPour(delta){
  if(holdingPot && mouseDown){
    playerPot.rotation.z = THREE.MathUtils.lerp(playerPot.rotation.z, -0.6, delta * 8);
    const nozzleWorld = new THREE.Vector3();
    playerPot.userData.nozzleMarker.getWorldPosition(nozzleWorld);
    const pp = camera.position;
    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const target = pp.clone().add(fwd.multiplyScalar(4));
    target.y = terrainHCached(target.x, target.z) + 0.3;
    waterStream.emitBallistic(nozzleWorld, target, 0.85, 'player');
  } else {
    playerPot.rotation.z = THREE.MathUtils.lerp(playerPot.rotation.z, 0, delta * 6);
  }
}

/* ============================================================
   FAST FISHING
============================================================ */
function updateFishing(delta, now){
  if(!hasRod) return;

  if(fishingState === 'casting'){
    lineCastDelay -= delta;
    bobber.position.y = THREE.MathUtils.lerp(bobber.position.y, bobberBaseY, delta * 6);
    if(lineCastDelay <= 0){
      fishingState = 'waiting';
      // VERY FAST bite loop: 1-3 seconds
      biteTimer = 1 + Math.random() * 2;
      toast('Waiting for a bite...');
    }
  } else if(fishingState === 'waiting'){
    bobber.position.y = bobberBaseY + Math.sin(now * 2) * 0.04;
    biteTimer -= delta;
    if(biteTimer <= 0){
      fishingState = 'bite';
      biteWindow = 2.0;
      showBitePopup();
    }
  } else if(fishingState === 'bite'){
    // Sharp bobber tug
    bobber.position.y = bobberBaseY - 0.18 - Math.abs(Math.sin(now * 20)) * 0.14;
    biteWindow -= delta;
    if(biteWindow <= 0){
      fishingState = 'idle';
      bobber.visible = false;
      hideBitePopup();
      toast('The fish got away...');
    }
  }
}

/* ============================================================
   GRILL
============================================================ */
function updateGrill(delta, now){
  if(grillState === 'cooking'){
    grillCookTimer -= delta;
    const t = 1 - grillCookTimer / 6.0;
    for(const f of grillFishList){
      f.mat.color.copy(RAW_FISH_COLOR).lerp(COOKED_FISH_COLOR, Math.min(1, t));
      f.mesh.rotation.y += delta * 0.3;
    }
    if(grillCookTimer <= 0){
      grillState = 'eating';
      grillCookTimer = 1.5;
    }
  } else if(grillState === 'eating'){
    grillCookTimer -= delta;
    if(grillCookTimer <= 0){
      for(const f of grillFishList) grillGroup.remove(f.mesh);
      grillFishList.length = 0;
      grillState = 'idle';
      gardener.eatingTimer = 5.0;
      worker.eatingTimer = 5.0;
    }
  }
}

/* ============================================================
   GARDEN BLOOM
============================================================ */
function updateBloom(delta){
  if(bloomLevel > 0.001){
    for(const f of gardenFlowers) f.scale.setScalar(1 + bloomLevel * 0.45);
    for(const m of gardenPetalMats){
      if(!m.emissive) continue;
      m.emissive.setRGB(0.15, 0.05, 0.15);
      m.emissiveIntensity = bloomLevel * 0.35;
    }
  } else {
    for(const f of gardenFlowers) f.scale.setScalar(1);
    for(const m of gardenPetalMats){
      if(m.emissive) m.emissiveIntensity = 0;
    }
  }
}
waterStream.onGardenHit = () => { bloomLevel = Math.min(1, bloomLevel + 0.15); };

/* ============================================================
   MONKEY AI
============================================================ */
function updateMonkeys(dt, now){
  for(const m of treeMonkeys){
    const tree = m.tree;
    const treeGY = tree.position.y;
    m.timer -= dt;
    switch(m.state){
      case 'perched': {
        m.mesh.position.x = m.homeX + Math.sin(now * 0.5 + m.phase) * 0.15;
        m.mesh.position.z = m.homeZ + Math.cos(now * 0.4 + m.phase) * 0.15;
        m.mesh.position.y = m.baseY + Math.abs(Math.sin(now * 3 + m.phase)) * 0.35;
        m.mesh.rotation.z = Math.sin(now * 1.5 + m.phase) * 0.05;
        m.head.rotation.y = Math.sin(now * 1.5 + m.phase) * 0.9;
        m.head.rotation.x = Math.sin(now * 2.3 + m.phase * 1.2) * 0.3;
        m.tail.rotation.x = -0.6 + Math.sin(now * 1.8 + m.phase) * 0.3;
        m.tail.rotation.z = 0.8 + Math.sin(now * 2 + m.phase) * 0.5;
        m.armL.rotation.x = Math.sin(now * 2 + m.phase) * 0.2;
        m.armR.rotation.x = Math.sin(now * 2 + m.phase + 1) * 0.2;
        if(m.timer <= 0){
          m.state = 'descending'; m.t = 0;
          m.descendStartX = m.mesh.position.x; m.descendStartZ = m.mesh.position.z;
          m.startY = m.mesh.position.y; m.endY = treeGY + 0.5;
        }
        break;
      }
      case 'descending': {
        m.t += dt / 3.5;
        const tt = Math.min(1, m.t);
        const ease = tt*tt*(3-2*tt);
        m.mesh.position.x = THREE.MathUtils.lerp(m.descendStartX, tree.position.x + 0.35, ease);
        m.mesh.position.z = THREE.MathUtils.lerp(m.descendStartZ, tree.position.z + 0.35, ease);
        m.mesh.position.y = THREE.MathUtils.lerp(m.startY, m.endY, ease);
        m.head.rotation.y = 0;
        m.armL.rotation.x = -1.2 + Math.sin(now * 8) * 0.4;
        m.armR.rotation.x = -1.2 + Math.sin(now * 8 + 1.5) * 0.4;
        m.tail.rotation.x = -1.3; m.tail.rotation.z = 0.8;
        m.mesh.rotation.z = Math.sin(now * 6) * 0.04;
        if(tt >= 1){
          m.state = 'crawling';
          m.timer = 4 + Math.random() * 4;
          m.crawlT = 0;
          m.crawlRadius = 1.6 + Math.random() * 2.5;
        }
        break;
      }
      case 'crawling': {
        m.crawlT += dt * 0.5;
        const a = m.crawlT + m.phase;
        const cx = tree.position.x + Math.cos(a) * m.crawlRadius;
        const cz = tree.position.z + Math.sin(a * 1.3 + m.phase) * m.crawlRadius;
        const cy = terrainHCached(cx, cz);
        m.mesh.position.set(cx, cy + 0.35, cz);
        const nextX = tree.position.x + Math.cos(a + 0.1) * m.crawlRadius;
        const nextZ = tree.position.z + Math.sin((a + 0.1) * 1.3 + m.phase) * m.crawlRadius;
        m.mesh.rotation.y = Math.atan2(nextX - cx, nextZ - cz);
        m.head.rotation.y = Math.sin(now * 3 + m.phase) * 0.5;
        m.head.rotation.x = Math.sin(now * 4 + m.phase) * 0.15;
        m.tail.rotation.x = -0.8 + Math.sin(now * 3 + m.phase) * 0.3;
        m.tail.rotation.z = Math.sin(now * 4 + m.phase) * 0.4;
        m.armL.rotation.x = -0.6 + Math.sin(now * 6 + m.phase) * 0.4;
        m.armR.rotation.x = -0.6 + Math.sin(now * 6 + m.phase + Math.PI) * 0.4;
        if(m.timer <= 0){
          m.state = 'ascending'; m.t = 0;
          m.ascendStartX = m.mesh.position.x; m.ascendStartZ = m.mesh.position.z;
          m.startY = m.mesh.position.y; m.endY = m.baseY;
        }
        break;
      }
      case 'ascending': {
        m.t += dt / 3.5;
        const ta = Math.min(1, m.t);
        const easeA = ta*ta*(3-2*ta);
        m.mesh.position.x = THREE.MathUtils.lerp(m.ascendStartX, m.homeX, easeA);
        m.mesh.position.z = THREE.MathUtils.lerp(m.ascendStartZ, m.homeZ, easeA);
        m.mesh.position.y = THREE.MathUtils.lerp(m.startY, m.endY, easeA);
        m.armL.rotation.x = -1.2 + Math.sin(now * 8) * 0.4;
        m.armR.rotation.x = -1.2 + Math.sin(now * 8 + 1.5) * 0.4;
        m.tail.rotation.x = -1.3; m.tail.rotation.z = 0.8;
        m.head.rotation.y = 0;
        m.mesh.rotation.z = Math.sin(now * 6) * 0.04;
        if(ta >= 1){ m.state = 'perched'; m.timer = 12 + Math.random() * 15; }
        break;
      }
    }
  }
}

/* ============================================================
   NPC CALLOUT
============================================================ */
const npcCallout = document.getElementById('npcCallout');
let calloutShown = false;
const DAY_THRESHOLD = 0.05;

/* ============================================================
   MAIN LOOP
============================================================ */
const clock = new THREE.Clock();
let verticalVelocity = 0;
let grounded = true;
let frameCount = 0;

function animate(){
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const now = performance.now() * 0.001;
  frameCount++;

  // Time
  if(!timePaused && started && !menuOpen){
    sunAngle += delta * (Math.PI * 2 / dayPeriod);
    if(sunAngle > Math.PI * 2) sunAngle -= Math.PI * 2;
    if(seasonMode === 'auto') yearPhase = (yearPhase + delta / yearPeriod) % 1;
    else yearPhase = manualSeason / 4;
  }

  // Wind
  const windAmp = 0.035 + Math.sin(now*0.3)*0.02;
  for(let i=0;i<swayTrees.length;i+=6){
    const t = swayTrees[i];
    t.obj.rotation.z = Math.sin(now*1.5 + t.phase) * windAmp;
    t.obj.rotation.x = Math.cos(now*1.2 + t.phase*1.3) * windAmp * 0.6;
  }

  // Sun
  const seasonSin = Math.sin(yearPhase * Math.PI * 2 - Math.PI/2);
  const tilt = SUN_TILT - seasonSin * Math.PI * 0.08;
  skyRoot.rotation.x = -tilt;
  celGrp.rotation.z = sunAngle;
  const cT = Math.cos(tilt), sT = Math.sin(tilt);
  _tmpSunDir.set(Math.cos(sunAngle), Math.sin(sunAngle)*cT, -Math.sin(sunAngle)*sT).normalize();
  skyU.sunPosition.value.copy(_tmpSunDir);
  const elev = _tmpSunDir.y;
  _lastElev = elev;
  const seasonPh = yearPhase * 4;
  const season = seasonOf(seasonPh);

  // Fog
  if(elev > 0.35) _tmpFogColor.setHex(0x9fc8e8);
  else if(elev > 0.05){
    const t = (elev - 0.05)/0.30;
    _tmpFogA.setHex(0xf0a050); _tmpFogB.setHex(0x9fc8e8);
    _tmpFogColor.copy(_tmpFogA).lerp(_tmpFogB, t);
  } else if(elev > -0.15){
    const t = (elev + 0.15)/0.20;
    _tmpFogA.setHex(0x2a1a3a); _tmpFogB.setHex(0xf0a050);
    _tmpFogColor.copy(_tmpFogA).lerp(_tmpFogB, t);
  } else {
    const t = THREE.MathUtils.clamp((elev + 0.6)/0.45, 0, 1);
    _tmpFogA.setHex(0x050510); _tmpFogB.setHex(0x2a1a3a);
    _tmpFogColor.copy(_tmpFogA).lerp(_tmpFogB, t);
  }
  _tmpFogColor.lerp(new THREE.Color(elev>0?'#809392':'#101d29'), rainAmount*.84);
  scene.fog.color.copy(_tmpFogColor);
  scene.background=scene.fog.color;
  sky.visible=rainAmount<.35;
  scene.fog.density = fogDensity;

  // Lights
  const pp = camera.position;
  const horiz = Math.hypot(_tmpSunDir.x, _tmpSunDir.z);
  const minY = Math.max(0.001, horiz * 0.25);
  _tmpLightDir.set(_tmpSunDir.x, Math.max(minY, _tmpSunDir.y), _tmpSunDir.z).normalize();
  sunLight.position.copy(_tmpLightDir).multiplyScalar(200).add(pp);
  sunLight.target.position.set(pp.x, 0, pp.z);
  sunLight.target.updateMatrixWorld();
  sunLight.intensity = (Math.max(0,elev)*3+.15)*(1-rainAmount*.55);
  const horizonF = Math.max(0, 1 - Math.abs(elev) * 3.5);
  _tmpSunTint.setHex(0xfff4d4); _tmpSunTintB.setHex(0xff5a1a);
  _tmpSunTint.lerp(_tmpSunTintB, horizonF);
  sunLight.color.copy(_tmpSunTint).lerp(new THREE.Color('#d2e4e2'),rainAmount*.8);
  sunMesh.material.color.copy(_tmpSunTint);
  sunHalo.material.color.copy(_tmpSunTint);

  const moonUp = Math.max(0, -elev);
  moonLight.intensity = moonUp * 0.5;
  moonLight.position.copy(_tmpSunDir).multiplyScalar(-200).add(pp);
  moonLight.target.position.set(pp.x, 0, pp.z);
  moonLight.target.updateMatrixWorld();

  hemi.intensity = .8 + Math.max(0,elev)*2.2 + moonUp*.2;
  ambient.intensity = .36 + Math.max(0,elev)*.6 + moonUp*.10;
  const nightF = THREE.MathUtils.clamp(-elev * 1.8, 0, 1);
  bgStarMat.opacity = nightF;
  csM.opacity = nightF;
  clM.opacity = nightF * 0.9;
  moonHalo.material.opacity = moonUp * 0.6;

  upTrees(season);
  _tmpGroundColor.copy(lerpC(GT, seasonPh));
  groundMat.color.copy(_tmpGroundColor);
  snowMat.opacity = lerpN(SO, seasonPh);

  waterTexture.offset.x += delta * 0.06;
  waterTexture.offset.y += delta * 0.005;

  // Cabin doors
  for(const cab of [cabin1, cabin2]){
    if(!cab.slideL || !cab.slideR) continue;
    const doorWorld = new THREE.Vector3();
    cab.slideL.getWorldPosition(doorWorld);
    const dist = doorWorld.distanceTo(pp);
    const target = dist < 4.5 ? 1 : 0;
    cab._doorBlend = cab._doorBlend ?? 0;
    cab._doorBlend += (target - cab._doorBlend) * Math.min(1, delta * 4);
    const slideAmt = 1.05 * cab._doorBlend;
    cab.slideL.position.x = -0.85 - slideAmt;
    cab.slideR.position.x =  0.85 + slideAmt;
  }

  // Interior light cull
  for(const cab of cabinInstances){
    const dist = Math.hypot(pp.x - cab.worldX, pp.z - cab.worldZ);
    const on = dist < 45;
    for(const l of cab.lights) l.visible = on;
  }

  // Torch + campfire flicker
  if(torchOn){
    torchSpot.intensity  = 12 + Math.random() * 6 + Math.sin(now * 18) * 1.2;
    torchPoint.intensity = 4 + Math.random() * 2.5;
  }
  if(campfireLight){
    campfireLight.intensity = 3.5 + Math.random() * 2.5 + Math.sin(now * 10) * 0.8;
  }

  // Particles
  torchFlame.update(delta, now);
  campfireFlame.update(delta, now);
  waterStream.update(delta);

  // Monkeys
  updateMonkeys(delta, now);

  // NPCs
  const isDay = elev > DAY_THRESHOLD;
  const isNight = !isDay;
  const playerSeated = isPlayerSeated();

  const gd2 = Math.hypot(pp.x - gardener.group.position.x, pp.z - gardener.group.position.z);
  gardenerDialogActive = isDay && gd2 < 2.0 && gardenerHasPot && gardener.eatingTimer <= 0;

  const gDist = gd2;
  const wDist = Math.hypot(pp.x - worker.group.position.x, pp.z - worker.group.position.z);

  if(gDist < 60){
    npcStep(gardener, delta, now, isNight, { seated: playerSeated });
    updateGardenerWatering(now, delta, isNight);
  } else if(gardener.state === 'walking'){
    if(frameCount % 3 === 0) npcStep(gardener, delta * 3, now, isNight, { seated: playerSeated });
  }

  if(wDist < 60){
    npcStep(worker, delta, now, isNight, { seated: playerSeated });
    updateWorkerTyping(now);
  } else if(worker.state === 'walking'){
    if(frameCount % 3 === 0) npcStep(worker, delta * 3, now, isNight, { seated: playerSeated });
  }

  // Pot offer billboard
  potOfferLabel.visible = gardenerDialogActive;

  // Callout
  if(isNight && !playerSeated && !calloutShown && gardener.eatingTimer <= 0 && worker.eatingTimer <= 0){
    if(Math.min(gDist, wDist) < 10){
      calloutShown = true;
      npcCallout.textContent = 'Hey friend, come join us by the fire! Press [N] to sit.';
      npcCallout.style.display = 'block';
      setTimeout(() => { npcCallout.style.display = 'none'; calloutShown = false; }, 6000);
    }
  }
  if(playerSeated) npcCallout.style.display = 'none';

  // New systems
  updatePlayerPour(delta);
  updateFishing(delta, now);
  updateGrill(delta, now);
  bloomLevel = Math.max(0, bloomLevel - delta * 0.35);
  updateBloom(delta);

  // Movement
  if(isPlaying() && !isSitting){
    const inW = inWater(pp.x, pp.z);
    const sprinting = (keys['ShiftLeft'] || keys['ShiftRight']);
    const spd = (inW ? 0.4 : 1) * (sprinting ? 2.5 : 1);
    const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const str = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    const mv = new THREE.Vector3(str, 0, fwd);
    if(mv.lengthSq() > 0) mv.normalize();
    mv.multiplyScalar(WALK * spd * delta);

    const startX = pp.x, startZ = pp.z;
    controls.moveRight(mv.x);
    controls.moveForward(mv.z);
    const ddx = pp.x - startX, ddz = pp.z - startZ;

    if(collidesAt(pp.x, pp.y, pp.z)){
      pp.x = startX + ddx; pp.z = startZ;
      if(collidesAt(pp.x, pp.y, pp.z)){
        pp.x = startX; pp.z = startZ + ddz;
        if(collidesAt(pp.x, pp.y, pp.z)){ pp.x = startX; pp.z = startZ; }
      }
    }

    if(grounded && keys['Space']){ verticalVelocity = JUMP; grounded = false; }
    verticalVelocity -= GRAV * delta;
    pp.y += verticalVelocity * delta;

    const terrainY = terrainHCached(pp.x, pp.z);
    const cabinY   = floorHeightAt(pp.x, pp.z, pp.y);
    const groundY  = Math.max(terrainY, cabinY) + EYE;

    if(pp.y <= groundY){ pp.y = groundY; verticalVelocity = 0; grounded = true; }
    const half = GROUND_SIZE / 2 - 5;
    pp.x = Math.max(-half, Math.min(half, pp.x));
    pp.z = Math.max(-half, Math.min(half, pp.z));
  }

  const bodyGroundY = Math.max(terrainHCached(pp.x, pp.z), floorHeightAt(pp.x, pp.z, pp.y));
  bodyMesh.position.set(pp.x, bodyGroundY + 0.85, pp.z);

  if(!isSitting){
    const c = findNearestEmptyChair(pp.x, pp.z, 2.5);
    if(c) sitPrompt.style.display = 'block';
    else sitPrompt.style.display = 'none';
  }

  // HUD
  _tmpEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  upCompass(_tmpEuler.y);
  biomeLabel.textContent = dom(biomes(pp.x, pp.z)).toUpperCase();
  const totH = ((sunAngle / (Math.PI * 2)) * 24 + 6) % 24;
  const hh = Math.floor(totH), mm = Math.floor((totH - hh)*60);
  document.getElementById('clock').innerHTML = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}<br>Day ${Math.floor(yearPhase*365)+1}`;

  upMinimap(_tmpEuler.y);
  skyRoot.position.set(pp.x, 0, pp.z);

  // First-frame shadow allocation must run before mapped materials compile.
  renderer.shadowMap.autoUpdate = true;
  torchSpot.castShadow=torchOn;
  realism.update(delta,now,seasonPh,Math.max(0,elev),rainAmount);
  updateFieldHUD(now,season);
  if(!(location.search.includes('test=1')&&window.__testSkipRender))renderer.render(scene,camera);
}
const realism=enhanceWorld({THREE,scene,camera,renderer,pbr,terrainH:terrainHCached,inWater,registerCollider,treeGroup,oakLeafM,pineLeafM,barkM,waterMat,waterTexture,house:HOUSE,house2:HOUSE2,pond:POND,garden:GARDEN,camp:CAMPFIRE_POS});

// Integration layer: original simulation systems above remain the source of truth.
let rainAmount=.85, lastHud=0, lastSave=0, quiet=false;
function isPlaying(){return started&&!menuOpen&&overlay.classList.contains('hidden')&&(controls.isLocked||fallbackMode);}
function clearInput(){for(const key in keys)keys[key]=false;mouseDown=false;}
function requestPlay(){
  started=true;menuOpen=false;menu.classList.add('hidden');overlay.classList.add('hidden');document.body.classList.remove('landing');resumeAudio();
  try{const result=controls.lock();result?.catch(enableFallback);}catch{enableFallback();}
}
function enableFallback(){fallbackMode=true;toast('Mouse capture blocked: drag to look. WASD still moves; click casts / pours.');}
document.addEventListener('pointerlockerror',enableFallback);
let drag=false,dragX=0,dragY=0;
renderer.domElement.addEventListener('pointerdown',e=>{if(fallbackMode&&isPlaying()){drag=true;dragX=e.clientX;dragY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointerup',()=>drag=false);
renderer.domElement.addEventListener('pointermove',e=>{if(!drag||controls.isLocked)return;const rotation=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');rotation.y-=(e.clientX-dragX)*.002*controls.pointerSpeed;rotation.x=THREE.MathUtils.clamp(rotation.x-(e.clientY-dragY)*.002*controls.pointerSpeed,-1.45,1.45);camera.quaternion.setFromEuler(rotation);dragX=e.clientX;dragY=e.clientY;});
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea'))return;
  if(e.code==='KeyH'&&!e.repeat){quiet=!quiet;document.body.classList.toggle('quiet',quiet);if(quiet)toast('Quiet view · H brings the interface back');}
  if(e.code==='KeyG'&&!e.repeat){openMenu();document.getElementById('controlsGuide').open=true;}
  if(e.code==='Escape'){quiet=false;document.body.classList.remove('quiet');if(fallbackMode&&!menuOpen){overlay.classList.remove('hidden');document.body.classList.add('landing');clearInput();}}
});
document.getElementById('guideButton').onclick=e=>{e.stopPropagation();openMenu();document.getElementById('controlsGuide').open=true;};
document.getElementById('settingsClose').onclick=()=>{menu.classList.add('hidden');menuOpen=false;overlay.classList.remove('hidden');document.body.classList.add('landing');};
document.getElementById('mSensitivity').oninput=e=>controls.pointerSpeed=Number(e.target.value);
document.getElementById('mRain').oninput=e=>{rainAmount=Number(e.target.value);document.getElementById('mRainV').textContent=Math.round(rainAmount*100)+'%';};
document.getElementById('mQuality').onchange=e=>{renderer.setPixelRatio(Math.min(devicePixelRatio,Number(e.target.value)));sunLight.shadow.mapSize.set(Number(e.target.value)<1?1024:2048,Number(e.target.value)<1?1024:2048);sunLight.shadow.map?.dispose();sunLight.shadow.map=null;};
document.getElementById('mTime').oninput=e=>{sunAngle=((Number(e.target.value)-6+24)%24)/24*Math.PI*2;document.getElementById('mTimeV').textContent=Number(e.target.value).toFixed(1)+'h';};
mSeas.oninput=()=>{manualSeason=Number(mSeas.value);yearPhase=manualSeason/4;mSeasV.textContent=SEASONS[Math.floor(manualSeason)%4];};
document.getElementById('fullScreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is not allowed in this preview.');}};
document.getElementById('quietButton').onclick=()=>{quiet=!quiet;document.body.classList.toggle('quiet',quiet);if(quiet)toast('Quiet view · Press H to restore the interface');};
document.getElementById('minimap').onclick=()=>document.getElementById('mapPanel').classList.toggle('expanded');
function standUp(){if(sittingChair){sittingChair.occupied=false;sittingChair.owner=null;sittingChair=null;}isSitting=false;}
function travel(x,z){
  standUp();clearInput();hasRod=false;fishingRod.visible=false;fishingState='idle';bobber.visible=false;hideBitePopup();
  for(let i=0;i<20;i++){const nx=x+(i?Math.sin(i)*i*.4:0),nz=z+(i?Math.cos(i)*i*.4:0),y=terrainHCached(nx,nz)+EYE;if(!inWater(nx,nz)&&!collidesAt(nx,y,nz)){camera.position.set(nx,y,nz);verticalVelocity=0;grounded=true;return true;}}
  toast('That spot is obstructed. Try another destination.');return false;
}
const destinations={camp:[100,24],pond:[45,76],garden:[63,29],cabin:[80,-25],workshop:[130,-25],trailhead:[94,44]};
document.querySelectorAll('[data-travel]').forEach(button=>button.onclick=()=>{const key=button.dataset.travel;if(travel(...destinations[key])){const target=key==='pond'?POND:key==='garden'?GARDEN:key==='camp'?CAMPFIRE_POS:key==='workshop'?HOUSE2:HOUSE;camera.lookAt(target.x,terrainHCached(target.x,target.z)+1,target.z);toast('Arrived at '+button.textContent.trim()+'. Resume to explore.');}});
function updateFieldHUD(now,season){
  if(now-lastHud<.15)return;lastHud=now;
  document.getElementById('seasonLabel').textContent=season;
  document.getElementById('weatherLabel').textContent=rainAmount>.25?'STEADY RAIN':'CLEARING SKIES';
  document.getElementById('equipmentLabel').textContent=holdingPot?'Watering pot':hasRod?'Fishing rod':torchOn?'Torch lit':'Hands free';
  const p=camera.position,nearPond=dP(p.x,p.z)<POND.r+6,nearRiver=dR(p.x,p.z)<RH+6||dR2(p.x,p.z)<RH2+6;
  let hint='Follow the compass to the pond, garden, cabins or fire.';
  if(isSitting)hint='N · Stand up   /   Stay awhile and watch the fire.';
  else if(holdingPot)hint='HOLD CLICK · Pour onto the flower bed   /   P · Return pot';
  else if(gardenerDialogActive&&!hasRod)hint='P · Borrow the gardener’s watering pot';
  else if(fishingState==='bite')hint='I · Reel now!';
  else if(hasRod)hint=fishingState==='idle'?'CLICK · Cast your line toward the water   /   O · Stow rod':'Watch the float. Press I when a fish bites.';
  else if(nearPond||nearRiver)hint='O · Equip your fishing rod   /   Face the water';
  else if(Math.hypot(p.x-100,p.z-20)<6)hint=_lastElev<DAY_THRESHOLD?'N · Sit   /   SHIFT + O · Grill your catch':'N · Sit by the fire   /   Grilling begins at dusk';
  document.getElementById('contextHint').textContent=hint;
  document.getElementById('grillStatus').textContent=grillState==='idle'?'Ready at dusk':grillState==='cooking'?'Cooking · '+Math.ceil(grillCookTimer)+'s':'Sharing the meal';
  document.getElementById('clock').setAttribute('title',season+' · '+(timePaused?'Time paused':'Time is passing'));
  if(now-lastSave>4){lastSave=now;saveProgress();}
}
function saveProgress(){if(location.search.includes('test=1'))return;try{localStorage.setItem('everwild-sim-save',JSON.stringify({fish:caughtFish,dayPeriod,fogDensity,masterVolume,seasonMode,manualSeason,rainAmount}));}catch{}}
try{if(!location.search.includes('test=1')){const save=JSON.parse(localStorage.getItem('everwild-sim-save')||'null');if(save){caughtFish=Math.max(0,Number(save.fish)||0);document.getElementById('bagCount').textContent=caughtFish;}}}catch{}
window.addEventListener('pagehide',saveProgress);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
window.forestDiagnostics=()=>({ready:true,texturesReady:!!pbr.ground.map.image?.complete,frames:frameCount,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,position:camera.position.toArray(),playing:isPlaying(),fish:caughtFish,fishingState,hasRod,holdingPot,gardenerHasPot,grillState,grillFish:grillFishList.length,bloomLevel,isSitting,torchOn,season:seasonOf(yearPhase*4),night:_lastElev<DAY_THRESHOLD,paused:timePaused,grid:grid.visible,muted,npcs:{gardener:gardener.state,worker:worker.state},monkeys:treeMonkeys.length,cabins:cabinInstances.length,trees:realism.treeCount,water:inWater(camera.position.x,camera.position.z)});
// Test-only harness advances the actual state machines; absent from normal preview.
if(new URLSearchParams(location.search).get('test')==='1')window.simTest={
  start(){started=true;fallbackMode=true;overlay.classList.add('hidden');menuOpen=false;menu.classList.add('hidden');document.body.classList.remove('landing');},
  travel, tickFishing(dt){updateFishing(dt,performance.now()/1000);}, tickGrill(dt){updateGrill(dt,performance.now()/1000);},
  night(){sunAngle=Math.PI*1.3;_lastElev=-1;timePaused=true;},day(){sunAngle=Math.PI*.3;_lastElev=1;timePaused=true;},
  nearGardener(){travel(gardener.group.position.x,gardener.group.position.z+1);gardenerDialogActive=true;},
  gardenHit(){waterStream.onGardenHit();}, obstacle(){return worldColliders[0].box.getCenter(new THREE.Vector3()).toArray();}, collision(x,y,z){return collidesAt(x,y,z);},
  getChair(){return chairs.find(c=>!c.occupied);}, cameraLook(x,y,z){camera.lookAt(x,y,z);}, sampleHeight(x,z){return terrainHCached(x,z);},
  stepNPC(dt,night){npcStep(gardener,dt,performance.now()/1000,night,{seated:false});npcStep(worker,dt,performance.now()/1000,night,{seated:false});},
  pauseRender(value){window.__testSkipRender=value;},
  finishFrame(){window.__testSkipRender=true;renderer.render(scene,camera);renderer.getContext().finish();}

};
if(pbr.ground.map.image?.complete && pbr.wood.map.image?.complete)document.getElementById('loading')?.remove();

animate();


import * as THREE from 'three';
import {createBotanical} from './botanical.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeCamp} from './forest.js';
import {birchBark,blossoms,createFungi} from './ecology.js';

export function createMaterials(renderer){
  const loader=new THREE.TextureLoader();
  function texture(name,repeat,color){const t=loader.load('./public/textures/'+name+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(color)t.colorSpace=THREE.SRGBColorSpace;return t;}
  function material(prefix,repeat,color,roughness){return new THREE.MeshStandardMaterial({map:texture(prefix+'-color',repeat,true),normalMap:texture(prefix+'-normal',repeat,false),roughnessMap:texture(prefix+'-rough',repeat,false),color,roughness,normalScale:new THREE.Vector2(.8,.8)});}
  const ground=material('ground',140,'#a0aa93',.8),bark=material('bark',1,'#b4bcb2',.8),rock=material('rock',1,'#b1bab0',.7),wood=material('wood',2,'#b5a691',.75);
  for(const t of [bark.map,bark.normalMap,bark.roughnessMap])t.repeat.set(1.5,5);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d'),g=ctx.createLinearGradient(0,0,0,256);g.addColorStop(0,'#bfd2d1');g.addColorStop(.44,'#849997');g.addColorStop(.54,'#354639');g.addColorStop(1,'#111d17');ctx.fillStyle=g;ctx.fillRect(0,0,512,256);
  const environment=new THREE.CanvasTexture(canvas);environment.mapping=THREE.EquirectangularReflectionMapping;environment.colorSpace=THREE.SRGBColorSpace;
  return{ground,bark,rock,wood,environment};
}

export function enhanceWorld({scene,camera,renderer,pbr,terrainH,inWater,registerCollider,treeGroup,oakLeafM,waterMat,waterTexture,house,house2,pond,garden,camp}){
  let seed=96833;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  scene.environment=pbr.environment;scene.environmentIntensity=.3;
  const foliage=createBotanical('leaves',rand),fernTexture=createBotanical('fern',rand);
  oakLeafM.map=foliage;oakLeafM.needsUpdate=true;
  waterMat.map=null;waterMat.bumpMap=waterTexture;waterMat.bumpScale=.06;waterMat.color.set('#42645f');waterMat.roughness=.18;waterMat.opacity=.82;waterMat.metalness=.18;waterMat.needsUpdate=true;
  const leaves=new THREE.MeshStandardMaterial({map:foliage,alphaTest:.42,side:THREE.DoubleSide,color:'#b8c4a8',roughness:.8});
  const fernMat=new THREE.MeshStandardMaterial({map:fernTexture,alphaTest:.4,side:THREE.DoubleSide,color:'#afbd9c',roughness:.82});
  const birch=pbr.bark.clone();birch.map=birchBark();birch.color.set('#d0d0bd');
  const birchLeaves=leaves.clone(),pineLeaves=leaves.clone(),mapleLeaves=leaves.clone(),cherryLeaves=leaves.clone();pineLeaves.map=createBotanical('fern',rand);pineLeaves.color.set('#739078');const blossomMap=blossoms();
  const foliageMats=[leaves,birchLeaves,pineLeaves,mapleLeaves,cherryLeaves],deciduous=[leaves,birchLeaves,mapleLeaves,cherryLeaves];
  const fungi=createFungi(scene,terrainH,inWater);
  const seasons=[new THREE.Color('#b8c49c'),new THREE.Color('#859779'),new THREE.Color('#bba17b'),new THREE.Color('#c6d0c7')];
  const dummy=new THREE.Object3D(),matrix=new THREE.Matrix4(),batches=[],positions=[];
  function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
  const paths=[[[100,20],[63,29]],[[63,29],[45,76]],[[63,29],[80,-25]],[[100,20],[130,-25]],[[94,44],[100,20]]];
  function clear(x,z,plant=false){
    if(inWater(x,z)||terrainH(x,z)<.6||terrainH(x,z)>55)return false;
    if(Math.hypot(x-house.x,z-house.z)<19||Math.hypot(x-house2.x,z-house2.z)<19)return false;
    if(Math.hypot(x-pond.x,z-pond.z)<pond.r+5||Math.hypot(x-garden.x,z-garden.z)<8||Math.hypot(x-camp.x,z-camp.z)<9||Math.hypot(x-111,z-42)<8)return false;
    if(paths.some(([a,b])=>segmentDistance(x,z,a,b)<(plant?2.1:3.7)))return false;
    return true;
  }
  function collider(x,z,r){const y=terrainH(x,z);registerCollider(new THREE.Vector3(x,y+3,z),new THREE.Vector3(r*2,6,r*2));}
  function nearWater(x,z){return !inWater(x,z)&&(inWater(x+2.5,z)||inWater(x-2.5,z)||inWater(x,z+2.5)||inWater(x,z-2.5));}
  function batch(geo,mat,entries,cast=true){
    const groups=new Map();for(const e of entries){const key=Math.floor(e.x/45)+','+Math.floor(e.z/45);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
    for(const [key,list] of groups){const mesh=new THREE.InstancedMesh(geo,mat,list.length);mesh.receiveShadow=true;mesh.castShadow=cast;
      list.forEach((e,i)=>{dummy.position.set(e.x,e.y,e.z);dummy.rotation.set(e.rx||0,e.ry||0,e.rz||0);dummy.scale.set(e.sx,e.sy,e.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();scene.add(mesh);const [x,z]=key.split(',').map(Number);batches.push({mesh,x:x*45+22.5,z:z*45+22.5,cast});
    }
  }
  const trunks=[],birchTrunks=[],crowns=Array.from({length:5},()=>[]),branches=[],rocks=[],ferns=[],grasses=[];
  // Bias growth toward the playable settlement, while keeping the whole map open.
  for(let i=0;i<1300;i++){
    const near=i<620,x=near?85+(rand()-.5)*290:(rand()-.5)*740,z=near?5+(rand()-.5)*290:(rand()-.5)*740;
    if(!clear(x,z))continue;const species=i%5,y=terrainH(x,z),h=species===4?8+rand()*6:species===1?17+rand()*9:15+rand()*13,r=species===1?.22+rand()*.25:.28+rand()*.48;
    positions.push({x,z});collider(x,z,r+.12);(species===1?birchTrunks:trunks).push({x,y:y+h/2,z,sx:r,sy:h,sz:r,ry:rand()*6.28,rx:(rand()-.5)*.03,rz:(rand()-.5)*.03});
    for(let j=0;j<12;j++){const a=j*2.4,t=j/12,rad=species===2?(.5+(1-t)*2.5):species===4?1+rand()*2.7:1+rand()*4.2;crowns[species].push({x:x+Math.sin(a)*rad,y:species===2?y+h*(.3+t*.7):y+h-3+rand()*5,z:z+Math.cos(a)*rad,sx:species===2?2+(1-t)*4:species===4?4+rand()*2:6+rand()*3,sy:species===2?3:6+rand()*3,sz:1,rx:species===2?-.6:(rand()-.5)*2.5,ry:rand()*6.28,rz:(rand()-.5)*1.4});}
    for(let j=0;j<3;j++){const a=rand()*6.28;branches.push({x:x+Math.sin(a)*1.2,y:y+h*.77+j,z:z+Math.cos(a)*1.2,sx:r,sy:4.5,sz:r,rx:Math.cos(a)*.7,rz:-Math.sin(a)*.7});}
  }
  batch(new THREE.CylinderGeometry(.55,1,1,12,5),pbr.bark,trunks);batch(new THREE.CylinderGeometry(.6,1,1,12,5),birch,birchTrunks);batch(new THREE.CylinderGeometry(.13,.35,1,6),pbr.bark,branches);crowns.forEach((entries,i)=>batch(new THREE.PlaneGeometry(1,1),foliageMats[i],entries));
  for(let i=0;i<7000;i++){const x=80+(rand()-.5)*420,z=(rand()-.5)*420;if(!clear(x,z,true))continue;const y=terrainH(x,z),s=.65+rand()*1.3,a=rand()*6.28;for(let j=0;j<2;j++)ferns.push({x,y:y+s*.43,z,sx:s*1.6,sy:s,sz:1,ry:a+j*Math.PI/2});}
  for(let i=0;i<4000;i++){const x=80+(rand()-.5)*560,z=(rand()-.5)*560;if(!nearWater(x,z))continue;const y=terrainH(x,z);if(y<.6||y>55)continue;const s=.7+rand()*1.2,a=rand()*6.28;for(let j=0;j<2;j++)ferns.push({x,y:y+s*.43,z,sx:s*1.6,sy:s,sz:1,ry:a+j*Math.PI/2});}
  batch(new THREE.PlaneGeometry(1,1),fernMat,ferns,false);
  function grassTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.clearRect(0,0,128,128);for(let i=0;i<16;i++){const bx=8+Math.random()*112,lean=(Math.random()-.5)*36,h=55+Math.random()*66,w=3.5+Math.random()*3;const g=x.createLinearGradient(0,128,0,128-h);g.addColorStop(0,'#3d5230');g.addColorStop(1,'#7fa05c');x.fillStyle=g;x.beginPath();x.moveTo(bx-w,128);x.quadraticCurveTo(bx-w*.3+lean*.4,128-h*.6,bx+lean,128-h);x.quadraticCurveTo(bx+w*.3+lean*.4,128-h*.6,bx+w,128);x.closePath();x.fill();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
  const grassGeo=mergeGeometries([0,Math.PI/3,2*Math.PI/3].map(a=>{const p=new THREE.PlaneGeometry(1.1,.8);p.translate(0,.36,0);p.rotateY(a);return p;}));
  const grassMat=new THREE.MeshStandardMaterial({map:grassTexture(),alphaTest:.38,side:THREE.DoubleSide,roughness:.9,color:'#cfe0c2'});
  const windU={value:0};
  function addWind(mat,amp){mat.onBeforeCompile=s=>{s.uniforms.windU=windU;s.vertexShader='uniform float windU;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec4 iwp=instanceMatrix*vec4(0.,0.,0.,1.);\nfloat swy=sin(windU*1.7+iwp.x*.35+iwp.z*.27)+.5*sin(windU*3.1+iwp.z*.53+iwp.x*.11);\ntransformed.x+=swy*'+amp+'*max(transformed.y,0.);\ntransformed.z+=swy*'+(amp*.5)+'*max(transformed.y,0.);');};mat.needsUpdate=true;}
  addWind(grassMat,.07);addWind(fernMat,.035);
  for(let i=0;i<28000;i++){const x=80+(rand()-.5)*390,z=(rand()-.5)*390;if(!clear(x,z,true))continue;const h=terrainH(x,z);const sl=Math.hypot(terrainH(x+1.5,z)-h,terrainH(x,z+1.5)-h)/1.5;const meadow=h<9&&sl<.28;const s=(.4+rand()*.8)*(meadow?1.35:1);grasses.push({x,y:h,z,sx:s,sy:s*(meadow?1.8:1),sz:s,ry:rand()*6.28});const cl=meadow?8:3;for(let k=0;k<cl;k++)grasses.push({x:x+(rand()-.5)*1.1,y:h,z:z+(rand()-.5)*1.1,sx:s*.85,sy:s*(meadow?1.7:.9),sz:s*.85,ry:rand()*6.28});}
  for(let i=0;i<3600;i++){const x=80+(rand()-.5)*560,z=(rand()-.5)*560;if(!nearWater(x,z))continue;const h=terrainH(x,z);if(h<.6||h>55)continue;const s=.5+rand()*.9;grasses.push({x,y:h,z,sx:s,sy:s*1.55,sz:s,ry:rand()*6.28});}
  batch(grassGeo,grassMat,grasses,false);
  for(let i=0;i<350;i++){const x=80+(rand()-.5)*460,z=(rand()-.5)*460;if(!clear(x,z))continue;const r=.35+rand()*1.3;rocks.push({x,y:terrainH(x,z)+r*.15,z,sx:r,sy:r*.57,sz:r*.8,ry:rand()*6.28});collider(x,z,r*.8);}
  const rg=new THREE.IcosahedronGeometry(1,2),rp=rg.attributes.position;for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),f=1+Math.sin(x*7+z*3)*Math.cos(y*8)*.14;rp.setXYZ(i,x*f,y*f,z*f);}rg.computeVertexNormals();batch(rg,pbr.rock,rocks);
  makeCamp(scene,terrainH,collider,{x:111,z:42,rotation:-.35});
  const rainData=new Float32Array(1200*6),rainSeeds=[];for(let i=0;i<1200;i++)rainSeeds.push({x:(rand()-.5)*60,z:(rand()-.5)*60,y:rand()*28,s:.8+rand()*.5});
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainData,3));const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#d0e2dd',transparent:true,opacity:.16,depthWrite:false}));rain.frustumCulled=false;scene.add(rain);
  const fogCanvas=document.createElement('canvas');fogCanvas.width=fogCanvas.height=128;const fc=fogCanvas.getContext('2d'),fg=fc.createRadialGradient(64,64,1,64,64,64);fg.addColorStop(0,'rgba(180,201,198,.15)');fg.addColorStop(.5,'rgba(180,201,198,.06)');fg.addColorStop(1,'rgba(180,201,198,0)');fc.fillStyle=fg;fc.fillRect(0,0,128,128);const fogTex=new THREE.CanvasTexture(fogCanvas),mists=[];
  for(let i=0;i<14;i++){const x=85+(rand()-.5)*170,z=-15+(rand()-.5)*160;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:fogTex,transparent:true,depthWrite:false,opacity:.4}));s.position.set(x,terrainH(x,z)+3,z);s.scale.set(45+rand()*25,9+rand()*7,1);scene.add(s);mists.push(s);}
  let lastCull=0;
  function update(dt,now,season,day,rainAmount,weather){
    windU.value=now;
    scene.environmentIntensity=.15+day*.35;
    const i=Math.floor(season)%4;leaves.color.copy(seasons[i]);birchLeaves.color.set(i===2?'#b8a054':'#a8b69a');mapleLeaves.color.set(i===2?'#ab6433':'#93ab80');pineLeaves.color.set(i===3?'#9fae9e':'#738f70');cherryLeaves.color.set(i===0?'#eadbd8':i===2?'#b98444':'#92a783');if(cherryLeaves.map!==(i===0?blossomMap:foliage)){cherryLeaves.map=i===0?blossomMap:foliage;cherryLeaves.needsUpdate=true;}fernMat.color.copy(leaves.color);grassMat.color.set(i===2?'#b09a58':'#cfe0c2');fungi.visible=i!==3;
    if(now-lastCull>.35){lastCull=now;for(const b of batches){const d=Math.hypot(b.x-camera.position.x,b.z-camera.position.z);b.mesh.visible=d<190&&!(i===3&&(deciduous.includes(b.mesh.material)||b.mesh.material===fernMat||b.mesh.material===grassMat));b.mesh.castShadow=b.cast&&d<85;}for(const tree of treeGroup.children)tree.visible=Math.hypot(tree.position.x-camera.position.x,tree.position.z-camera.position.z)<180;}
    // Roof volumes exclude precipitation indoors; rain remains outside the cabins.
    const indoor=weather?.indoors??[house,house2].some(h=>Math.abs(camera.position.x-h.x)<8&&Math.abs(camera.position.z-h.z)<7);
    rain.visible=rainAmount>.01&&!indoor&&i!==3;rain.material.opacity=rainAmount*(.07+day*.13);rain.material.color.set(i===3?'#f0f6ef':'#d0e2dd');
    for(let j=0;j<rainSeeds.length;j++){const r=rainSeeds[j],y=((r.y-now*(i===3?1.7:12)*r.s)%28+28)%28-5,x=camera.position.x+r.x,z=camera.position.z+r.z;rainData.set([x,camera.position.y+y,z,x-.05,camera.position.y+y+(i===3?.07:.5)*r.s,z+.03],j*6);}rainGeo.attributes.position.needsUpdate=true;
    for(let j=0;j<mists.length;j++){mists[j].material.opacity=weather?.kind==='fog'?.7:(weather?.cloud||0)*.35;mists[j].position.x+=Math.sin(now*.1+j)*dt*.05;}
  }
  return{update,treeCount:positions.length+treeGroup.children.length};
}

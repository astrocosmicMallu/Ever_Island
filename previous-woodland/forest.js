import * as THREE from 'three';

export function buildForest(container) {
  let seed=48723;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const height=(x,z)=>Math.sin(x*.026)*3.1+Math.sin(z*.035)*2.3+Math.sin(x*.069+z*.039)*1.15+Math.cos(x*.12-z*.083)*.34;
  const trail=z=>Math.sin(z*.018)*15+Math.sin(z*.05)*3;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#809392');scene.fog=new THREE.FogExp2('#809392',.019);
  const camera=new THREE.PerspectiveCamera(61,innerWidth/innerHeight,.12,350);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;container.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#c8e0e2','#202e21',2.35));
  const envCanvas=document.createElement('canvas');envCanvas.width=512;envCanvas.height=256;
  const ec=envCanvas.getContext('2d'),eg=ec.createLinearGradient(0,0,0,256);
  eg.addColorStop(0,'#b7cacb');eg.addColorStop(.42,'#869d9b');eg.addColorStop(.53,'#283f32');eg.addColorStop(1,'#101c16');ec.fillStyle=eg;ec.fillRect(0,0,512,256);
  const env=new THREE.CanvasTexture(envCanvas);env.mapping=THREE.EquirectangularReflectionMapping;env.colorSpace=THREE.SRGBColorSpace;scene.environment=env;scene.environmentIntensity=.32;

  const sun=new THREE.DirectionalLight('#d6e8e3',1.45);sun.position.set(-65,100,-80);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:1,far:220});sun.shadow.bias=-.0002;sun.shadow.normalBias=.065;sun.shadow.radius=4;scene.add(sun,sun.target);
  const loader=new THREE.TextureLoader();
  function tex(file,repeat=1,color=false){const t=loader.load('/textures/'+file+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(color)t.colorSpace=THREE.SRGBColorSpace;return t;}
  const groundMat=new THREE.MeshStandardMaterial({map:tex('ground-color',110,true),normalMap:tex('ground-normal',110),normalScale:new THREE.Vector2(.85,.85),roughnessMap:tex('ground-rough',110),roughness:.72,color:'#7c8b72'});
  const geo=new THREE.PlaneGeometry(620,620,250,250);geo.rotateX(-Math.PI/2);const gp=geo.attributes.position;
  for(let i=0;i<gp.count;i++)gp.setY(i,height(gp.getX(i),gp.getZ(i)));geo.computeVertexNormals();const ground=new THREE.Mesh(geo,groundMat);ground.receiveShadow=true;scene.add(ground);
  const trunkMat=new THREE.MeshStandardMaterial({map:tex('bark-color',1,true),normalMap:tex('bark-normal'),normalScale:new THREE.Vector2(1.3,1.3),roughnessMap:tex('bark-rough'),roughness:.82,color:'#9ca49a'});
  for(const t of [trunkMat.map,trunkMat.normalMap,trunkMat.roughnessMap])t.repeat.set(2,7);
  const rockMat=new THREE.MeshStandardMaterial({map:tex('rock-color',1,true),normalMap:tex('rock-normal'),normalScale:new THREE.Vector2(1.1,1.1),roughnessMap:tex('rock-rough'),roughness:.68,color:'#8a9987'});
  const dummy=new THREE.Object3D(),color=new THREE.Color(),spatial=new Map(),treePositions=[];
  function collider(x,z,r){const key=`${Math.floor(x/8)},${Math.floor(z/8)}`;if(!spatial.has(key))spatial.set(key,[]);spatial.get(key).push({x,z,r});}
  function instances(g,m,n,shadow=true){const mesh=new THREE.InstancedMesh(g,m,n);mesh.castShadow=shadow;mesh.receiveShadow=true;scene.add(mesh);return mesh;}
  function stamp(mesh,i,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
  // A locally generated botanical atlas: individual lanceolate leaves, vein detail,
  // and tapered branching. Alpha-tested cards preserve fine silhouettes at distance.
  function botanical(kind){const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');
    function leaf(x,y,a,len,w){ctx.save();ctx.translate(x,y);ctx.rotate(a);const g=ctx.createLinearGradient(0,0,0,-len);g.addColorStop(0,'#172c13');g.addColorStop(.5,kind==='fern'?'#627844':'#587440');g.addColorStop(1,'#9ea36a');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-w,-len*.3,-w*.7,-len*.74,0,-len);ctx.bezierCurveTo(w*.9,-len*.74,w*.6,-len*.22,0,0);ctx.fill();ctx.strokeStyle='#c0c68b50';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-len*.94);ctx.stroke();ctx.restore();}
    if(kind==='fern'){
      for(let f=0;f<9;f++){const a=(f-4)*.23,ox=512,oy=990,len=520+rand()*330;ctx.save();ctx.translate(ox,oy);ctx.rotate(a);ctx.strokeStyle='#657741';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(60,-len*.4,0,-len);ctx.stroke();for(let j=1;j<24;j++){const t=j/24,y=-t*len,x=Math.sin(t*Math.PI)*26;const l=105*Math.sin(t*Math.PI)*(.8+rand()*.3);leaf(x,y,-1.1,l,13);leaf(x,y,1.1,l,13);}ctx.restore();}
    }else{
      const branch=(x,y,a,len,depth)=>{const ex=x+Math.sin(a)*len,ey=y-Math.cos(a)*len;ctx.strokeStyle=depth>1?'#3a3a26':'#67714a';ctx.lineWidth=depth*1.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();if(depth>0){for(let j=1;j<=4;j++){const t=j/4;branch(x+(ex-x)*t,y+(ey-y)*t,a+(j%2?-.7:.7),len*.45,depth-1);}}else{for(let j=0;j<6;j++){const t=j/6;leaf(x+(ex-x)*t,y+(ey-y)*t,a+(j%2?.9:-.9),28+rand()*25,9+rand()*7);}}};
      branch(512,985,-.26,420,3);branch(512,985,.48,420,3);branch(512,985,-.9,290,2);
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
  }
  const leaves=botanical('leaves'),fern=botanical('fern');
  const leafMat=new THREE.MeshStandardMaterial({map:leaves,alphaTest:.42,side:THREE.DoubleSide,roughness:.86,color:'#b4c7a2'});
  // Add diffuse transmission only on the back side, without making leaves glow.
  leafMat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\n if (!gl_FrontFacing) gl_FragColor.rgb *= 1.12;');};
  const count=1900,trunkGeo=new THREE.CylinderGeometry(.52,1,1,10,7);const tp=trunkGeo.attributes.position;
  for(let i=0;i<tp.count;i++){const y=tp.getY(i);tp.setX(i,tp.getX(i)*(1+Math.sin(y*21)*.035));tp.setZ(i,tp.getZ(i)*(1+Math.cos(y*15)*.04));}trunkGeo.computeVertexNormals();
  const trunks=instances(trunkGeo,trunkMat,count),branches=instances(new THREE.CylinderGeometry(.06,.24,1,6),trunkMat,count*3),crowns=instances(new THREE.PlaneGeometry(1,1),leafMat,count*15);
  const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
  for(let i=0;i<count;i++){
    let x,z;do{x=(rand()-.5)*540;z=(rand()-.5)*540;}while(Math.abs(x-trail(z))<4.2 || Math.hypot(x-8,z-13)<11);
    const h=15+rand()*15,r=.27+rand()*.48,y=height(x,z);stamp(trunks,i,x,y+h/2,z,r,h,r,(rand()-.5)*.035,rand()*6.28,(rand()-.5)*.04);collider(x,z,r+.15);treePositions.push({x,z});
    for(let j=0;j<3;j++){const a=rand()*6.28;const root=new THREE.Vector3(x,y+h*(.62+j*.065),z),end=new THREE.Vector3(x+Math.sin(a)*4,y+h*(.87+j*.04),z+Math.cos(a)*4);direction.subVectors(end,root);dummy.position.copy(root).add(end).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize());dummy.scale.set(r*1.6,direction.length(),r*1.6);dummy.updateMatrix();branches.setMatrixAt(i*3+j,dummy.matrix);}
    for(let j=0;j<15;j++){const a=j*2.399,rad=1+rand()*4.8;stamp(crowns,i*15+j,x+Math.sin(a)*rad,y+h-3+rand()*5,z+Math.cos(a)*rad,7+rand()*3,6+rand()*4,1,(rand()-.5)*2.5,rand()*6.28,(rand()-.5)*1.6);color.setHSL(.22+rand()*.025,.12+rand()*.16,.48+rand()*.24);crowns.setColorAt(i*15+j,color);}
  }
  const rockGeo=new THREE.IcosahedronGeometry(1,2),rp=rockGeo.attributes.position;
  for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i);const f=1+Math.sin(x*7+z*3)*Math.cos(y*8)*.16;rp.setXYZ(i,x*f,y*f,z*f);}rockGeo.computeVertexNormals();
  const rocks=instances(rockGeo,rockMat,700);
  for(let i=0;i<700;i++){const x=(rand()-.5)*530,z=(rand()-.5)*530,r=.3+rand()*1.7;const valid=Math.abs(x-trail(z))>3&&Math.hypot(x-8,z-13)>10;stamp(rocks,i,x,height(x,z)+r*.17,z,valid?r:0,r*.58,r*.8,0,rand()*6.28);if(valid)collider(x,z,r*.8);}
  const fernMat=new THREE.MeshStandardMaterial({map:fern,alphaTest:.38,side:THREE.DoubleSide,roughness:.7,color:'#aabb89'});
  const ferns=instances(new THREE.PlaneGeometry(1,1),fernMat,9000,false);
  for(let i=0;i<4500;i++){const x=(rand()-.5)*370,z=(rand()-.5)*370,s=.7+rand()*1.3;const valid=Math.abs(x-trail(z))>2.6&&Math.hypot(x-8,z-13)>6;const y=height(x,z),a=rand()*6.28;for(let j=0;j<2;j++)stamp(ferns,i*2+j,x,y+s*.43,z,valid?s*1.5:0,s,1,0,a+j*Math.PI/2);}
  // Tall grasses use tapered curved blades rather than opaque cone geometry.
  const gv=[];for(let j=0;j<5;j++){const a=j*2.4,dx=Math.sin(a),dz=Math.cos(a),w=.022;gv.push(-w,0,0,w,0,0,dx*.1,.45,dz*.1,w,0,0,dx*.16,.75,dz*.16,dx*.1,.45,dz*.1);}
  const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(gv,3));gg.computeVertexNormals();const grass=instances(gg,new THREE.MeshStandardMaterial({color:'#526448',roughness:.7,side:THREE.DoubleSide}),22000,false);
  for(let i=0;i<22000;i++){const x=(rand()-.5)*370,z=(rand()-.5)*370,s=.45+rand()*.8,valid=Math.abs(x-trail(z))>2.2&&Math.hypot(x-8,z-13)>6;stamp(grass,i,x,height(x,z),z,valid?s:0,s,s,0,rand()*6.28);}
  // Extra near-field planting frames the campsite and gives the first view depth.
  const nearPlants=instances(new THREE.PlaneGeometry(1,1),fernMat,520,false);
  for(let i=0;i<260;i++){const x=-18+rand()*49,z=-35+rand()*74,s=1.1+rand()*1.1;const valid=Math.abs(x-trail(z))>3.4&&Math.hypot(x-8,z-13)>8;for(let j=0;j<2;j++)stamp(nearPlants,i*2+j,x,height(x,z)+s*.44,z,valid?s*1.5:0,s,1,0,rand()*6.28);}
  // Wet depressions: reflective sky tint and subtly rippling normals, flush to soil.
  const puddleMat=new THREE.MeshPhysicalMaterial({color:'#344642',roughness:.19,metalness:.12,transparent:true,opacity:.62,clearcoat:1,clearcoatRoughness:.12,normalMap:tex('ground-normal',2),normalScale:new THREE.Vector2(.12,.12)});
  function puddleShape(radius){const shape=new THREE.Shape();for(let j=0;j<=24;j++){const a=j/24*Math.PI*2,r=radius*(1+Math.sin(a*3)*.16+Math.cos(a*7)*.06);if(j===0)shape.moveTo(Math.cos(a)*r,Math.sin(a)*r);else shape.lineTo(Math.cos(a)*r,Math.sin(a)*r);}return new THREE.ShapeGeometry(shape);}
  for(let i=0;i<24;i++){const z=-110+rand()*180,x=trail(z)+(rand()-.5)*3;const pool=new THREE.Mesh(puddleShape(.35+rand()*.8),puddleMat);pool.rotation.x=-Math.PI/2;pool.scale.y=.5+rand()*.3;pool.position.set(x,height(x,z)+.035,z);scene.add(pool);}
  // A collapsed fallen trunk with visible growth rings.
  const log=new THREE.Mesh(new THREE.CylinderGeometry(.46,.57,8,13),trunkMat);log.rotation.z=Math.PI*.47;log.rotation.y=-.6;log.position.set(-4,height(-4,5)+.48,5);log.castShadow=true;scene.add(log);collider(-4,5,2);
  makeCamp(scene,height,collider);
  // Rain is world-space geometry following the player, not a screen overlay.
  const rainGeo=new THREE.BufferGeometry(),rainData=new Float32Array(1800*6),rainSeeds=[];
  for(let i=0;i<1800;i++)rainSeeds.push({x:(rand()-.5)*65,y:rand()*32,z:(rand()-.5)*65,s:.7+rand()*.6});
  rainGeo.setAttribute('position',new THREE.BufferAttribute(rainData,3));
  const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#d3e2de',transparent:true,opacity:.18,depthWrite:false}));rain.frustumCulled=false;scene.add(rain);
  const mistCanvas=document.createElement('canvas');mistCanvas.width=mistCanvas.height=128;const mc=mistCanvas.getContext('2d'),mg=mc.createRadialGradient(64,64,1,64,64,64);mg.addColorStop(0,'rgba(190,210,206,.16)');mg.addColorStop(.5,'rgba(190,210,206,.07)');mg.addColorStop(1,'rgba(190,210,206,0)');mc.fillStyle=mg;mc.fillRect(0,0,128,128);
  const mistTex=new THREE.CanvasTexture(mistCanvas),mist=[];
  for(let i=0;i<18;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:mistTex,transparent:true,depthWrite:false,opacity:.36}));s.position.set((rand()-.5)*140,1+rand()*5,-25-rand()*110);s.scale.set(45+rand()*35,12+rand()*12,1);scene.add(s);mist.push(s);}
  const particles=new THREE.Group();scene.add(particles);
  // Spatial batches retain GPU instancing while allowing real frustum and distance
  // culling. One world-sized batch otherwise submits invisible distant vegetation.
  const batches=[];
  for(const original of [trunks,branches,crowns,rocks,ferns,grass,nearPlants]){
    const buckets=new Map(),matrix=new THREE.Matrix4(),instanceColor=new THREE.Color();
    for(let i=0;i<original.count;i++){
      original.getMatrixAt(i,matrix);const x=matrix.elements[12],z=matrix.elements[14];
      if(Math.abs(matrix.determinant())<.00001)continue;
      const key=`${Math.floor(x/45)},${Math.floor(z/45)}`;
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);
    }
    scene.remove(original);
    for(const [key,ids] of buckets){
      const chunk=new THREE.InstancedMesh(original.geometry,original.material,ids.length);
      chunk.castShadow=original.castShadow;chunk.receiveShadow=original.receiveShadow;
      ids.forEach((index,i)=>{original.getMatrixAt(index,matrix);chunk.setMatrixAt(i,matrix);if(original.instanceColor){original.getColorAt(index,instanceColor);chunk.setColorAt(i,instanceColor);}});
      chunk.computeBoundingSphere();scene.add(chunk);const [cx,cz]=key.split(',').map(Number);batches.push({mesh:chunk,x:cx*45+22.5,z:cz*45+22.5,shadow:original.castShadow});
    }
    original.dispose();
  }
  function updateWeather(time){for(const b of batches){const d=Math.hypot(b.x-camera.position.x,b.z-camera.position.z);b.mesh.visible=d<160;b.mesh.castShadow=b.shadow&&d<85;}for(let i=0;i<rainSeeds.length;i++){const r=rainSeeds[i],y=((r.y-time*.011*r.s)%32+32)%32-6;const x=r.x+camera.position.x+Math.sin(time*.00012)*2,z=r.z+camera.position.z;rainData.set([x,y+camera.position.y,z,x-.065,y+camera.position.y+.55*r.s,z+.03],i*6);}rainGeo.attributes.position.needsUpdate=true;mist.forEach((s,i)=>s.position.x+=Math.sin(time*.0001+i)*.002);}
  return{scene,camera,renderer,sun,height,trail,rand,count,trunkMat,leafMat,rocks,spatial,treePositions,collider,particles,updateWeather};
}

function makeCamp(scene,height,collider){
  const camp=new THREE.Group();camp.position.set(12,height(12,7)+.06,7);camp.rotation.y=-.38;scene.add(camp);
  const fabricCanvas=document.createElement('canvas');fabricCanvas.width=fabricCanvas.height=256;const ctx=fabricCanvas.getContext('2d');ctx.fillStyle='#9b6234';ctx.fillRect(0,0,256,256);for(let i=0;i<256;i++){ctx.strokeStyle=i%2?'#ffffff09':'#00000010';ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}const fabric=new THREE.CanvasTexture(fabricCanvas);fabric.colorSpace=THREE.SRGBColorSpace;fabric.wrapS=fabric.wrapT=THREE.RepeatWrapping;fabric.repeat.set(3,3);
  const tentMat=new THREE.MeshStandardMaterial({map:fabric,color:'#b79261',roughness:.77,side:THREE.DoubleSide});
  const verts=[-2,0,-2,0,2.65,-2,0,2.65,2,-2,0,-2,0,2.65,2,-2,0,2,0,2.65,-2,2,0,-2,2,0,2,0,2.65,-2,2,0,2,0,2.65,2,-2,0,-2,2,0,-2,0,2.65,-2];
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));const uv=[];for(let i=0;i<5;i++)uv.push(0,0,.5,1,1,0);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();const roof=new THREE.Mesh(geo,tentMat);roof.castShadow=true;roof.receiveShadow=true;camp.add(roof);
  // Open front doorway, with two rolled-back canvas flaps.
  const flapGeo=new THREE.BufferGeometry();flapGeo.setAttribute('position',new THREE.Float32BufferAttribute([-2,0,2,0,2.65,2,-1.05,0,2.04,2,0,2,1.05,0,2.04,0,2.65,2],3));flapGeo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,.5,1,1,0,0,0,1,0,.5,1],2));flapGeo.computeVertexNormals();camp.add(new THREE.Mesh(flapGeo,tentMat));
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(3.9,3.9),new THREE.MeshStandardMaterial({color:'#202723',roughness:.85}));floor.rotation.x=-Math.PI/2;floor.position.y=.025;camp.add(floor);
  const poleMat=new THREE.MeshStandardMaterial({color:'#3d4744',metalness:.75,roughness:.28});
  function rod(a,b,r,mat){const d=new THREE.Vector3().subVectors(b,a),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),6),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());camp.add(m);}
  rod(new THREE.Vector3(0,0,2),new THREE.Vector3(0,2.72,2),.025,poleMat);rod(new THREE.Vector3(0,2.68,-2.15),new THREE.Vector3(0,2.68,2.15),.024,poleMat);
  const ropeMat=new THREE.MeshStandardMaterial({color:'#b6b29d',roughness:1});for(const z of [-2,2])for(const x of [-1,1]){rod(new THREE.Vector3(0,2.65,z),new THREE.Vector3(x*3.5,.03,z*1.5),.009,ropeMat);rod(new THREE.Vector3(x*3.5,0,z*1.5),new THREE.Vector3(x*3.5,.22,z*1.5),.022,poleMat);}
  const sleeping=new THREE.Mesh(new THREE.CapsuleGeometry(.4,1.35,5,10),new THREE.MeshStandardMaterial({color:'#7d8067',roughness:1}));sleeping.rotation.x=Math.PI/2;sleeping.scale.z=.5;sleeping.position.set(.6,.2,0);camp.add(sleeping);
  const lantern=new THREE.Group();lantern.position.set(-.8,.45,2.25);camp.add(lantern);const lightMat=new THREE.MeshStandardMaterial({color:'#ffd093',emissive:'#ffa74d',emissiveIntensity:3});const bulb=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,.26,12),lightMat);lantern.add(bulb);for(const y of [-.17,.17]){const cap=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.07,12),poleMat);cap.position.y=y;lantern.add(cap);}const light=new THREE.PointLight('#ffb85f',13,8,1.8);light.position.set(-.8,.8,2);camp.add(light);
  const bag=new THREE.Mesh(new THREE.BoxGeometry(.7,1,.38,2,2,2),new THREE.MeshStandardMaterial({color:'#515942',roughness:1}));bag.rotation.z=.14;bag.position.set(2.5,.47,1.6);bag.castShadow=true;camp.add(bag);
  collider(12,7,2.4);
}

import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

function canvasTexture(draw,size=512){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
const cloth=canvasTexture((c,s)=>{c.fillStyle='#c7c8b9';c.fillRect(0,0,s,s);for(let i=0;i<s;i++){c.strokeStyle=i%2?'#b5b4a8':'#74766d';c.globalAlpha=.22;c.beginPath();c.moveTo(i,0);c.lineTo(i,s);c.moveTo(0,i);c.lineTo(s,i);c.stroke();}});cloth.repeat.set(3,3);
const fur=canvasTexture((c,s)=>{c.fillStyle='#6b5139';c.fillRect(0,0,s,s);for(let i=0;i<22000;i++){const x=Math.random()*s,y=Math.random()*s;c.strokeStyle=['#2f271d','#ab8d61','#806443','#c1a277'][i%4];c.globalAlpha=.2+Math.random()*.3;c.lineWidth=.5;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.random()*5-2,y+4+Math.random()*12);c.stroke();}});
const fishTexture=canvasTexture((c,s)=>{const g=c.createLinearGradient(0,0,0,s);g.addColorStop(0,'#334e47');g.addColorStop(.45,'#8aafab');g.addColorStop(.7,'#c5cebd');g.addColorStop(1,'#e9e4d0');c.fillStyle=g;c.fillRect(0,0,s,s);for(let y=0;y<s;y+=10)for(let x=0;x<s;x+=14){c.strokeStyle='#263c3440';c.lineWidth=1;c.beginPath();c.arc(x+(y%20?7:0),y,8,0,Math.PI);c.stroke();}for(let i=0;i<550;i++){c.fillStyle='#203a2b77';c.beginPath();c.arc(Math.random()*s,Math.random()*s*.64,1+Math.random()*2,0,7);c.fill();}});
function mesh(g,m,parent,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function ellipsoid(parent,m,x,y,z,sx,sy,sz){const o=mesh(new THREE.SphereGeometry(1,20,14),m,parent,x,y,z);o.scale.set(sx,sy,sz);return o;}
export function markViewmodel(object){object.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine)o.layers.set(1);});}

let headPromise;
function scannedHead(){if(!headPromise){const tl=new THREE.TextureLoader();const color=tl.load('./public/models/head-color.jpg'),normal=tl.load('./public/models/head-normal.jpg');color.colorSpace=THREE.SRGBColorSpace;color.flipY=normal.flipY=true;headPromise=new GLTFLoader().loadAsync('./public/models/LeePerrySmith.glb').then(gltf=>{let source;gltf.scene.traverse(o=>{if(o.isMesh&&!source)source=o;});const original=source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone();original.computeBoundingBox();const cutoff=original.boundingBox.min.y+(original.boundingBox.max.y-original.boundingBox.min.y)*.45;
const attributes={};for(const key of ['position','normal','uv'])attributes[key]=[];const p=original.attributes.position;
for(let i=0;i<p.count;i+=3){if(p.getY(i)<cutoff&&p.getY(i+1)<cutoff&&p.getY(i+2)<cutoff)continue;for(let j=0;j<3;j++){for(const key of ['position','normal','uv']){const a=original.attributes[key];for(let k=0;k<a.itemSize;k++){let value=a.array[(i+j)*a.itemSize+k];if(key==='position'&&k===1)value=Math.max(cutoff,value);attributes[key].push(value);}}}}
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(attributes.position,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(attributes.normal,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(attributes.uv,2));geometry.computeBoundingBox();const box=geometry.boundingBox,center=box.getCenter(new THREE.Vector3()),scale=.32/(box.max.y-box.min.y);geometry.translate(-center.x,-center.y,-center.z);geometry.scale(scale,scale,scale);original.dispose();
return{geometry,material:new THREE.MeshPhysicalMaterial({map:color,normalMap:normal,normalScale:new THREE.Vector2(.65,.65),roughness:.72,clearcoat:0,envMapIntensity:.35})};});}return headPromise;}
export function makeOrganicPerson(shirtCol,pantsCol,skinCol){
  const group=new THREE.Group(),head=new THREE.Group(),armL=new THREE.Group(),armR=new THREE.Group(),legL=new THREE.Group(),legR=new THREE.Group();
  const shirt=new THREE.MeshStandardMaterial({color:shirtCol,map:cloth,bumpMap:cloth,bumpScale:.006,roughness:.93});const pants=new THREE.MeshStandardMaterial({color:pantsCol,map:cloth,roughness:.94});shirt.color.lerp(new THREE.Color('#c3c8ad'),.35);pants.color.lerp(new THREE.Color('#898f84'),.18);const skin=new THREE.MeshStandardMaterial({color:skinCol,roughness:.6});const boot=new THREE.MeshStandardMaterial({color:'#272a24',roughness:.8});
  const profile=[[-.32,.16],[-.26,.19],[-.12,.175],[.10,.225],[.22,.205],[.29,.11],[.32,.08]].map(([y,r])=>new THREE.Vector2(r,y));
  const torso=mesh(new THREE.LatheGeometry(profile,32),shirt,group,0,1.15,0);torso.scale.z=.65;
  ellipsoid(group,pants,0,.81,0,.19,.13,.13);mesh(new THREE.CylinderGeometry(.058,.071,.14,16),skin,group,0,1.50,0);
  head.position.set(0,1.65,.015);group.add(head);const fallback=ellipsoid(head,skin,0,0,0,.12,.16,.11);
  scannedHead().then(({geometry,material})=>{fallback.visible=false;const scan=mesh(geometry,material.clone(),head,0,.005,0);group.userData.scannedHead=true;}).catch(()=>{group.userData.scannedHead=false;});
  for(const [arm,s] of [[armL,-1],[armR,1]]){arm.position.set(s*.235,1.42,0);group.add(arm);mesh(new THREE.CapsuleGeometry(.068,.19,6,16),shirt,arm,0,-.13,0);mesh(new THREE.CapsuleGeometry(.053,.18,6,16),shirt,arm,0,-.355,.012);ellipsoid(arm,skin,0,-.51,.015,.038,.063,.024);for(let i=0;i<4;i++){const f=mesh(new THREE.CapsuleGeometry(.008,.046,3,8),skin,arm,(i-1.5)*.017,-.572,.016);f.rotation.z=(i-1.5)*.05;}const thumb=mesh(new THREE.CapsuleGeometry(.009,.035,3,8),skin,arm,s*.046,-.515,.02);thumb.rotation.z=s*.45;}
  for(const [leg,s] of [[legL,-1],[legR,1]]){leg.position.set(s*.103,.75,0);group.add(leg);mesh(new THREE.CapsuleGeometry(.085,.25,6,16),pants,leg,0,-.15,0);mesh(new THREE.CapsuleGeometry(.063,.24,6,16),pants,leg,0,-.45,0);ellipsoid(leg,boot,0,-.68,.05,.086,.065,.145);}
  if(shirtCol===0x4a6a3a){
    const hatMat=new THREE.MeshStandardMaterial({map:cloth,color:'#afa77d',roughness:1});
    mesh(new THREE.CylinderGeometry(.22,.22,.015,40),hatMat,head,0,.13,0);
    mesh(new THREE.CylinderGeometry(.105,.132,.13,32),hatMat,head,0,.20,0);
    mesh(new THREE.CylinderGeometry(.134,.136,.022,32),new THREE.MeshStandardMaterial({color:'#534a35',roughness:.95}),head,0,.15,0);
  }else{
    const frameMat=new THREE.MeshStandardMaterial({color:'#383d37',metalness:.55,roughness:.35});
    for(const side of [-1,1])mesh(new THREE.TorusGeometry(.03,.0027,6,24),frameMat,head,side*.046,.035,.105);
    mesh(new THREE.BoxGeometry(.036,.003,.004),frameMat,head,0,.035,.108);
  }
  // Hair, brows and neck-to-shoulder blend: no more "face attached on body".
  const hairM=new THREE.MeshStandardMaterial({color:shirtCol===0x4a6a3a?'#8a8078':'#2e2620',roughness:.95});
  const cap=mesh(new THREE.SphereGeometry(.15,20,14,0,Math.PI*2,0,Math.PI*.62),hairM,head,0,.02,-.02);
  cap.scale.set(1.05,1,1.05);cap.rotation.x=-.3;
  for(const s of [-1,1]){const lock=mesh(new THREE.SphereGeometry(.09,12,10),hairM,head,s*.108,-.03,-.035);lock.scale.set(.5,1.2,1.05);}
  const backH=mesh(new THREE.SphereGeometry(.13,14,12),hairM,head,0,-.03,-.1);backH.scale.set(1,1.15,.55);
  if(shirtCol===0x4a6a3a){const bun=mesh(new THREE.SphereGeometry(.05,12,10),hairM,head,0,.10,-.12);bun.scale.set(1,.9,1);}
  else{for(const s of [-1,1])mesh(new THREE.BoxGeometry(.02,.07,.03),hairM,head,s*.115,-.02,.01);}
  const browM=new THREE.MeshStandardMaterial({color:'#241d16',roughness:.9});
  for(const s of [-1,1]){const b=mesh(new THREE.CapsuleGeometry(.008,.036,3,6),browM,head,s*.048,.048,.122);b.rotation.z=Math.PI/2+s*-.12;b.rotation.y=s*.25;}
  mesh(new THREE.CylinderGeometry(.085,.105,.09,16),shirt,group,0,1.545,0);
  for(const s of [-1,1]){const t=mesh(new THREE.CapsuleGeometry(.055,.12,4,10),shirt,group,s*.15,1.47,0);t.rotation.z=s*1.15;}
  // Buttons, zipper and a softly shaped chest pocket.
  const trim=new THREE.MeshStandardMaterial({color:'#252b22',metalness:.35,roughness:.5});for(let i=0;i<5;i++)ellipsoid(group,trim,0,.94+i*.085,.146,.009,.009,.005);
  mesh(new RoundedBoxGeometry(.115,.12,.018,3,.01),shirt,group,-.1,1.27,.137);
  return {group,head,torso,armL,armR,legL,legR};
}

export function makeNaturalMonkey(){
  const group=new THREE.Group(),head=new THREE.Group(),tail=new THREE.Group(),armL=new THREE.Group(),armR=new THREE.Group();
  const coat=new THREE.MeshStandardMaterial({map:fur,bumpMap:fur,bumpScale:.013,color:'#b3a68b',roughness:.97});const skin=new THREE.MeshStandardMaterial({color:'#96775d',roughness:.78});const dark=new THREE.MeshStandardMaterial({color:'#20170e',roughness:.3});
  ellipsoid(group,coat,-.02,.51,0,.29,.29,.21);ellipsoid(group,coat,.1,.72,0,.18,.19,.19);head.position.set(.25,.82,0);group.add(head);
  ellipsoid(head,coat,0,0,0,.15,.17,.15);ellipsoid(head,skin,.11,-.02,0,.075,.11,.11);ellipsoid(head,skin,.17,-.07,0,.07,.052,.085);
  for(const s of [-1,1]){ellipsoid(head,skin,-.025,.015,s*.157,.045,.065,.028);ellipsoid(head,dark,.132,.025,s*.070,.027,.022,.02);ellipsoid(head,new THREE.MeshPhysicalMaterial({color:'#c69a48',roughness:.12,clearcoat:1}),.153,.026,s*.07,.009,.013,.013);ellipsoid(head,dark,.224,-.065,s*.026,.008,.006,.008);}
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(-.18,-.08,0),new THREE.Vector3(-.38,-.32,.04),new THREE.Vector3(-.64,-.37,.09),new THREE.Vector3(-.78,-.23,.1)]);mesh(new THREE.TubeGeometry(curve,24,.025,8,false),coat,tail);tail.position.set(-.22,.46,0);group.add(tail);
  for(const [arm,s] of [[armL,-1],[armR,1]]){arm.position.set(.12,.7,s*.18);group.add(arm);mesh(new THREE.CapsuleGeometry(.043,.25,6,12),coat,arm,0,-.16,0);ellipsoid(arm,skin,.025,-.35,0,.065,.035,.05);for(let i=0;i<4;i++){const f=mesh(new THREE.CapsuleGeometry(.008,.065,3,7),skin,arm,.04,-.39,(i-1.5)*.02);f.rotation.z=.5;}const leg=mesh(new THREE.CapsuleGeometry(.065,.2,6,12),coat,group,-.16,.21,s*.15);leg.rotation.z=-.38;ellipsoid(group,skin,-.12,.055,s*.15,.1,.04,.045);}
  return{group,head,tail,armL,armR};
}

export function detailedFish(scale=1){
  const group=new THREE.Group();const mat=new THREE.MeshPhysicalMaterial({map:fishTexture,color:'#b8c9c5',roughness:.26,metalness:.25,clearcoat:.6,clearcoatRoughness:.17});
  const points=[[-.22,.008],[-.17,.022],[-.11,.055],[0,.072],[.10,.059],[.17,.035],[.205,.013]].map(([y,r])=>new THREE.Vector2(r,y));const body=mesh(new THREE.LatheGeometry(points,24),mat,group);body.rotation.z=-Math.PI/2;body.scale.x=.7;
  const finMat=new THREE.MeshPhysicalMaterial({color:'#8e9c7e',side:THREE.DoubleSide,transparent:true,opacity:.8,roughness:.45});
  function fin(vertices){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return mesh(g,finMat,group);}
  fin([-.2,0,0,-.3,.09,0,-.27,0,0,-.2,0,0,-.27,0,0,-.3,-.09,0]);fin([-.075,.057,0,-.04,.125,0,.045,.065,0]);for(const s of [-1,1])fin([.07,-.02,s*.04,-.02,-.07,s*.1,-.06,-.04,s*.045]);
  const eyeM=new THREE.MeshPhysicalMaterial({color:'#080b07',roughness:.08,clearcoat:1});for(const s of [-1,1]){ellipsoid(group,new THREE.MeshStandardMaterial({color:'#c9b668',metalness:.3,roughness:.3}),.15,.024,s*.034,.018,.018,.006);ellipsoid(group,eyeM,.15,.024,s*.04,.011,.011,.004);}
  group.scale.setScalar(scale);group.userData.mat=mat;return group;
}

export function createFlower(kind=0,color='#db6c83'){
  const group=new THREE.Group(),stemMat=new THREE.MeshStandardMaterial({color:'#435d28',roughness:.95}),petalMat=new THREE.MeshPhysicalMaterial({color,side:THREE.DoubleSide,roughness:.72,sheen:.35,sheenColor:new THREE.Color('#ead8ce')});
  const stemCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.02,.2,.015),new THREE.Vector3(0,.48,0)]);mesh(new THREE.TubeGeometry(stemCurve,8,.007,6,false),stemMat,group);
  const geos=[];const n=kind===0?6:kind===1?18:12;
  for(let i=0;i<n;i++){const layer=kind===1?Math.floor(i/6):0,a=i*6.283/(kind===1?6:n)+layer*.6,g=new THREE.PlaneGeometry(.065,.13,4,7),p=g.attributes.position;for(let j=0;j<p.count;j++){const u=(p.getY(j)+.065)/.13;p.setX(j,p.getX(j)*Math.sin(u*Math.PI)*1.15);p.setZ(j,Math.sin(u*Math.PI)*.025+u*u*.04);}g.computeVertexNormals();g.rotateX(kind===2?-1.2:-.4-layer*.3);g.translate(0,.065,0);g.rotateY(a);g.translate(Math.sin(a)*(.035-layer*.009),.48+layer*.025,Math.cos(a)*(.035-layer*.009));geos.push(g);}
  const petals=mesh(mergeGeometries(geos),petalMat,group);group.userData.petals=petals;group.userData.petalMat=petalMat;
  ellipsoid(group,new THREE.MeshStandardMaterial({color:'#d7ac41',roughness:1}),0,.49,0,.025,.025,.025);
  for(let i=0;i<3;i++){const a=i*2.4,g=new THREE.PlaneGeometry(.09,.19,4,6),p=g.attributes.position;for(let j=0;j<p.count;j++){const t=(p.getY(j)+.095)/.19;p.setX(j,p.getX(j)*Math.sin(t*Math.PI));p.setZ(j,Math.sin(t*Math.PI)*.035);}g.computeVertexNormals();g.rotateZ(.75);g.rotateY(a);const leaf=mesh(g,new THREE.MeshStandardMaterial({color:'#526b2a',side:THREE.DoubleSide,roughness:.85}),group,Math.sin(a)*.065,.13+i*.085,Math.cos(a)*.065);}
  return group;
}

export function furnishCabin(group,pbr,floorTop,upper){
  const fabric=new THREE.MeshStandardMaterial({map:cloth,bumpMap:cloth,bumpScale:.01,color:'#819085',roughness:.98});
  function soft(w,h,d,x,y,z,mat=fabric,r=.09){return mesh(new RoundedBoxGeometry(w,h,d,4,r),mat,group,x,y,z);}
  soft(3.1,.36,1.3,-3,floorTop+.40,-2.4);soft(3.2,.70,.3,-3,floorTop+.80,-2.94);soft(.24,.62,1.4,-4.65,floorTop+.6,-2.4);soft(.24,.62,1.4,-1.35,floorTop+.6,-2.4);
  for(let i=0;i<3;i++)soft(.95,.16,1.05,-4+i,floorTop+.65,-2.34,fabric,.08);
  const pillow=new THREE.MeshStandardMaterial({map:cloth,color:'#beaf90',roughness:.96});for(const [x,a] of [[-4,.16],[-2,-.18]]){const p=soft(.5,.48,.17,x,floorTop+.95,-2.68,pillow,.12);p.rotation.z=a;}
  const rugTex=canvasTexture((c,s)=>{c.fillStyle='#8f8977';c.fillRect(0,0,s,s);for(let i=0;i<50;i++){c.strokeStyle=i%2?'#686954':'#b0a185';c.lineWidth=2;c.strokeRect(i*4,i*4,s-i*8,s-i*8);}});const rug=mesh(new THREE.PlaneGeometry(3.9,2.3),new THREE.MeshStandardMaterial({map:rugTex,roughness:1}),group,-3,floorTop+.015,-.75);rug.rotation.x=-Math.PI/2;
  soft(1.45,.1,.85,-3,floorTop+.52,-.78,pbr.wood,.035);for(const x of [-3.58,-2.42])for(const z of [-1.06,-.5])mesh(new THREE.CylinderGeometry(.028,.035,.48,10),pbr.wood,group,x,floorTop+.25,z);
  const ceramic=new THREE.MeshPhysicalMaterial({color:'#bcc6b6',roughness:.28,clearcoat:.6});mesh(new THREE.CylinderGeometry(.063,.048,.11,20,1,true),ceramic,group,-2.8,floorTop+.63,-.78);const handle=mesh(new THREE.TorusGeometry(.036,.009,8,18),ceramic,group,-2.73,floorTop+.63,-.78);handle.rotation.y=Math.PI/2;
  for(let i=0;i<3;i++){const book=soft(.32,.04,.23,-3.3,floorTop+.59+i*.042,-.9,new THREE.MeshStandardMaterial({color:['#764d3d','#59665b','#bca878'][i]}),.006);book.rotation.y=.1*i;}
  // Shelf with books, a ceramic vase and a warm reading lamp.
  soft(1.4,.08,.3,4.8,floorTop+1.8,1.2,pbr.wood,.02);for(let i=0;i<7;i++){const b=soft(.07,.25+Math.sin(i)*.045,.17,4.35+i*.1,floorTop+1.97,1.2,new THREE.MeshStandardMaterial({color:['#786344','#8b604b','#676f60'][i%3]}),.005);b.rotation.z=i===0?.1:0;}
  const lamp=new THREE.MeshStandardMaterial({color:'#d3c5a6',roughness:.9,side:THREE.DoubleSide,emissive:'#a96328',emissiveIntensity:.15});mesh(new THREE.CylinderGeometry(.20,.3,.35,24,1,true),lamp,group,-4.9,floorTop+1.4,-1.5);mesh(new THREE.CylinderGeometry(.018,.025,1.2,12),pbr.wood,group,-4.9,floorTop+.62,-1.5);
  const glow=new THREE.PointLight('#ffd4a1',2,6,2);glow.position.set(-4.9,floorTop+1.3,-1.5);group.add(glow);
  soft(2.9,.32,2.1,-3.55,upper+.32,1.1,pbr.wood,.07);soft(2.8,.27,2,-3.55,upper+.6,1.1,new THREE.MeshStandardMaterial({map:cloth,color:'#d4d0bd',roughness:1}),.12);soft(2.8,.08,1.4,-3.55,upper+.79,1.35,fabric,.04);soft(.9,.15,.55,-4.1,upper+.82,.4,pillow,.09);soft(.9,.15,.55,-3,upper+.82,.4,pillow,.09);
}

export class RibbonFlame {
  constructor(parent,origin,size){
    this.group=new THREE.Group();this.group.position.set(origin.x,origin.y,origin.z);parent.add(this.group);this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{time:{value:0}},vertexShader:`varying vec2 vUv;uniform float time;void main(){vUv=uv;vec3 p=position;p.x+=sin(p.y*8.+time*5.)*p.y*.1;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`varying vec2 vUv;uniform float time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){vec2 p=vUv;float noise=n(vec2(p.x*6.,p.y*5.-time*3.))+n(vec2(p.x*13.,p.y*12.-time*6.))*.45;float taper=pow(1.-p.y,1.7)*.40;float width=abs(p.x-.5+sin(p.y*9.-time*3.)*p.y*.09);float flame=smoothstep(taper,taper-.13,width+(noise-.6)*.14);float a=flame*smoothstep(0.,.09,p.y)*smoothstep(1.,.45,p.y)*(.45+noise*.45);vec3 color=mix(vec3(1.,.12,.005),vec3(1.,.64,.09),1.-p.y);color=mix(color,vec3(1.,.94,.65),pow(max(0.,1.-width*7.),3.)*(1.-p.y));gl_FragColor=vec4(color*1.1,a*.26);}`});
    const g=new THREE.PlaneGeometry(size*.7,size,8,12);g.translate(0,size/2,0);for(let i=0;i<3;i++){const m=new THREE.Mesh(g,this.material);m.rotation.y=i*Math.PI/3;this.group.add(m);}
  }
  update(t,on=true){this.material.uniforms.time.value=t;this.group.visible=on;}
}

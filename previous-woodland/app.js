import './styles.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { buildForest } from './forest.js';
const $=id=>document.getElementById(id);
const {scene,camera,renderer,sun,height,trail,rand,count,trunkMat,leafMat,rocks,spatial,treePositions,collider,particles,updateWeather}=buildForest($('world'));
const controls=new PointerLockControls(camera,renderer.domElement);controls.pointerSpeed=.7;
const landmarks=[{name:'The old sentinel',x:-16,z:-34,description:'A weathered elder at the bend in the trail. Its rings hold more mornings than we can count.'},{name:'The resting stones',x:23,z:-91,description:'Moss-softened stone, patiently shaped by rain. A good place to do absolutely nothing.'},{name:'Sunlit hollow',x:-30,z:-156,description:'A small clearing where the canopy opens. Stand still, and listen to the light.'}];
let discovered=new Set();try {discovered=new Set(JSON.parse(localStorage.getItem('everwild-notes')||'[]'));}catch{}
// Give each field-note landmark a distinct visible object.
landmarks.forEach((l,i)=>{
 const y=height(l.x,l.z);
 if(i===0){const t=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.4,24,12),trunkMat);t.position.set(l.x,y+12,l.z);t.castShadow=true;scene.add(t);collider(l.x,l.z,1.5);}
 if(i===1){for(let j=0;j<5;j++){const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(1.8,2),rocks.material);rock.scale.set(1,1.6,1);rock.position.set(l.x+Math.sin(j*1.25)*4,y+1,l.z+Math.cos(j*1.25)*4);rock.castShadow=true;scene.add(rock);collider(rock.position.x,rock.position.z,1.8);}}
 if(i===2){const glow=new THREE.PointLight('#ffe3a4',12,22,1.5);glow.position.set(l.x,y+5,l.z);scene.add(glow);}
 const post=new THREE.Mesh(new THREE.BoxGeometry(.17,1.4,.17),trunkMat);post.position.set(l.x+3,y+.7,l.z+3);scene.add(post);
 const sign=new THREE.Mesh(new THREE.BoxGeometry(.9,.32,.09),new THREE.MeshStandardMaterial({color:'#c6bc8b'}));sign.position.set(l.x+3,y+1.3,l.z+3);scene.add(sign);
});
const start={x:trail(24),z:24};
camera.position.set(start.x,height(start.x,start.z)+1.72,start.z);camera.lookAt(7,height(7,-30)+4.2,-30);
let walking=false,everEntered=false,quiet=false;
const keys=new Set();
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
$('enter').onclick=()=>{try{const result=controls.lock();result?.catch(()=>toast('Mouse capture unavailable. Hold and drag the forest to look; WASD to walk.'));}catch{toast('Hold and drag to look; WASD to walk.');}everEntered=true;setPlaying(true);audio.enable();};
function setPlaying(on){walking=on;$('welcome').hidden=on;$('playing').hidden=!on;$('crosshair').hidden=!on;}
controls.addEventListener('lock',()=>setPlaying(true));
controls.addEventListener('unlock',()=>{setPlaying(false);keys.clear();$('enter').innerHTML='Back to the forest <span>↗</span>';if(quiet)toggleQuiet();});
document.addEventListener('pointerlockerror',()=>toast('Mouse capture unavailable. Drag the forest to look.'));
let dragging=false,lastX=0,lastY=0;
renderer.domElement.addEventListener('pointerdown',e=>{if(everEntered&&!controls.isLocked){dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);setPlaying(true);}});
renderer.domElement.addEventListener('pointerup',()=>dragging=false);
renderer.domElement.addEventListener('pointermove',e=>{if(!dragging||controls.isLocked)return;const rot=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');rot.y-=(e.clientX-lastX)*.003*controls.pointerSpeed;rot.x=THREE.MathUtils.clamp(rot.x-(e.clientY-lastY)*.003*controls.pointerSpeed,-1.45,1.45);camera.quaternion.setFromEuler(rot);lastX=e.clientX;lastY=e.clientY;});
window.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='KeyH')toggleQuiet();if(e.code==='KeyM')document.querySelector('.field-panel').classList.toggle('expanded');if(e.code==='Escape'&&!controls.isLocked){setPlaying(false);if(quiet)toggleQuiet();}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
function blocked(x,z){if(Math.abs(x)>295||Math.abs(z)>295)return true;const gx=Math.floor(x/8),gz=Math.floor(z/8);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const c of spatial.get(`${gx+dx},${gz+dz}`)||[])if((x-c.x)**2+(z-c.z)**2<(c.r+.3)**2)return true;return false;}
function toggleQuiet(){quiet=!quiet;document.body.classList.toggle('quiet',quiet);if(quiet)toast('Quiet view · Press H to bring everything back');}
$('photo').onclick=toggleQuiet;
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable in this embedded preview.');}};
$('map-toggle').onclick=()=>document.querySelector('.field-panel').classList.toggle('expanded');
function openDialog(id){if(controls.isLocked)controls.unlock();keys.clear();setPlaying(false);$(id).showModal();}
$('settings').onclick=()=>openDialog('settings-dialog');$('journal').onclick=()=>{updateNotes();openDialog('journal-dialog');};
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('sensitivity').oninput=e=>controls.pointerSpeed=Number(e.target.value);
$('quality').onchange=e=>{renderer.setPixelRatio(Math.min(devicePixelRatio,Number(e.target.value)));sun.shadow.mapSize.set(Number(e.target.value)<1?1024:2048,Number(e.target.value)<1?1024:2048);sun.shadow.map?.dispose();sun.shadow.map=null;};
$('reset').onclick=()=>{camera.position.set(start.x,height(start.x,start.z)+1.72,start.z);camera.lookAt(7,height(7,-30)+4.2,-30);$('settings-dialog').close();toast('Back where the trail begins.');};
function updateNotes(){ $('discovery-count').textContent=`${discovered.size} / 3 discovered`;$('notes').innerHTML=landmarks.map((l,i)=>`<div class="note"><strong>${discovered.has(i)?'✧ '+l.name:'0'+(i+1)+' — Still waiting to be found'}</strong><p>${discovered.has(i)?l.description:'Look for the small numbered marker on your woodland map.'}</p></div>`).join('');}
updateNotes();
// Public Internet Archive stream. A procedural Web Audio soundscape remains
// available when the remote host blocks CORS, is offline, or cannot buffer.
const audio={ctx:null,on:false,volume:.35,stream:null,streamReady:false,async enable(){
 if(this.on)return;this.on=true;
 try{if(!this.ctx)this.init();await this.ctx.resume();this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.4);this.stream.play().catch(()=>{});}catch{this.on=false;toast('Audio is not available in this browser.');}this.update();
},init(){
 this.ctx=new (window.AudioContext||window.webkitAudioContext)();const ctx=this.ctx;
 this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
 this.nature=ctx.createGain();this.nature.gain.value=1;this.nature.connect(this.master);
 const buffer=ctx.createBuffer(1,ctx.sampleRate*8,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.022)/1.022;data[i]=brown*2.4;}
 const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1100;noise.connect(filter).connect(this.nature);noise.start();
 // A second, high-passed noise bed is continuous rainfall on the canopy.
 const rainBuffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),rainData=rainBuffer.getChannelData(0);for(let i=0;i<rainData.length;i++)rainData[i]=(Math.random()*2-1)*.2;
 const rainSource=ctx.createBufferSource();rainSource.buffer=rainBuffer;rainSource.loop=true;
 const rainFilter=ctx.createBiquadFilter();rainFilter.type='highpass';rainFilter.frequency.value=850;rainSource.connect(rainFilter).connect(this.master);rainSource.start();
 const lfo=ctx.createOscillator(),lfoGain=ctx.createGain();lfo.frequency.value=.12;lfoGain.gain.value=380;lfo.connect(lfoGain).connect(filter.frequency);lfo.start();
 this.stream=new Audio('https://archive.org/download/aporee_41252_47068/branchcrush.mp3');
 this.stream.crossOrigin='anonymous';this.stream.loop=true;this.stream.preload='none';
 const streamNode=ctx.createMediaElementSource(this.stream);streamNode.connect(this.master);
 this.stream.addEventListener('playing',()=>{this.streamReady=true;this.nature.gain.setTargetAtTime(.08,ctx.currentTime,2);this.update();});
 const fallback=()=>{this.streamReady=false;this.nature.gain.setTargetAtTime(1,ctx.currentTime,1);this.update();};this.stream.addEventListener('error',fallback);this.stream.addEventListener('waiting',fallback);
 setInterval(()=>{if(!this.on)return;for(let i=0;i<3;i++){const t=ctx.currentTime+i*.19,o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(1900+Math.random()*1200,t);o.frequency.exponentialRampToValueAtTime(3500+Math.random()*900,t+.09);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.035,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+.15);o.connect(g).connect(this.nature);o.start(t);o.stop(t+.18);}},4200);
},toggle(){if(!this.on)this.enable();else{this.on=false;this.master?.gain.setTargetAtTime(0,this.ctx.currentTime,.2);this.stream?.pause();this.update();}},update(){$('sound').querySelector('span').textContent=this.on?'Sound on':'Sound off';$('sound').title=this.on?(this.streamReady?'Live woodland recording':'Local wind & birds · stream unavailable or loading'):'Enable forest ambience';}};
$('sound').onclick=()=>audio.toggle();$('volume').oninput=e=>{audio.volume=Number(e.target.value);if(audio.on)audio.master.gain.setTargetAtTime(audio.volume,audio.ctx.currentTime,.1);};
const mapCtx=$('map').getContext('2d');
function drawMap(){const ctx=mapCtx,w=520,h=290,scale=.77;const project=(x,z)=>[w/2+x*scale,h*.72+z*scale];ctx.fillStyle='#293f33';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#89a77418';ctx.lineWidth=1;
 for(let n=0;n<16;n++){ctx.beginPath();for(let a=0;a<6.32;a+=.07){const r=25+n*17+Math.sin(a*3+n*.4)*11;const x=285+Math.cos(a)*r*1.8,y=95+Math.sin(a)*r; a===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
 ctx.fillStyle='#74946435';for(const t of treePositions){const [x,y]=project(t.x,t.z);ctx.beginPath();ctx.arc(x,y,1.8,0,6.28);ctx.fill();}
 ctx.strokeStyle='#b3bc8955';ctx.lineWidth=3;ctx.beginPath();for(let z=-300;z<=300;z+=3){const [x,y]=project(trail(z),z);z===-300?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();
 landmarks.forEach((l,i)=>{const[x,y]=project(l.x,l.z);ctx.fillStyle=discovered.has(i)?'#c6d99e':'#476044';ctx.strokeStyle='#a9bb86';ctx.beginPath();ctx.arc(x,y,10,0,6.28);ctx.fill();ctx.stroke();ctx.fillStyle=discovered.has(i)?'#294033':'#d5dfbd';ctx.font='11px Arial';ctx.textAlign='center';ctx.fillText(i+1,x,y+4);});
 const [x,y]=project(camera.position.x,camera.position.z);const direction=new THREE.Vector3();camera.getWorldDirection(direction);const a=Math.atan2(direction.x,-direction.z);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle='#d8e9ae18';ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,35,-Math.PI*.7,-Math.PI*.3);ctx.closePath();ctx.fill();ctx.restore();ctx.fillStyle='#dceabb';ctx.shadowColor='#dceabb';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(x,y,4,0,6.28);ctx.fill();ctx.shadowBlur=0;
 const deg=(a*180/Math.PI+360)%360;const dirs=['N','NE','E','SE','S','SW','W','NW'];$('bearing').textContent=dirs[Math.round(deg/45)%8];
}
let last=performance.now(),mapTimer=0,bob=0;
const forward=new THREE.Vector3(),right=new THREE.Vector3(),move=new THREE.Vector3();
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;
 if(walking&&!document.querySelector('dialog[open]')){
  let f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),s=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,camera.up);move.copy(forward).multiplyScalar(f).addScaledVector(right,s);if(move.lengthSq()>0){move.normalize().multiplyScalar((keys.has('ShiftLeft')?8:4.2)*dt);const x=camera.position.x+move.x,z=camera.position.z+move.z;if(!blocked(x,camera.position.z))camera.position.x=x;if(!blocked(camera.position.x,z))camera.position.z=z;bob+=dt*9;}else bob=0;
  const targetY=height(camera.position.x,camera.position.z)+1.72+Math.sin(bob)*.025;camera.position.y=THREE.MathUtils.lerp(camera.position.y,targetY,Math.min(1,dt*14));
  landmarks.forEach((l,i)=>{if(!discovered.has(i)&&Math.hypot(camera.position.x-l.x,camera.position.z-l.z)<9){discovered.add(i);try{localStorage.setItem('everwild-notes',JSON.stringify([...discovered]));}catch{}updateNotes();toast(`Field note discovered · ${l.name}`);$('explore-message').textContent=l.name+'. Stay a little while.';}});
 }
 particles.position.x=Math.sin(now*.00005)*2;particles.position.y=Math.sin(now*.00012)*.6;
 sun.position.set(camera.position.x-65,100,camera.position.z-80);sun.target.position.set(camera.position.x,0,camera.position.z);
 if(now-mapTimer>120){drawMap();mapTimer=now;}
 updateWeather(now);
 renderer.render(scene,camera);
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
$('loading').remove();requestAnimationFrame(animate);
// Small diagnostic surface for automated smoke tests (no application state mutation).
window.forestDiagnostics=()=>({trees:count,instances:count*19+700+9000+22000+520,position:camera.position.toArray(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,playing:walking,discoveries:discovered.size});

// Only field recordings and recorded voice acting. No synthesized hums or tones.
export function createSoundscape(listener){
 const ctx=listener.context,master=ctx.createGain();master.gain.value=.6;master.connect(listener.getInput());
 const buffers={},failed=[];let steps=0,events=0,spoken=0,windSource,windGain,birdTimer=8,voiceBusy=0;
 const files={grass:'step-grass',snow:'step-snow',birds:'birds',wind:'wind',splash:'splash',fire:'fire-real'};
 async function load(key,path){try{const r=await fetch(path);if(!r.ok)throw Error(r.status);buffers[key]=await ctx.decodeAudioData(await r.arrayBuffer());}catch{failed.push(key);}}
 for(const [k,f] of Object.entries(files))load(k,'./public/audio/'+f+'.mp3');
 for(const n of ['01','02','04','08','11','13','14','15','18','22','23','27','28'])load('v'+n,'./public/audio/voices/'+n+'.mp3');
 function play(key,volume=1,rate=1,pos=null){const b=buffers[key];if(!b||ctx.state!=='running')return 0;const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=b;s.playbackRate.value=rate;g.gain.value=volume;s.connect(g);let p;if(pos){p=ctx.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=2;p.maxDistance=25;p.rolloffFactor=1.5;p.positionX.value=pos.x;p.positionY.value=pos.y+1.5;p.positionZ.value=pos.z;g.connect(p).connect(master);}else g.connect(master);s.start();s.onended=()=>{s.disconnect();g.disconnect();p?.disconnect();};return b.duration/rate;}
 return{
 step(surface,sprint=false){steps++;events++;play(surface==='snow'?'snow':surface==='water'?'splash':'grass',surface==='water'?.17:.30*(sprint?1.15:1),.96+Math.random()*.08);},
 effect(kind){events++;if(['cast','splash','catch','pour'].includes(kind))play('splash',kind==='pour'?.025:.13);else if(kind==='torch')play('fire',.08);else if(kind==='land')play('grass',.25);},
 speak(line,pos){if(ctx.currentTime<voiceBusy)return 0;const d=play('v'+line,.9,1,pos);if(d){spoken++;voiceBusy=ctx.currentTime+d+.7;}return d;},
 update(dt,{volume,season,weather,indoors,day,wind=0}){master.gain.setTargetAtTime(volume*(indoors?.6:1),ctx.currentTime,.2);if(!windSource&&buffers.wind&&ctx.state==='running'){windSource=ctx.createBufferSource();windSource.buffer=buffers.wind;windSource.loop=true;windGain=ctx.createGain();windGain.gain.value=0;windSource.connect(windGain).connect(master);windSource.start();}windGain?.gain.setTargetAtTime(wind*.15,ctx.currentTime,.8);birdTimer-=dt;if(birdTimer<0){birdTimer=12+Math.random()*22;if(day&&season!==3&&weather!=='storm'&&!indoors)play('birds',.12);}},
 call(pos){events++;play('birds',.5,.9+Math.random()*.25,pos);},
 rustle(){events++;play('grass',.12,1.25+Math.random()*.15);},
 diagnostics(){return{steps,events,spoken,recordings:Object.keys(buffers).length,failed,state:ctx.state};}
 };
}

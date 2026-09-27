const {chromium}=require('@playwright/test');
(async()=>{const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-webgl']});try{const p=await b.newPage({viewport:{width:1000,height:700}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.goto('http://localhost:5173/?test=1');await p.waitForFunction(()=>window.forestDiagnostics?.().wildlife.deerLoaded&&forestDiagnostics().heads.every(Boolean)&&forestDiagnostics().frames>3,null,{timeout:90000});await p.evaluate(()=>{simTest.pauseRender(true);simTest.start();simTest.day();simTest.setSeason(0);simTest.setWeather('clear');document.body.classList.add('quiet');});
for(const [name,pos,target,night] of [
 ['living-meadow',[155,2,59],[166,1,49],false],
 ['living-npc',[63,1.66,29],[63,1.65,27],false],
 ['living-pond',[45,2,71],[45,-.4,60],false],
 ['living-fire',[100,1.6,23.2],[100,.5,20],true],
 ['living-cherry',[74,2,53],[77,10,43],false]
]){await p.evaluate(({pos,target,night,name})=>{if(night)simTest.night();else simTest.day();const y=name==='living-pond'?0:simTest.sampleHeight(pos[0],pos[2]);simTest.setCamera(pos[0],y+pos[1],pos[2]);const ty=name==='living-pond'?0:simTest.sampleHeight(target[0],target[2]);simTest.cameraLook(target[0],ty+target[1],target[2]);},{pos,target,night,name});await p.waitForTimeout(350);await p.evaluate(()=>simTest.finishFrame());await p.screenshot({path:`tests/${name}.png`,timeout:90000});}
console.log('Visual errors',errors);console.log(await p.evaluate(()=>forestDiagnostics().wildlife));}finally{await b.close()}})();

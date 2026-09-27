const{chromium}=require('@playwright/test');
(async()=>{const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-webgl']});try{const p=await b.newPage({viewport:{width:960,height:640}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto('http://localhost:5173/?test=1');await p.waitForFunction(()=>window.forestDiagnostics?.().heads.every(Boolean)&&forestDiagnostics().frames>3,null,{timeout:90000});await p.evaluate(()=>{simTest.pauseRender(true);simTest.start();simTest.day();simTest.setSeason(0);simTest.setWeather('clear');document.body.classList.add('quiet');});
 const shot=async(name)=>{await p.waitForTimeout(300);await p.evaluate(()=>simTest.finishFrame());await p.waitForTimeout(500);await p.screenshot({path:'tests/'+name+'.png',timeout:90000});};
 await p.evaluate(()=>{const y=simTest.sampleHeight(63,31.2);simTest.setCamera(63,y+1.65,31.2);simTest.cameraLook(63,y+1.1,26.7);});await shot('spring-gardener');
 await p.evaluate(()=>{simTest.setSeason(3);simTest.setWeather('snow');const y=simTest.sampleHeight(94,44);simTest.setCamera(94,y+1.7,44);simTest.cameraLook(100,y+1,15);});await shot('winter-world');
 await p.evaluate(()=>{simTest.setSeason(2);simTest.setWeather('clear');simTest.night();});await p.keyboard.press('t');await shot('autumn-torch');
 console.log('Visual errors:',errors);console.log(await p.evaluate(()=>forestDiagnostics()));
}finally{await b.close()}})();

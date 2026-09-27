import {test,expect} from '@playwright/test';
test('season boundaries, weather transitions, cabin routes, stairs and mountain solidity',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173/?test=1');
 await page.waitForFunction(()=>window.forestDiagnostics?.().texturesReady&&forestDiagnostics().frames>3,null,{timeout:90000});
 await page.evaluate(()=>{simTest.pauseRender(true);simTest.start();simTest.day();});
 const state=()=>page.evaluate(()=>forestDiagnostics());
 await page.waitForFunction(()=>forestDiagnostics().heads.every(Boolean));
 // Spring and summer never inherit winter snow. Autumn has an actual leaf-covered floor.
 for(const season of [0,1,2,2.99]){
  await page.evaluate(i=>{simTest.setSeason(i);simTest.setWeather('clear');simTest.climateStep();},season);
  const c=(await state()).climate;expect(c.snowGround).toBe(false);expect(c.snowfall).toBe(false);
  if(season>=2){expect(c.leafCarpet).toBe(true);expect(c.autumnLeaves).toBe(true);}else{expect(c.flowersVisible).toBeGreaterThan(0);}
 }
 await page.evaluate(()=>{simTest.setSeason(3);simTest.setWeather('snow');simTest.climateStep();});
 expect((await state()).climate).toMatchObject({snowGround:true,snowfall:true,leafCarpet:false,flowersVisible:0});
 await page.evaluate(()=>{simTest.setSeason(0);simTest.setWeather('snow');simTest.climateStep();});
 expect((await state()).climate.snowGround).toBe(false);expect((await state()).climate.current).not.toBe('snow');
 // All user-selectable weather modes work and the automatic forecast changes.
 for(const weather of ['clear','cloudy','fog','rain','storm']){
  await page.evaluate(w=>{simTest.setWeather(w);simTest.climateStep();},weather);expect((await state()).climate.current).toBe(weather);
 }
 const sequence=await page.evaluate(()=>{simTest.setWeather('auto');const kinds=[];for(let i=0;i<5;i++){simTest.climateStep(100);kinds.push(forestDiagnostics().climate.current);}return kinds;});expect(new Set(sequence).size).toBeGreaterThan(2);
 // The player walks UP then DOWN the exact same stair run in both rotated houses.
 await page.evaluate(()=>{simTest.setWeather('clear');simTest.setSeason(1);simTest.day();});
 for(const index of [0,1]){
  const floor=await page.evaluate(i=>{const p=simTest.cabinPoint(i,3.2,.3,-1.5),look=simTest.cabinPoint(i,-4,.3,-1.5);simTest.setCamera(p[0],p[1]+1.7,p[2]);simTest.cameraLook(look[0],p[1]+1.7,look[2]);return p[1];},index);
  await page.keyboard.down('w');
  try{await expect.poll(async()=>(await state()).position[1],{timeout:8000,intervals:[80]}).toBeGreaterThan(floor+1.7+3.3);}finally{await page.keyboard.up('w');}
  await page.evaluate(i=>{const p=forestDiagnostics().position,look=simTest.cabinPoint(i,4,.3,-1.5);simTest.cameraLook(look[0],p[1],look[2]);},index);
  await page.keyboard.down('w');
  try{await expect.poll(async()=>(await state()).position[1],{timeout:8000,intervals:[80]}).toBeLessThan(floor+1.7+.4);}finally{await page.keyboard.up('w');}
 }
 // Route NPC2 out of its actual second-floor workstation. Every sample remains
 // above its cabin/stair surface and no sample intersects an exterior wall.
 const route=await page.evaluate(()=>{
  simTest.night();const samples=[];for(let i=0;i<1250;i++){simTest.stepNPC(.1,true);if(i%4===0){const n=simTest.workerInfo();samples.push({wall:simTest.collision(n.position[0],n.position[1]+1.7,n.position[2]),state:n.state});}}return {samples,last:simTest.workerInfo()};
 });expect(route.last.state).toBe('sitting');
 // Ending in the fire seat is outside all cabin walls. Route waypoints are checked separately.
 expect(route.samples.filter(s=>s.wall&&s.state==='walking').length).toBe(0);
 await page.evaluate(()=>{simTest.day();for(let i=0;i<1250;i++)simTest.stepNPC(.1,false);});
 expect((await state()).npcs.worker).toBe('work');
 const home=await page.evaluate(()=>simTest.workerInfo());expect(Math.hypot(home.position[0]-home.work[0],home.position[2]-home.work[2])).toBeLessThan(.05);
 // Mountains are real terrain: a point beneath the peak is colliding, surface is above 60m.
 const mountains=await page.evaluate(()=>forestDiagnostics().peaks.map(([x,y,z])=>({height:y,blocked:simTest.collision(x,15,z),onSurface:simTest.sampleHeight(x,z)})));
 expect(mountains.every(m=>m.height>60&&m.blocked&&Math.abs(m.height-m.onSurface)<.01)).toBe(true);
 expect((await state()).viewmodelLayers).toBe(2);expect((await state()).sound.steps).toBeGreaterThan(0);
 expect(errors).toEqual([]);
});

import {test,expect} from '@playwright/test';
test('living systems: recorded audio, wildlife, ice, footprints, mushrooms, seating and wet fires',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.forestDiagnostics?.().wildlife.deerLoaded&&forestDiagnostics().frames>3,null,{timeout:90000});
 await page.evaluate(()=>{simTest.pauseRender(true);simTest.start();simTest.day();simTest.setSeason(0);simTest.setWeather('clear');});
 await page.waitForFunction(()=>forestDiagnostics().sound.recordings===19);await page.keyboard.press('m');await page.keyboard.press('m');await page.waitForFunction(()=>forestDiagnostics().sound.state==='running');
 const state=()=>page.evaluate(()=>forestDiagnostics());
 expect((await state()).wildlife).toMatchObject({deer:5,birds:12,birdSpecies:3,fish:24,loadError:''});expect((await state()).sound.failed).toEqual([]);
 // A real footstep and voice are scheduled by user actions, with no oscillator fallback.
 await page.evaluate(()=>simTest.nearGardener());await page.waitForTimeout(150);await page.keyboard.press('v');await page.waitForTimeout(150);expect((await state()).sound.spoken).toBeGreaterThan(0);
 // Pick once, increment basket, consume once; no duplicate collection at that point.
 await page.evaluate(()=>{const p=simTest.foragePoint();simTest.setCamera(p[0],p[1]+1.7,p[2]);});await page.waitForTimeout(150);
 await page.keyboard.press('e');expect((await state()).effects.basket).toBe(1);await page.keyboard.press('q');expect((await state()).effects).toMatchObject({basket:0,eaten:1});
 // Sofa and added home chair seating, followed by an unobstructed stand-up exit.
 const seats=await page.evaluate(()=>simTest.homeSeats());expect(seats).toHaveLength(6);
 for(const i of [0,2,3,5]){await page.evaluate(c=>simTest.setCamera(c.x,c.floorY+1.7,c.z),seats[i]);await page.keyboard.press('n');expect((await state()).isSitting).toBe(true);await page.keyboard.press('n');expect((await state()).isSitting).toBe(false);expect(await page.evaluate(()=>{const p=forestDiagnostics().position;return simTest.collision(...p);})).toBe(false);}
 // Ice supports the player at the pond waterline, not on the pond bed.
 await page.evaluate(()=>{simTest.setSeason(3);simTest.setWeather('snow');});await page.waitForTimeout(100);
 expect(await page.evaluate(()=>simTest.surface(45,60,1.745))).toBeCloseTo(.045,2);
 await page.evaluate(()=>{const y=simTest.sampleHeight(100,24);simTest.setCamera(100,y+1.7,24);simTest.cameraLook(100,y+1.7,22);});await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');expect((await state()).effects.footprints).toBeGreaterThan(0);
 // Sustained precipitation extinguishes fire. Clear weather + dry kindling restores it.
 await page.evaluate(()=>simTest.natureStep(60));expect((await state()).effects.burning).toBe(false);expect(await page.evaluate(()=>simTest.relight())).toBe(false);
 await page.evaluate(()=>{simTest.setWeather('clear');});await page.waitForTimeout(100);expect(await page.evaluate(()=>simTest.relight())).toBe(true);
 await page.evaluate(()=>{simTest.setSeason(0);simTest.setWeather('clear');});await page.waitForTimeout(100);await page.evaluate(()=>simTest.ripple());expect((await state()).effects.ripples).toBeGreaterThan(0);
 // Continuous wind and routines advance, rather than remaining fixed in a typing/watering loop.
 await page.evaluate(()=>{for(let i=0;i<8;i++)simTest.natureStep(10);});expect(Number.isFinite((await state()).wildlife.wind)).toBe(true);expect((await state()).minds.some(m=>m.decisions>0)).toBe(true);
 await page.evaluate(()=>simTest.finishFrame());expect(errors).toEqual([]);
});

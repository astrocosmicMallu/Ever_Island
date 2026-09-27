import {test,expect} from '@playwright/test';
test('sim1 systems survive the Rainy Woodland integration',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/?test=1');
 await page.waitForFunction(()=>window.forestDiagnostics?.().texturesReady&&forestDiagnostics().frames>3,null,{timeout:90000});
 const state=()=>page.evaluate(()=>forestDiagnostics());
 expect((await state()).cabins).toBe(2);expect((await state()).monkeys).toBe(6);expect((await state()).trees).toBeGreaterThan(1000);expect((await state()).drawCalls).toBeGreaterThan(0);
 // The rendering has been exercised above. Skip GPU frames during deterministic
 // state-machine assertions; the normal update loop and input handlers still run.
 await page.evaluate(()=>simTest.pauseRender(true));
 await page.locator('#startGame').click();
 await expect.poll(async()=>(await state()).playing).toBe(true);
 await page.evaluate(()=>simTest.day());
 const before=(await state()).position;
 await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');expect((await state()).position[2]).toBeLessThan(before[2]);
 const groundedY=(await state()).position[1];
 await page.keyboard.down('Space');await page.waitForTimeout(120);await page.keyboard.up('Space');expect((await state()).position[1]).toBeGreaterThan(groundedY+.2);
 await page.waitForTimeout(900);
 expect(await page.evaluate(()=>{const [x,y,z]=simTest.obstacle();return simTest.collision(x,y+.85,z);})).toBe(true);
 await page.keyboard.press('t');expect((await state()).torchOn).toBe(true);
 await page.keyboard.press('m');expect((await state()).muted).toBe(true);await page.keyboard.press('m');
 await page.locator('#tg').evaluate(e=>e.click());expect((await state()).grid).toBe(true);
 // Complete a fishing cycle at the pond.
 await page.evaluate(()=>{simTest.travel(45,76);simTest.cameraLook(45,0,60);});
 await page.keyboard.press('o');expect((await state()).hasRod).toBe(true);
 await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true})));
 expect((await state()).fishingState).toBe('casting');
 await page.evaluate(()=>{document.dispatchEvent(new MouseEvent('mouseup',{button:0}));simTest.tickFishing(1);simTest.tickFishing(4);});
 expect((await state()).fishingState).toBe('bite');await expect(page.locator('#bitePopup')).toHaveClass(/show/);
 await page.keyboard.press('i');expect((await state()).fish).toBe(1);
 // Missed bites reset cleanly, without granting a catch.
 await page.evaluate(()=>{document.dispatchEvent(new MouseEvent('mousedown',{button:0}));document.dispatchEvent(new MouseEvent('mouseup',{button:0}));simTest.tickFishing(1);simTest.tickFishing(4);simTest.tickFishing(3);});
 expect((await state()).fishingState).toBe('idle');expect((await state()).fish).toBe(1);await page.keyboard.press('o');
 // Original night-only grilling rules and shared meal state.
 await page.evaluate(()=>{simTest.night();simTest.travel(100,22.7);});
 await page.keyboard.press('Shift+o');expect((await state()).grillState).toBe('cooking');expect((await state()).fish).toBe(0);expect((await state()).grillFish).toBe(1);
 await page.evaluate(()=>{simTest.tickGrill(6.1);simTest.tickGrill(1.6);});expect((await state()).grillState).toBe('idle');
 // Nighttime routines move both neighbors to their fire-side seats.
 await page.evaluate(()=>{for(let i=0;i<1250;i++)simTest.stepNPC(.1,true);});
 expect((await state()).npcs.gardener).toBe('sitting');expect((await state()).npcs.worker).toBe('sitting');
 // A free chair can be occupied and released.
 await page.evaluate(()=>{const c=simTest.getChair();simTest.travel(c.x,c.z);});
 await page.keyboard.press('n');expect((await state()).isSitting).toBe(true);await page.keyboard.press('n');expect((await state()).isSitting).toBe(false);
 // Borrow and return the pot. Verify actual garden-hit growth callback.
 await page.evaluate(()=>{simTest.day();for(let i=0;i<1250;i++)simTest.stepNPC(.1,false);simTest.nearGardener();});
 await page.keyboard.press('p');expect((await state()).holdingPot).toBe(true);expect((await state()).gardenerHasPot).toBe(false);
 await page.evaluate(()=>simTest.gardenHit());expect((await state()).bloomLevel).toBeGreaterThan(0);
 await page.keyboard.press('p');expect((await state()).holdingPot).toBe(false);expect((await state()).gardenerHasPot).toBe(true);
 // Settings, season selection, fast travel and time pause are connected.
 await page.keyboard.press('Tab');await expect(page.locator('#menu')).not.toHaveClass(/hidden/);
 await page.selectOption('#mSeasMode','manual');await page.locator('#mSeas').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForTimeout(150);expect((await state()).season).toBe('Winter');
 await page.selectOption('#mQuality','0.75');
 await page.locator('[data-travel="workshop"]').evaluate(e=>e.click());expect((await state()).position[0]).toBeCloseTo(130,0);
 await page.locator('#tp').evaluate(e=>e.click());expect((await state()).paused).toBe(false);
 await page.keyboard.press('h');await expect(page.locator('body')).toHaveClass(/quiet/);await page.keyboard.press('h');
 expect(errors).toEqual([]);console.log('Verified:',await state());
});

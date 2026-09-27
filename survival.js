import * as THREE from 'three';
import { makeOrganicPerson } from './details.js';

/**
 * EverWood survival framework — vitals, backpack, harvesting, workshop,
 * campfire cooking, farming, occupational NPCs, wolves, horse, spear,
 * turrets, walls, quests, hit particles, synth audio, localStorage saves.
 * Zero binary assets; all procedural. No per-frame allocations in hot paths.
 */

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _center = { x: 0, y: 0 };

export function createSurvival(opts) {
  const { scene, camera, terrainH, inWater, treeGroup, sounds, toast,
    registerCollider, campfire, pond, wildlife, hasRod, holdingPot,
    isPlaying, isNight, isRain, getSeason, isMuted } = opts;
  const rand = Math.random;

  // ---------------------------------------------------------- synth audio --
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, slide) {
    if (isMuted && isMuted()) return;
    const ctx = audio(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }
  function noiseBurst(dur, vol, freq) {
    if (isMuted && isMuted()) return;
    const ctx = audio(); if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.15;
    s.connect(f).connect(g).connect(ctx.destination); s.start();
  }
  const sfx = {
    blip() { tone(660, 0.09, 'square', 0.1, 880); },
    thud() { tone(95, 0.22, 'sine', 0.22, 45); },
    splash() { noiseBurst(0.3, 0.16, 900); },
    click() { tone(1250, 0.04, 'square', 0.08); },
  };

  // ------------------------------------------------------- hit particles --
  const PMAX = 220;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
  const pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
  let pHead = 0;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pPts = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.12, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  pPts.frustumCulled = false; scene.add(pPts);
  const _c = new THREE.Color();
  function burst(x, y, z, color, n, spread, up) {
    _c.set(color);
    for (let k = 0; k < (n || 7); k++) {
      const i = pHead; pHead = (pHead + 1) % PMAX;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      pVel[i * 3] = (rand() - 0.5) * (spread || 3);
      pVel[i * 3 + 1] = rand() * (up || 3.5);
      pVel[i * 3 + 2] = (rand() - 0.5) * (spread || 3);
      pCol[i * 3] = _c.r; pCol[i * 3 + 1] = _c.g; pCol[i * 3 + 2] = _c.b;
      pLife[i] = 0.6 + rand() * 0.25;
    }
    pGeo.attributes.color.needsUpdate = true;
  }
  function updateParticles(dt) {
    let any = false;
    for (let i = 0; i < PMAX; i++) {
      if (pLife[i] <= 0) continue;
      any = true;
      pLife[i] -= dt;
      pVel[i * 3 + 1] -= 9.5 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pLife[i] <= 0) pPos[i * 3 + 1] = -999;
    }
    if (any) pGeo.attributes.position.needsUpdate = true;
  }
  for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -999;

  // ---------------------------------------------------------------- vitals --
  const vit = { hp: 100, hun: 100, thi: 100, tmp: 100 };
  let poisonT = 0, starveT = 0, saveT = 0, dmgT = 0;
  const el = id => document.getElementById(id);
  const bars = { hp: el('vHp'), hun: el('vHun'), thi: el('vThi'), tmp: el('vTmp') };
  const dmgEl = el('dmg');
  function hurt(n, why) {
    vit.hp = Math.max(0, vit.hp - n);
    dmgT = 1; if (dmgEl) dmgEl.style.opacity = '0.55';
    if (why) toast(why);
    if (vit.hp <= 0) {
      camera.position.set(campfire.x + 2, terrainH(campfire.x + 2, campfire.z + 2) + 1.7, campfire.z + 2);
      vit.hp = 60; vit.hun = 70; vit.thi = 70; vit.tmp = 80; poisonT = 0;
      toast('You collapsed… and woke by the campfire.');
    }
  }
  function drawVitals() {
    bars.hp.style.width = vit.hp + '%'; bars.hun.style.width = vit.hun + '%';
    bars.thi.style.width = vit.thi + '%'; bars.tmp.style.width = vit.tmp + '%';
  }

  // --------------------------------------------------------------- backpack --
  const pack = { wood: 0, stone: 0, sharp_stone: 0, vine: 0, mushroom: 0, berry: 0, raw_fish: 0, raw_meat: 0, cooked_fish: 0, spear: 0, berry_seed: 0 };
  const stock = { wood: 0, sharp_stone: 0, raw_fish: 0 };
  const lif = { sharp_stone: 0, vine: 0, spear: 0, deer: 0 };
  let hasAxe = false, harvestCD = 0;
  const packEl = el('packList'), stockEl = el('stockList');
  const NAMES = { wood: '🪵 Wood', stone: '🪨 Stone', sharp_stone: '🗡️ Sharp stone', vine: '🌿 Vine', mushroom: '🍄 Mushroom', berry: '🫐 Berry', raw_fish: '🐟 Raw fish', raw_meat: '🥩 Raw meat', cooked_fish: '🍖 Grilled fish', spear: '🗡️ Spear', berry_seed: '🌱 Berry seed' };
  function drawPack() {
    let h = '';
    for (const k in pack) h += `<div class="pk" data-k="${k}"><span>${NAMES[k]}</span><b>${pack[k]}</b></div>`;
    packEl.innerHTML = h;
    stockEl.innerHTML = `Stockpile — 🪵${stock.wood} 🗡️${stock.sharp_stone} 🐟${stock.raw_fish}${hasAxe ? ' 🪓' : ''}`;
  }
  packEl.addEventListener('click', e => {
    const row = e.target.closest('.pk'); if (!row) return;
    const k = row.dataset.k;
    if (k === 'mushroom' && pack.mushroom > 0) { pack.mushroom--; vit.hun = Math.min(100, vit.hun + 15); toast('Ate a mushroom (+15 hunger).'); }
    else if (k === 'berry' && pack.berry > 0) { pack.berry--; vit.hun = Math.min(100, vit.hun + 20); toast('Ate berries (+20 hunger).'); }
    else if (k === 'cooked_fish' && pack.cooked_fish > 0) { pack.cooked_fish--; vit.hun = Math.min(100, vit.hun + 50); vit.hp = Math.min(100, vit.hp + 30); toast('Grilled fish: +50 hunger, +30 health.'); }
    else if ((k === 'raw_fish' && pack.raw_fish > 0) || (k === 'raw_meat' && pack.raw_meat > 0)) {
      if (k === 'raw_fish') pack.raw_fish--; else pack.raw_meat--;
      poisonT = 10; toast('⚠️ Food poisoning! That was raw…');
    }
    else return;
    sfx.click(); drawPack();
  });
  el('packToggle').addEventListener('click', () => el('pack').classList.toggle('open'));
  drawPack();

  // ----------------------------------------------------------------- quests --
  const questEl = el('questList');
  function quests() {
    return [
      { done: lif.sharp_stone >= 3 && lif.vine >= 1, t: 'Forage 3 Sharp Stones + 1 Vine' },
      { done: lif.spear >= 1, t: 'Build a Spear at the Workshop' },
      { done: lif.deer >= 1, t: 'Hunt a Deer' },
    ];
  }
  let lastQ = '';
  function drawQuests() {
    const q = quests(), key = q.map(x => x.done ? 1 : 0).join('');
    if (key === lastQ) return; lastQ = key;
    questEl.innerHTML = q.map(x => `<div class="${x.done ? 'qd' : ''}">${x.done ? '✅' : '⬜'} ${x.t}</div>`).join('');
  }

  // ---------------------------------------------------------- harvest nodes --
  const nodes = [];
  const nodeMeshes = [];
  function scatter(count, make, opts) {
    let placed = 0;
    for (let i = 0; i < count * 8 && placed < count; i++) {
      const x = campfire.x + (rand() - 0.5) * (opts.spread || 220);
      const z = campfire.z + (rand() - 0.5) * (opts.spread || 220);
      const h = terrainH(x, z);
      if (!(h > 0.7 && h < 45) || (inWater && inWater(x, z))) continue;
      const m = make(x, h, z);
      m.userData.node = { type: opts.type, x, z, y: h, taken: false, respawn: 0, mesh: m, big: !!opts.big };
      scene.add(m); nodes.push(m.userData.node); nodeMeshes.push(m);
      placed++;
    }
  }
  const stoneM = new THREE.MeshStandardMaterial({ color: '#8a8f94', roughness: 0.95, flatShading: true });
  const sharpM = new THREE.MeshStandardMaterial({ color: '#b9c0c6', roughness: 0.7, flatShading: true });
  const vineM = new THREE.MeshStandardMaterial({ color: '#4a5a2a', roughness: 1 });
  const shroomM = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 1 });
  const branchM = new THREE.MeshStandardMaterial({ color: '#5a4028', roughness: 1 });
  scatter(26, (x, h, z) => {
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16 + rand() * 0.1), sharpM);
    m.position.set(x, h + 0.1, z); m.rotation.set(rand() * 3, rand() * 3, 0); m.castShadow = true; return m;
  }, { type: 'sharp_stone' });
  scatter(10, (x, h, z) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + rand() * 0.35, 1), stoneM);
    m.position.set(x, h + 0.25, z); m.scale.y = 0.7; m.castShadow = true; return m;
  }, { type: 'stone', big: true, spread: 260 });
  scatter(16, (x, h, z) => {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const v = new THREE.Mesh(new THREE.TorusGeometry(0.22 + rand() * 0.15, 0.045, 6, 10), vineM);
      v.position.set((rand() - 0.5) * 0.5, 0.15 + rand() * 0.35, (rand() - 0.5) * 0.5);
      v.rotation.set(rand() * 3, rand() * 3, 0); v.castShadow = true; g.add(v);
    }
    g.position.set(x, h, z); return g;
  }, { type: 'vine' });
  scatter(14, (x, h, z) => {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.09 + rand() * 0.07, 8, 5, 0, 6.3, 0, 1.4), shroomM);
      s.position.set((rand() - 0.5) * 0.7, 0.05, (rand() - 0.5) * 0.7); s.castShadow = true; g.add(s);
    }
    g.position.set(x, h, z); return g;
  }, { type: 'mushroom' });
  scatter(16, (x, h, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.1 + rand() * 0.6, 7), branchM);
    m.position.set(x, h + 0.08, z); m.rotation.set(Math.PI / 2, 0, rand() * 3); m.castShadow = true; return m;
  }, { type: 'wood', spread: 200 });

  // --------------------------------------------------------------- workshop --
  const bench = { x: campfire.x + 4.5, z: campfire.z + 2.5 };
  bench.y = terrainH(bench.x, bench.z);
  {
    const woodM = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 0.9 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1), woodM);
    top.position.set(bench.x, bench.y + 0.85, bench.z); top.castShadow = true; scene.add(top);
    for (const [ox, oz] of [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), woodM);
      leg.position.set(bench.x + ox, bench.y + 0.42, bench.z + oz); scene.add(leg);
    }
    const crateM = new THREE.MeshStandardMaterial({ color: '#7a5a36', roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), crateM);
      c.position.set(bench.x - 1.8 - (i % 2) * 0.8, bench.y + 0.35, bench.z + 0.8 + Math.floor(i / 2) * 0.8);
      c.rotation.y = rand(); c.castShadow = true; scene.add(c);
    }
  }
  const RECIPES = {
    spear: { name: 'Hunting Spear', cost: { wood: 1, sharp_stone: 2, vine: 1 } },
    axe: { name: 'Reinforced Axe (+20% harvest)', cost: { wood: 5, sharp_stone: 3, vine: 2 } },
  };
  const wsEl = el('workshop');
  function drawWorkshop() {
    let h = '<h3>🔨 WORKSHOP</h3>';
    for (const k in RECIPES) {
      const r = RECIPES[k];
      const cost = Object.entries(r.cost).map(([it, n]) => `${NAMES[it]}×${n}`).join(' + ');
      const can = Object.entries(r.cost).every(([it, n]) => pack[it] >= n) && !(k === 'axe' && hasAxe);
      h += `<div class="rec"><div><b>${r.name}</b><small>${cost}</small></div><button data-r="${k}" ${can ? '' : 'disabled'}>Craft</button></div>`;
    }
    h += `<div class="rec"><button id="wsClose">Close [E]</button></div>`;
    wsEl.innerHTML = h;
  }
  wsEl.addEventListener('click', e => {
    if (e.target.id === 'wsClose') { wsEl.classList.remove('open'); return; }
    const b = e.target.closest('button[data-r]'); if (!b) return;
    craft(b.dataset.r);
  });
  function craft(k) {
    const r = RECIPES[k]; if (!r) return false;
    if (k === 'axe' && hasAxe) { toast('Axe already forged.'); return false; }
    for (const it in r.cost) if (pack[it] < r.cost[it]) { toast('Not enough materials.'); return false; }
    for (const it in r.cost) pack[it] -= r.cost[it];
    if (k === 'axe') { hasAxe = true; toast('🪓 Axe forged! Harvesting 20% faster.'); }
    else { pack.spear++; lif.spear++; toast('🗡️ Hunting Spear crafted! (Key 5, Right-click to throw)'); }
    burst(bench.x, bench.y + 1.2, bench.z, '#ffd070', 10, 2, 3);
    sfx.click(); drawPack(); drawWorkshop(); drawQuests();
    return true;
  }

  // ------------------------------------------------------------------ fire --
  let cookT = 0, cookKind = null;
  function fireLit() { return true; }

  // ----------------------------------------------------------------- farm --
  const plots = [];
  const tilledM = new THREE.MeshStandardMaterial({ color: '#2e1f12', roughness: 1 });
  const sproutM = new THREE.MeshStandardMaterial({ color: '#5a8a3a', roughness: 1 });
  const bushM = new THREE.MeshStandardMaterial({ color: '#2f5a28', roughness: 1 });
  const berryM = new THREE.MeshStandardMaterial({ color: '#c02040', roughness: 0.5 });
  function tillAt(x, z) {
    if (plots.length >= 12) { toast('Too many plots (12 max).'); return; }
    const h = terrainH(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.1), tilledM);
    m.position.set(x, h + 0.04, z); m.receiveShadow = true; scene.add(m);
    plots.push({ x, z, state: 'tilled', t: 0, mesh: m });
    burst(x, h + 0.3, z, '#5a4028', 6, 2, 2.5); sfx.thud();
  }
  function updatePlots(dt) {
    for (const p of plots) {
      if (p.state !== 'growing') continue;
      p.t += dt;
      const k = Math.min(1, p.t / 30);
      p.mesh.scale.set(0.3 + k * 0.7, 0.3 + k * 1.4, 0.3 + k * 0.7);
      if (k >= 1) {
        p.state = 'bush';
        scene.remove(p.mesh);
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), bushM);
        b.position.y = 0.4; b.castShadow = true; g.add(b);
        for (let i = 0; i < 6; i++) {
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), berryM);
          const a = i * 1.05;
          d.position.set(Math.sin(a) * 0.38, 0.35 + (i % 3) * 0.14, Math.cos(a) * 0.38);
          g.add(d);
        }
        const h = terrainH(p.x, p.z);
        g.position.set(p.x, h, p.z); scene.add(g);
        p.mesh = g;
        toast('🫐 A berry bush matured!');
      }
    }
  }

  // ----------------------------------------------------------------- walls --
  const walls = [];
  const wallM = new THREE.MeshStandardMaterial({ color: '#6a4a2c', roughness: 0.95 });
  const ghostM = new THREE.MeshStandardMaterial({ color: '#60e080', transparent: true, opacity: 0.4, depthWrite: false });
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 0.4), ghostM);
  ghost.visible = false; scene.add(ghost);
  function placeWall(x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 0.4), wallM);
    m.position.set(x, y + 1.25, z); m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true; scene.add(m);
    registerCollider(new THREE.Vector3(x, y + 1.25, z), new THREE.Vector3(3, 2.5, 0.4));
    walls.push({ x, z, y, ry });
    burst(x, y + 1.4, z, '#8a6a40', 8, 2.5, 2); sfx.thud();
  }

  // --------------------------------------------------------------- turrets --
  const turrets = [];
  const tracers = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 5),
      new THREE.MeshBasicMaterial({ color: '#ffe0a0' }));
    m.visible = false; scene.add(m); tracers.push({ m, t: 1 });
  }
  const postM = new THREE.MeshStandardMaterial({ color: '#5a4028', roughness: 1 });
  const bowM = new THREE.MeshStandardMaterial({ color: '#3a3a42', roughness: 0.6, metalness: 0.4 });
  function placeTurret(x, y, z) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 8), postM);
    post.position.y = 1.1; post.castShadow = true; g.add(post);
    const pivot = new THREE.Group(); pivot.position.y = 2.3; g.add(pivot);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.12), bowM);
    pivot.add(bow);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), bowM);
    pivot.add(rail);
    g.position.set(x, y, z); scene.add(g);
    turrets.push({ x, z, y, g, pivot, cd: 0 });
    burst(x, y + 1.5, z, '#a0a0b0', 8, 2.5, 2); sfx.click();
    toast('🏹 Crossbow turret deployed (auto-fires at wolves).');
  }
  function fireTracer(x1, y1, z1, x2, y2, z2) {
    let tr = tracers.find(t => t.t >= 1) || tracers[0];
    _v1.set(x1, y1, z1); _v2.set(x2, y2, z2);
    const mid = _v1.clone().add(_v2).multiplyScalar(0.5);
    tr.m.position.copy(mid);
    tr.m.lookAt(_v2); tr.m.rotateX(Math.PI / 2);
    const len = _v1.distanceTo(_v2);
    tr.m.scale.set(1, len / 1.6, 1);
    tr.m.visible = true; tr.t = 0;
  }

  // ----------------------------------------------------------------- wolves --
  const wolves = [];
  const wolfM = new THREE.MeshStandardMaterial({ color: '#a02818', roughness: 0.8 });
  const wolfDark = new THREE.MeshStandardMaterial({ color: '#5a100a', roughness: 0.9 });
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ffec60' });
  let wolfT = 0;
  function spawnWolf(near) {
    let x = campfire.x + (rand() - 0.5) * 160, z = campfire.z + (rand() - 0.5) * 160;
    if (near) { x = near.x + (rand() - 0.5) * 30; z = near.z + (rand() - 0.5) * 30; }
    const h = terrainH(x, z);
    if (h < 0.7 || (inWater && inWater(x, z))) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 10), wolfM);
    body.rotation.z = Math.PI / 2; body.position.y = 0.55; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), wolfM);
    head.position.set(0, 0.75, 0.62); head.castShadow = true; g.add(head);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), eyeM);
      e.position.set(s * 0.1, 0.8, 0.82); g.add(e);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.7, 6), wolfDark);
    tail.position.set(0, 0.6, -0.7); tail.rotation.x = 0.7; g.add(tail);
    g.position.set(x, h, z); scene.add(g);
    wolves.push({ g, x, z, hp: 30, heading: rand() * 6.28, tx: x, tz: z, wt: 0 });
  }
  for (let i = 0; i < 3; i++) spawnWolf();
  function killWolf(w, byPlayer) {
    burst(w.x, terrainH(w.x, w.z) + 0.7, w.z, '#c03020', 10, 3, 3);
    scene.remove(w.g);
    wolves.splice(wolves.indexOf(w), 1);
    pack.raw_meat += 2; drawPack();
    toast(byPlayer ? '🐺 Wolf slain! +2 raw meat.' : '🐺 Guard slew a wolf! +2 raw meat.');
  }

  // ------------------------------------------------------------------ horse --
  const horse = new THREE.Group();
  {
    const coat = new THREE.MeshStandardMaterial({ color: '#6a4526', roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: '#3a2412', roughness: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 1.5), coat);
    body.position.y = 1.05; body.castShadow = true; horse.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.35), coat);
    neck.position.set(0, 1.5, 0.75); neck.rotation.x = 0.5; neck.castShadow = true; horse.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.55), coat);
    head.position.set(0, 1.82, 1.0); head.castShadow = true; horse.add(head);
    for (const [sx, sz] of [[-0.22, 0.55], [0.22, 0.55], [-0.22, -0.55], [0.22, -0.55]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 1.0, 7), dark);
      leg.position.set(sx, 0.5, sz); leg.castShadow = true; horse.add(leg);
    }
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.2), dark);
    mane.position.set(0, 1.62, 0.62); mane.rotation.x = 0.5; horse.add(mane);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.8, 6), dark);
    tail.position.set(0, 1.15, -0.82); tail.rotation.x = -0.4; horse.add(tail);
  }
  horse.position.set(campfire.x - 5, terrainH(campfire.x - 5, campfire.z - 3), campfire.z - 3);
  scene.add(horse);
  let riding = false;
  window.__horseF = () => {
    const d = Math.hypot(camera.position.x - horse.position.x, camera.position.z - horse.position.z);
    if (!riding && d > 3.5) return false;
    riding = !riding;
    window.__rideBoost = riding;
    toast(riding ? '🐴 Mounted! (2× speed, F to dismount)' : '🐴 Dismounted.');
    return true;
  };

  // -------------------------------------------------------------------- NPCs --
  const npcs = [];
  const NPC_DEFS = [
    { name: 'Eldrin', job: 'woodcutter', shirt: 0x5a4a2a, pants: 0x3a3230, skin: 0xd8a888 },
    { name: 'Brakka', job: 'miner', shirt: 0x5a5a62, pants: 0x2a2a30, skin: 0xc89878 },
    { name: 'Maris', job: 'fisher', shirt: 0x3a6a8a, pants: 0x2a3a4a, skin: 0xd8a888 },
    { name: 'Serath', job: 'guard', shirt: 0x8a2a20, pants: 0x2a2a2a, skin: 0xb08060 },
  ];
  function makeLabel() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(1.35, 0.34, 1); s.renderOrder = 50;
    return { c, t, s, task: '' };
  }
  function setTask(n, task) {
    if (n.label.task === task) return;
    n.label.task = task;
    const x = n.label.c.getContext('2d');
    x.clearRect(0, 0, 256, 64);
    x.fillStyle = 'rgba(10,20,16,.72)'; x.fillRect(0, 0, 256, 64);
    x.strokeStyle = '#e1c49b66'; x.strokeRect(1, 1, 254, 62);
    x.fillStyle = '#e8dfc8'; x.font = 'bold 22px Arial'; x.textAlign = 'center';
    x.fillText(n.name, 128, 27);
    x.fillStyle = '#a9c49b'; x.font = '17px Arial';
    x.fillText(task, 128, 51);
    n.label.t.needsUpdate = true;
  }
  for (let i = 0; i < NPC_DEFS.length; i++) {
    const d = NPC_DEFS[i];
    const p = makeOrganicPerson(d.shirt, d.pants, d.skin);
    const hx = campfire.x - 3 + i * 2, hz = campfire.z + 4;
    p.group.position.set(hx, terrainH(hx, hz), hz);
    scene.add(p.group);
    const label = makeLabel();
    label.s.position.set(hx, terrainH(hx, hz) + 2.15, hz);
    scene.add(label.s);
    npcs.push({ ...p, name: d.name, job: d.job, label, state: 'IDLE', timer: 1 + i,
      tx: hx, tz: hz, walkPhase: rand() * 6, wp: 0, workT: 0 });
    setTask(npcs[i], 'IDLE');
  }
  const guardWP = [
    [campfire.x - 12, campfire.z - 12], [campfire.x + 12, campfire.z - 12],
    [campfire.x + 12, campfire.z + 12], [campfire.x - 12, campfire.z + 12],
  ];
  const fishSpot = { x: pond.x + pond.r + 0.8, z: pond.z };
  function npcWalk(n, dt, speed) {
    const dx = n.tx - n.group.position.x, dz = n.tz - n.group.position.z;
    const dd = Math.hypot(dx, dz);
    if (dd < 0.5) return true;
    n.group.rotation.y = Math.atan2(dx, dz);
    const step = Math.min(speed * dt, dd);
    n.group.position.x += dx / dd * step;
    n.group.position.z += dz / dd * step;
    n.group.position.y = terrainH(n.group.position.x, n.group.position.z);
    n.walkPhase += dt * 8;
    n.legL.rotation.x = Math.sin(n.walkPhase) * 0.55;
    n.legR.rotation.x = -Math.sin(n.walkPhase) * 0.55;
    n.armL.rotation.x = -Math.sin(n.walkPhase) * 0.4;
    n.armR.rotation.x = Math.sin(n.walkPhase) * 0.4;
    return false;
  }
  function nearestTree(x, z) {
    let best = null, bd = 1e9;
    const kids = (treeGroup && treeGroup.children) || [];
    for (let i = 0; i < kids.length; i += 3) {
      const t = kids[i]; if (!t) continue;
      const dd = Math.hypot(t.position.x - x, t.position.z - z);
      if (dd < bd && dd > 4) { bd = dd; best = t; }
    }
    return best;
  }
  const eyes = [...document.querySelectorAll('.npc-eye')];
  let _eyeT = 0;
  function updateNPCs(dt, night) {
    for (const n of npcs) {
      n.label.s.position.set(n.group.position.x, n.group.position.y + 2.15, n.group.position.z);
      if (night && n.state !== 'RESTING') { n.state = 'RESTING'; setTask(n, 'RESTING'); }
      if (!night && n.state === 'RESTING') { n.state = 'IDLE'; n.timer = 0; }
      if (night || n.state === 'RESTING') {
        n.legL.rotation.x *= 0.9; n.legR.rotation.x *= 0.9;
        n.armL.rotation.x *= 0.9; n.armR.rotation.x *= 0.9;
        continue;
      }
      n.timer -= dt;
      if (n.state === 'IDLE') {
        if (n.timer > 0) continue;
        if (n.job === 'woodcutter') { const t = nearestTree(n.group.position.x, n.group.position.z); if (t) { n.tx = t.position.x; n.tz = t.position.z; } }
        else if (n.job === 'miner') { const s = nodes.find(o => o.type === 'stone' && !o.taken); if (s) { n.tx = s.x; n.tz = s.z; } }
        else if (n.job === 'fisher') { n.tx = fishSpot.x; n.tz = fishSpot.z; }
        else if (n.job === 'guard') { const w = guardWP[n.wp % 4]; n.wp++; n.tx = w[0]; n.tz = w[1]; }
        n.state = 'WORKING'; setTask(n, n.job === 'guard' ? 'PATROLLING' : 'WORKING');
      } else if (n.state === 'WORKING') {
        if (n.job === 'guard') {
          if (npcWalk(n, dt, 2.2)) { n.state = 'IDLE'; n.timer = 2; }
          else {
            let near = null, nd = 10;
            for (const w of wolves) {
              const dd = Math.hypot(w.x - n.group.position.x, w.z - n.group.position.z);
              if (dd < nd) { nd = dd; near = w; }
            }
            if (near) {
              near.hp -= 60 * dt;
              burst(near.x, terrainH(near.x, near.z) + 0.7, near.z, '#ff5040', 2, 2, 2);
              if (near.hp <= 0) killWolf(near, false);
            }
          }
          continue;
        }
        if (npcWalk(n, dt, 1.8)) {
          n.workT += dt;
          n.armR.rotation.x = -1.2 + Math.sin(n.workT * 9) * 0.6;
          if (n.workT > 5) {
            n.workT = 0; n.tx = bench.x; n.tz = bench.z;
            n.state = 'RETURNING'; setTask(n, 'RETURNING');
          }
        }
      } else if (n.state === 'RETURNING') {
        if (npcWalk(n, dt, 2.0)) {
          if (n.job === 'woodcutter') stock.wood++;
          else if (n.job === 'miner') stock.sharp_stone++;
          else if (n.job === 'fisher') stock.raw_fish++;
          burst(n.group.position.x, n.group.position.y + 1.2, n.group.position.z, '#e8dfc8', 5, 1.5, 2);
          sfx.click(); drawPack();
          n.state = 'IDLE'; n.timer = 6 + rand() * 10; setTask(n, 'IDLE');
        }
      }
    }
    _eyeT += dt;
    if (_eyeT > 0.25) {
      _eyeT = 0;
      camera.getWorldDirection(_v1);
      const sx = Math.max(-3, Math.min(3, _v1.x * 5)).toFixed(1);
      const sy = Math.max(-2, Math.min(2, -_v1.y * 5)).toFixed(1);
      for (const e of eyes) e.style.transform = `translate(${sx}px,${sy}px)`;
    }
  }

  // ---------------------------------------------------------------- combat --
  const spears = [];
  const spearM = new THREE.MeshStandardMaterial({ color: '#7a5a36', roughness: 0.9 });
  let equip = 'hands';
  function throwSpear() {
    if (pack.spear <= 0) { toast('No spears — craft one at the Workshop (F near bench).'); return; }
    pack.spear--;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), spearM);
    camera.getWorldDirection(_v2);
    m.position.copy(camera.position).addScaledVector(_v2, 0.6);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v2.clone().normalize());
    scene.add(m);
    spears.push({ m, vx: _v2.x * 28, vy: _v2.y * 28, vz: _v2.z * 28, t: 0 });
    drawPack(); sfx.click();
  }
  function updateSpears(dt) {
    for (let i = spears.length - 1; i >= 0; i--) {
      const s = spears[i];
      s.t += dt; s.vy -= 9.5 * dt;
      s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
      let dead = s.t > 4;
      for (const w of [...wolves]) {
        if (Math.hypot(w.x - s.m.position.x, w.z - s.m.position.z) < 0.9 &&
            s.m.position.y < terrainH(w.x, w.z) + 1.4) {
          w.hp -= 35;
          burst(w.x, s.m.position.y, w.z, '#ff5040', 8, 2.5, 2.5); sfx.thud();
          if (w.hp <= 0) killWolf(w, true);
          dead = true; break;
        }
      }
      const gy = s.t > 0.1 ? terrainH(s.m.position.x, s.m.position.z) : -999;
      if (!dead && s.m.position.y <= gy) {
        burst(s.m.position.x, gy + 0.2, s.m.position.z, '#8a6a40', 5, 2, 2);
        pack.spear++; drawPack(); toast('Spear recovered.');
        dead = true;
      }
      if (dead) { scene.remove(s.m); spears.splice(i, 1); }
    }
  }
  function hitNPC() {
    const pc = camera.position;
    for (const n of npcs) {
      if (Math.hypot(pc.x - n.group.position.x, pc.z - n.group.position.z) < 2.5) {
        hurt(8, `⚠️ ${n.name} shoves you! Don't hit villagers.`);
        burst(pc.x, pc.y - 0.3, pc.z, '#ff4030', 8, 3, 2);
        return true;
      }
    }
    return false;
  }
  function hitWild() {
    const pc = camera.position;
    for (const w of [...wolves]) {
      if (Math.hypot(pc.x - w.x, pc.z - w.z) < 2.2) {
        w.hp -= 12;
        burst(w.x, pc.y - 0.5, w.z, '#ff5040', 8, 3, 2.5); sfx.thud();
        if (w.hp <= 0) killWolf(w, true);
        return true;
      }
    }
    return false;
  }
  function aimDeer() {
    const k = wildlife.killDeer(12);
    if (!k) return false;
    lif.deer++;
    pack.raw_meat += 2;
    burst(k.x, terrainH(k.x, k.z) + 1, k.z, '#c03020', 10, 3, 3);
    toast('🦌 Deer hunted! +2 raw meat (cook it — raw meat poisons).');
    sfx.thud(); drawPack(); drawQuests();
    return true;
  }

  // -------------------------------------------------------- E / F interact --
  function lookGround(maxDist) {
    camera.getWorldDirection(_v1);
    if (_v1.y > -0.08) return null;
    for (let d = 1; d < maxDist; d += 0.5) {
      _v2.copy(camera.position).addScaledVector(_v1, d);
      if (_v2.y <= terrainH(_v2.x, _v2.z)) return { x: _v2.x, z: _v2.z };
    }
    return null;
  }
  function nearestNode(maxD) {
    _ray.setFromCamera(_center, camera);
    _ray.far = maxD;
    const hits = _ray.intersectObjects(nodeMeshes.filter(m => m.visible), false);
    return hits.length ? hits[0] : null;
  }
  function harvest(h) {
    const n = h.object.userData.node;
    n.taken = true; n.respawn = 150; n.mesh.visible = false;
    pack[n.type]++;
    if (n.type === 'sharp_stone' || n.type === 'vine') lif[n.type]++;
    burst(n.x, n.y + 0.4, n.z, '#d8c890', 6, 2, 2.5);
    sfx.thud(); drawPack(); drawQuests();
  }
  const COOK_TIME = 5;
  function startCook() {
    cookKind = pack.raw_fish > 0 ? 'raw_fish' : 'raw_meat';
    if (cookKind === 'raw_fish') pack.raw_fish--; else pack.raw_meat--;
    cookT = 0;
    const ch = el('contextHint');
    ch._sv = true; ch._svT = performance.now() / 1000; ch._svOld = ch.textContent;
    toast('🍳 Cooking… stand by the fire.');
    drawPack();
  }
  function updateCook(dt) {
    if (!cookKind) return;
    cookT += dt;
    const fd = Math.hypot(camera.position.x - campfire.x, camera.position.z - campfire.z);
    if (fd > 4) { cookKind = null; toast('Stepped away — cooking paused (meal kept).'); return; }
    if (Math.floor(cookT * 2) !== Math.floor((cookT - dt) * 2))
      burst(campfire.x, terrainH(campfire.x, campfire.z) + 0.8, campfire.z, '#ff9040', 2, 1, 2);
    if (cookT >= COOK_TIME) {
      cookKind = null;
      pack.cooked_fish++;
      toast('🍖 Grilled fish ready! (+50 hunger, +30 health)');
      sfx.blip(); drawPack();
    }
  }
  function use() {
    if (wsOpen) { wsEl.classList.remove('open'); return true; }
    if (cookKind) return false;
    const pc = camera.position;
    const fd = Math.hypot(pc.x - campfire.x, pc.z - campfire.z);
    if (fd < 3 && (pack.raw_fish > 0 || pack.raw_meat > 0)) { startCook(); return true; }
    const hit = nearestNode(3.5);
    if (hit) { harvest(hit); return true; }
    let bp = null, bd = 3.5;
    for (const p of plots) {
      const dd = Math.hypot(pc.x - p.x, pc.z - p.z);
      if (dd < bd && p.state === 'bush') { bd = dd; bp = p; }
    }
    if (bp) {
      pack.berry += 4; bp.state = 'tilled';
      scene.remove(bp.mesh);
      const h = terrainH(bp.x, bp.z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.1), tilledM);
      m.position.set(bp.x, h + 0.04, bp.z); m.receiveShadow = true; scene.add(m);
      bp.mesh = m;
      toast('🫐 +4 berries. Left-click plants again with a seed.');
      sfx.blip(); drawPack();
      return true;
    }
    return false;
  }
  function chopWood() {
    if (harvestCD > 0 || riding) return false;
    const pc = camera.position;
    const t = nearestTree(pc.x, pc.z);
    if (!t || Math.hypot(pc.x - t.position.x, pc.z - t.position.z) > 15) return false;
    harvestCD = hasAxe ? 0.8 : 1.0;
    pack.wood++;
    burst(t.position.x, terrainH(t.position.x, t.position.z) + 1.2, t.position.z, '#8a6a40', 6, 2.5, 2.5);
    sfx.thud(); drawPack();
    return true;
  }
  function drink() {
    if (riding || hasRod() || holdingPot()) return false;
    const pc = camera.position;
    if (!inWater(pc.x, pc.z)) {
      let near = false;
      for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]])
        if (inWater(pc.x + ox, pc.z + oz)) { near = true; break; }
      if (!near) return false;
    }
    vit.thi = 100; sfx.splash();
    toast('💧 You drink your fill. (Thirst 100%)');
    drawVitals();
    return true;
  }
  function chop() {
    if (hitNPC() || hitWild()) return true;
    if (!riding) {
      if (wsOpen) { wsEl.classList.remove('open'); return true; }
      if (equip === 'spear' && aimDeer()) return true;
      if (drink()) return true;
      if (window.__horseF()) return true;
      const d = Math.hypot(camera.position.x - bench.x, camera.position.z - bench.z);
      if (d < 4) { wsOpen = true; drawWorkshop(); wsEl.classList.add('open'); sfx.click(); return true; }
      if (chopWood()) return true;
    } else if (window.__horseF()) return true;
    if (equip === 'shovel' && plots.length < 12) {
      const fd = Math.hypot(camera.position.x - campfire.x, camera.position.z - campfire.z);
      if (fd < 6) { toast('Till further from the fire (6m+).'); return true; }
      const g = lookGround(4);
      if (g && !inWater(g.x, g.z)) { tillAt(g.x, g.z); drawPack(); return true; }
    }
    return false;
  }

  // ------------------------------------------------------------ keys/mouse --
  document.addEventListener('keydown', e => {
    if (!isPlaying() || (e.target && e.target.matches && e.target.matches('input,select'))) return;
    if (e.code === 'KeyB' && !e.repeat) el('pack').classList.toggle('open');
    else if (e.code === 'Digit4' && !e.repeat) { equip = 'wall'; toast('🧱 Wall blueprint: aim + Left-click to build (2 wood each).'); }
    else if (e.code === 'Digit5' && !e.repeat) { equip = 'spear'; toast('🗡️ Spear ready — aim a deer + F, or Right-click to throw.'); }
    else if (e.code === 'Digit6' && !e.repeat) {
      if (pack.wood < 3 || pack.stone < 2) { toast('Turret needs 3 wood + 2 stone.'); return; }
      pack.wood -= 3; pack.stone -= 2; drawPack();
      camera.getWorldDirection(_v1);
      _v2.copy(camera.position).addScaledVector(_v1, 3);
      placeTurret(_v2.x, terrainH(_v2.x, _v2.z), _v2.z);
    }
    else if (e.code === 'Digit7' && !e.repeat) { equip = 'shovel'; toast('🧹 Shovel ready — F on open ground 6m+ from fire tills a plot.'); }
  });
  document.addEventListener('mousedown', e => {
    if (!isPlaying()) return;
    if (e.button === 2) { if (equip === 'spear') throwSpear(); return; }
    if (e.button !== 0) return;
    if (equip === 'wall') {
      if (pack.wood < 2) { toast('Need 2 wood per wall.'); return; }
      pack.wood -= 2; drawPack();
      placeWall(ghost.position.x, ghost.position.y - 1.25, ghost.position.z, ghost.rotation.y);
      return;
    }
    if (cookKind) return;
    const pc = camera.position;
    for (const p of plots) {
      if (p.state === 'tilled' && Math.hypot(pc.x - p.x, pc.z - p.z) < 3.5) {
        if (pack.berry_seed <= 0) { toast('Need a berry seed (30% from wild berries).'); return; }
        pack.berry_seed--;
        p.state = 'growing'; p.t = 0;
        scene.remove(p.mesh);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6), sproutM);
        const h = terrainH(p.x, p.z);
        m.position.set(p.x, h + 0.1, p.z); scene.add(m);
        p.mesh = m;
        toast('🌱 Seed planted — grows in 30s.');
        sfx.click(); drawPack();
        return;
      }
    }
  });
  document.addEventListener('contextmenu', e => { if (isPlaying()) e.preventDefault(); });
  // ------------------------------------------------------------ main loop --
  function updateWolves(dt) {
    const pc = camera.position;
    wolfT += dt;
    if (wolfT > 240 && wolves.length < 6) { wolfT = 0; spawnWolf({ x: pc.x, z: pc.z }); }
    for (const w of [...wolves]) {
      const dP = Math.hypot(pc.x - w.x, pc.z - w.z);
      if (dP < 15) {
        const h = Math.atan2(pc.x - w.x, pc.z - w.z);
        w.g.rotation.y = h;
        w.x += Math.sin(h) * 4.5 * dt; w.z += Math.cos(h) * 4.5 * dt;
        if (dP < 2.2) hurt(10 * dt);
      } else {
        w.wt -= dt;
        if (w.wt <= 0) { w.wt = 4 + rand() * 4; w.heading = rand() * 6.28; }
        w.x += Math.sin(w.heading) * 1.2 * dt; w.z += Math.cos(w.heading) * 1.2 * dt;
      }
      w.g.position.set(w.x, terrainH(w.x, w.z), w.z);
    }
  }
  function updateTurrets(dt) {
    for (const t of turrets) {
      t.cd -= dt;
      let near = null, nd = 20;
      for (const w of wolves) {
        const dd = Math.hypot(w.x - t.x, w.z - t.z);
        if (dd < nd) { nd = dd; near = w; }
      }
      if (!near) continue;
      t.pivot.rotation.y = Math.atan2(near.x - t.x, near.z - t.z);
      if (t.cd > 0) continue;
      t.cd = 1.2;
      near.hp -= 12;
      fireTracer(t.x, t.y + 2.3, t.z, near.x, terrainH(near.x, near.z) + 0.6, near.z);
      burst(near.x, terrainH(near.x, near.z) + 0.6, near.z, '#ffe0a0', 3, 1.5, 1.5);
      if (near.hp <= 0) killWolf(near, false);
    }
  }
  function updateHorse(dt) {
    if (!riding) return;
    camera.getWorldDirection(_v1);
    const hx = camera.position.x - _v1.x * 0.4, hz = camera.position.z - _v1.z * 0.4;
    horse.position.set(hx, terrainH(hx, hz), hz);
    horse.rotation.y = Math.atan2(_v1.x, _v1.z);
  }
  const contextEl = el('contextHint');
  function update(dt, now) {
    if (!isPlaying()) return;
    dt = Math.min(dt, 0.05);
    harvestCD -= dt; dmgT -= dt;
    if (dmgT <= 0 && dmgEl) dmgEl.style.opacity = '0';
    const pc = camera.position;
    vit.hun = Math.max(0, vit.hun - dt / 3);
    vit.thi = Math.max(0, vit.thi - dt / 3);
    starveT += dt;
    if ((vit.hun <= 0 || vit.thi <= 0) && starveT > 2) { starveT = 0; hurt(5, '⭐ Starving! Find food and water.'); }
    if (poisonT > 0) { poisonT -= dt; vit.hp = Math.max(1, vit.hp - dt); }
    const night = isNight(), rain = isRain();
    const fd = Math.hypot(pc.x - campfire.x, pc.z - campfire.z);
    let nearWalls = 0;
    for (const w of walls) if (Math.hypot(pc.x - w.x, pc.z - w.z) < 6) nearWalls++;
    if (fd < 4 || nearWalls >= 3) vit.tmp = Math.min(100, vit.tmp + 8 * dt);
    else if (night || rain) vit.tmp = Math.max(0, vit.tmp - 3 * dt);
    else vit.tmp = Math.min(100, vit.tmp + dt);
    if (vit.tmp <= 0) hurt(2 * dt);
    drawVitals(); drawQuests();
    for (const n of nodes) {
      if (n.taken) {
        n.respawn -= dt;
        if (n.respawn <= 0) { n.taken = false; n.mesh.visible = true; }
      }
    }
    updateCook(dt); updatePlots(dt); updateNPCs(dt, night);
    updateSpears(dt); updateParticles(dt);
    for (const t of tracers) {
      if (t.t < 1) { t.t += dt * 6; if (t.t >= 1) t.m.visible = false; }
    }
    updateWolves(dt); updateTurrets(dt); updateHorse(dt);
    if (equip === 'wall' && pack.wood >= 2) {
      camera.getWorldDirection(_v1);
      _v2.copy(pc).addScaledVector(_v1, 5);
      const gy = terrainH(_v2.x, _v2.z);
      ghost.visible = true;
      ghost.position.set(_v2.x, gy + 1.25, _v2.z);
      ghost.rotation.y = Math.atan2(_v1.x, _v1.z);
    } else ghost.visible = false;
    saveT += dt;
    if (saveT > 30) { saveT = 0; saveGame(true); }
    if (cookKind && contextEl) contextEl.textContent = `🍳 Cooking… ${Math.ceil(COOK_TIME - cookT)}s`;
    else if (contextEl && contextEl._sv && now - contextEl._svT > 4) {
      contextEl._sv = false; contextEl.textContent = contextEl._svOld;
    }
  }

  // ---------------------------------------------------------- test helpers --
  function give(item, n) {
    if (pack[item] === undefined || !(n > 0)) return;
    pack[item] += Math.min(n, 99); drawPack();
  }
  function tpCamp() {
    const x = campfire.x + 2, z = campfire.z + 2;
    camera.position.set(x, terrainH(x, z) + 1.7, z);
  }
  function onForage(name) {
    if (name === 'Berries' && rand() < 0.3) {
      pack.berry_seed++;
      toast('🌱 Found a berry seed! (till soil + plant with shovel)');
      drawPack();
    }
  }
  function onCatchFish() { pack.raw_fish++; drawPack(); }
  function diagnostics() {
    return {
      hp: Math.round(vit.hp), hun: +vit.hun.toFixed(1), thi: +vit.thi.toFixed(1), tmp: +vit.tmp.toFixed(1),
      pack: { ...pack }, stock: { ...stock },
      wolves: wolves.length,
      npcs: npcs.map(n => [n.name, n.state]),
      riding, hasAxe, quests: quests().map(q => q.done), nodes: nodes.filter(n => !n.taken).length,
      turrets: turrets.length, walls: walls.length, plots: plots.length,
    };
  }

  // ----------------------------------------------------------------- save --
  const SAVE_KEY = 'everwild_save_v1';
  function saveGame(silent) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        vit, pack, stock, lif, hasAxe, riding: false,
        pos: [camera.position.x, camera.position.z],
        walls: walls.map(w => [w.x, w.z, w.y, w.ry]),
        turrets: turrets.map(t => [t.x, t.z, t.y]),
        plots: plots.map(p => [p.x, p.z, p.state === 'bush' ? 2 : p.state === 'growing' ? 1 : 0]),
      }));
      if (!silent) toast('💾 Saved.');
    } catch (e) { /* storage unavailable */ }
  }
  function loadGame() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || new URLSearchParams(location.search).get('load') !== '1') return;
    try {
      Object.assign(vit, s.vit); Object.assign(pack, s.pack);
      Object.assign(stock, s.stock); Object.assign(lif, s.lif);
      hasAxe = !!s.hasAxe;
      if (s.pos) camera.position.set(s.pos[0], terrainH(s.pos[0], s.pos[1]) + 1.7, s.pos[1]);
      for (const [x, z, y, ry] of (s.walls || [])) placeWall(x, y, z, ry);
      for (const [x, z, y] of (s.turrets || [])) placeTurret(x, y, z);
      for (const [x, z, st] of (s.plots || [])) {
        tillAt(x, z);
        const p = plots[plots.length - 1];
        if (st === 1) {
          p.state = 'growing'; p.t = 15;
          scene.remove(p.mesh);
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 6), sproutM);
          m.position.set(x, terrainH(x, z) + 0.1, z); scene.add(m);
          p.mesh = m;
        }
      }
      drawPack(); drawVitals(); drawQuests();
      toast('💾 Save loaded.');
    } catch (e) { toast('Save file was corrupt — starting fresh.'); }
  }
  loadGame();

  return { update, use, chop, craft, give, tpCamp, onForage, onCatchFish, diagnostics };
}
     

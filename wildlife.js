import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * Everwood wildlife — red-deer herd, songbirds and forage, built fresh.
 *
 * Design notes (realism + performance):
 *  - Deer are the real CC0 doe scan (public/models/doe.glb) with its own
 *    Idle / Graze / Alert / Run clips, crossfaded, auto-scaled to life size.
 *    Deer are near-silent in nature, so they make no calls; wariness, flight
 *    distance and herd drift follow real red-deer behaviour.
 *  - Songbirds are 3 instanced species (6 draw calls for all 12 birds):
 *    perching, ground hopping/pecking, flap-glide flight, banking, night
 *    roosts. Calls use the real backyard-recording birds.mp3, positional.
 *  - Forage (chanterelle / bolete / berries) is picked with E, counted in
 *    the HUD basket, and regrows. Picking plays a soft real-leaf rustle.
 *  - No per-frame allocations; route/placement math runs on events only.
 */

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function turnToward(cur, target, maxStep) {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}

// ---------------------------------------------------------------- deer ---
const DEER_MODEL = './public/models/doe.glb';
const DEER_ANIMS = ['Idle', 'Graze', 'Alert', 'Run'];

function slopeAt(terrainH, x, z) {
  const h = terrainH(x, z);
  const dx = terrainH(x + 1.5, z) - h, dz = terrainH(x, z + 1.5) - h;
  return Math.hypot(dx, dz) / 1.5;
}

function createDeerHerd(opts) {
  const { scene, terrainH, inWater, houses } = opts;
  const rand = lcg(77031);
  const herd = {
    deer: [], loaded: false, loadError: '',
    anchors: [{ x: 18, z: 96 }, { x: 152, z: 62 }],
  };
  const valid = (x, z) => {
    const h = terrainH(x, z);
    if (!(h > 0.7 && h < 42)) return false;
    if (inWater && inWater(x, z)) return false;
    if (slopeAt(terrainH, x, z) > 0.75) return false;
    for (const hb of houses || []) if (Math.hypot(x - hb.x, z - hb.z) < 18) return false;
    return true;
  };
  const nearPond = (x, z) => Math.hypot(x - 45, z - 60) < 20;

  function playClip(d, name, rate = 1) {
    if (d.clip === name && d.rate === rate) return;
    const next = d.actions[name];
    if (!next) return;
    if (d.current) d.current.fadeOut(0.35);
    next.reset().setEffectiveTimeScale(rate).fadeIn(0.35).play();
    d.current = next; d.clip = name; d.rate = rate;
  }
  function setState(d, s, dur) {
    d.state = s; d.timer = dur;
    if (s === 'graze' || s === 'drink') playClip(d, 'Graze');
    else if (s === 'idle') playClip(d, 'Idle');
    else if (s === 'alert') playClip(d, 'Alert');
    else if (s === 'walk') playClip(d, 'Run', 0.42);
    else if (s === 'flee') playClip(d, 'Run', 1);
  }
  function pickWander(d) {
    const a = d.anchor;
    for (let i = 0; i < 8; i++) {
      const x = a.x + (rand() - 0.5) * 56, z = a.z + (rand() - 0.5) * 56;
      if (valid(x, z)) { d.tx = x; d.tz = z; return true; }
    }
    return false;
  }
  function startle(d, px, pz) {
    // Flee: sample headings, prefer away-from-threat + valid ground.
    let best = Math.atan2(d.x - px, d.z - pz), bestScore = -1e9;
    for (let i = 0; i < 9; i++) {
      const h = (i / 9) * Math.PI * 2;
      const x = d.x + Math.sin(h) * 22, z = d.z + Math.cos(h) * 22;
      let score = Math.cos(h - Math.atan2(d.x - px, d.z - pz)) * 2;
      if (!valid(x, z)) score -= 5;
      if (inWater && inWater(x, z)) score -= 5;
      if (score > bestScore) { bestScore = score; best = h; }
    }
    d.tx = d.x + Math.sin(best) * 26; d.tz = d.z + Math.cos(best) * 26;
    setState(d, 'flee', 5.5);
  }

  function spawn(group, clips) {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const scale = 1.62 / Math.max(size.y, 0.001);
    const footOff = -box.min.y * scale;
    const actions = {};
    for (let i = 0; i < 5; i++) {
      const anchor = herd.anchors[i % herd.anchors.length];
      let x = anchor.x, z = anchor.z;
      for (let t = 0; t < 12; t++) {
        const cx = anchor.x + (rand() - 0.5) * 40, cz = anchor.z + (rand() - 0.5) * 40;
        if (valid(cx, cz)) { x = cx; z = cz; break; }
      }
      const clone = SkeletonUtils.clone(group);
      const wrap = new THREE.Group();
      wrap.scale.setScalar(scale);
      clone.position.y = footOff / scale;
      clone.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
      wrap.add(clone);
      wrap.position.set(x, terrainH(x, z), z);
      scene.add(wrap);
      const mixer = new THREE.AnimationMixer(clone);
      const acts = {};
      for (const c of clips) acts[c.name] = mixer.clipAction(c);
      const d = {
        wrap, mixer, actions: acts, current: null, clip: '', rate: 1,
        x, z, heading: rand() * Math.PI * 2, tx: x, tz: z,
        state: 'idle', timer: 1 + rand() * 3, anchor, sense: rand() * 0.25,
      };
      wrap.rotation.y = d.heading;
      setState(d, rand() < 0.6 ? 'graze' : 'idle', 3 + rand() * 5);
      herd.deer.push(d);
    }
  }

  new GLTFLoader().loadAsync(DEER_MODEL).then(gltf => {
    const clips = (gltf.animations || []).filter(c => DEER_ANIMS.includes(c.name));
    if (!clips.length) throw new Error('doe.glb has no usable clips');
    spawn(gltf.scene, clips);
    herd.loaded = true;
  }).catch(err => { herd.loadError = String((err && err.message) || err); });

  let senseTick = 0;
  function update(dt, now, player, playerSpeed) {
    senseTick -= dt;
    const sensing = senseTick <= 0;
    if (sensing) senseTick = 0.25;
    for (const d of herd.deer) {
      d.timer -= dt;
      const dx = player.x - d.x, dz = player.z - d.z;
      const dist = Math.hypot(dx, dz);
      if (sensing && d.state !== 'flee') {
        const wary = dist < 6.5 || (dist < 14 && playerSpeed > 4.5);
        if (wary) {
          if (d.state !== 'alert') setState(d, 'alert', 1.1);
          else if (d.timer <= 0) startle(d, player.x, player.z);
        } else if (d.state === 'alert' && d.timer <= 0) {
          setState(d, 'idle', 2 + rand() * 3);
        }
      }
      let speed = 0;
      if (d.state === 'walk' || d.state === 'flee') {
        const want = Math.atan2(d.tx - d.x, d.tz - d.z);
        d.heading = turnToward(d.heading, want, (d.state === 'flee' ? 3.4 : 2.0) * dt);
        speed = d.state === 'flee' ? 6.2 : 1.5;
        const nx = d.x + Math.sin(d.heading) * speed * dt;
        const nz = d.z + Math.cos(d.heading) * speed * dt;
        if (valid(nx, nz)) { d.x = nx; d.z = nz; }
        else if (d.state === 'walk') { pickWander(d); }
        const arrived = Math.hypot(d.tx - d.x, d.tz - d.z) < (d.state === 'flee' ? 3 : 1.6);
        if (arrived || d.timer <= 0) {
          if (d.state === 'flee' && dist < 20 && d.timer > 0) { startle(d, player.x, player.z); }
          else {
            const drink = nearPond(d.x, d.z) && rand() < 0.3;
            if (drink) { d.heading = Math.atan2(45 - d.x, 60 - d.z); setState(d, 'drink', 5 + rand() * 3); }
            else setState(d, rand() < 0.65 ? 'graze' : 'idle', 3.5 + rand() * 6);
          }
        }
      } else if (d.timer <= 0 && d.state !== 'alert') {
        if (pickWander(d)) setState(d, 'walk', 30);
        else setState(d, 'idle', 2 + rand() * 3);
      }
      d.wrap.position.set(d.x, terrainH(d.x, d.z), d.z);
      d.wrap.rotation.y = d.heading;
      d.mixer.update(dt);
    }
  }
  herd.update = update;
  return herd;
}

// --------------------------------------------------------------- birds ---
const BIRD_COUNT = 12;
const BIRD_SPECIES = [
  { body: '#7a6248', head: '#4e3f2e', wing: '#8a7558' }, // thrush
  { body: '#c8a53a', head: '#7a6420', wing: '#d8bc55' }, // finch
  { body: '#7a8ba0', head: '#46536a', wing: '#93a5bb' }, // jay
];

function featherTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#cfc8bc'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 9; i++) {
    const px = 6 + i * 13;
    x.strokeStyle = 'rgba(70,64,55,.55)'; x.lineWidth = 1.4;
    x.beginPath(); x.moveTo(px, 4); x.quadraticCurveTo(px + 4, 34, px - 2, 62); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(px + 3, 6); x.quadraticCurveTo(px + 7, 34, px + 1, 60); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createBirdFlock(opts) {
  const { scene, terrainH, inWater, sounds, treeGroup } = opts;
  const rand = lcg(91317);
  const feather = featherTexture();
  const white = new THREE.Color('#ffffff');
  function inst(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  }
  const bodyGeo = new THREE.SphereGeometry(1, 12, 9);
  const headGeo = new THREE.SphereGeometry(1, 10, 8);
  const beakGeo = new THREE.ConeGeometry(1, 1, 8); beakGeo.rotateX(Math.PI / 2);
  const wingGeo = new THREE.PlaneGeometry(1, 0.55); wingGeo.translate(0.5, 0, 0);
  const tailGeo = new THREE.PlaneGeometry(0.5, 1); tailGeo.translate(0, -0.35, 0); tailGeo.rotateX(-Math.PI / 2 + 0.25);
  const parts = {
    body: inst(bodyGeo, new THREE.MeshStandardMaterial({ roughness: .9 }), BIRD_COUNT),
    head: inst(headGeo, new THREE.MeshStandardMaterial({ roughness: .9 }), BIRD_COUNT),
    beak: inst(beakGeo, new THREE.MeshStandardMaterial({ color: '#d88f3a', roughness: .6 }), BIRD_COUNT),
    wingL: inst(wingGeo, new THREE.MeshStandardMaterial({ map: feather, side: THREE.DoubleSide, roughness: .9, alphaTest: .05 }), BIRD_COUNT),
    wingR: inst(wingGeo, new THREE.MeshStandardMaterial({ map: feather, side: THREE.DoubleSide, roughness: .9, alphaTest: .05 }), BIRD_COUNT),
    tail: inst(tailGeo, new THREE.MeshStandardMaterial({ map: feather, side: THREE.DoubleSide, roughness: .9, alphaTest: .05 }), BIRD_COUNT),
  };
  const col = new THREE.Color();
  // Perch + ground spots.
  const perches = [];
  const kids = (treeGroup && treeGroup.children) || [];
  for (let i = 0; i < kids.length && perches.length < 70; i += 5) {
    const t = kids[Math.floor(rand() * kids.length)];
    if (!t) continue;
    perches.push({
      x: t.position.x + (rand() - .5) * 5,
      y: t.position.y + 6 + rand() * 6,
      z: t.position.z + (rand() - .5) * 5,
      tree: t,
    });
  }
  if (!perches.length) {
    for (let i = 0; i < 12; i++) {
      const x = (rand() - .5) * 300, z = (rand() - .5) * 300;
      perches.push({ x, y: terrainH(x, z) + 8, z, tree: null });
    }
  }
  const grounds = [];
  for (let i = 0; i < 60 && grounds.length < 26; i++) {
    const x = 80 + (rand() - .5) * 320, z = (rand() - .5) * 320;
    const h = terrainH(x, z);
    if (!(h > 0.8 && h < 40) || (inWater && inWater(x, z))) continue;
    if (slopeAt(terrainH, x, z) > 0.5) continue;
    grounds.push({ x, y: h, z });
  }
  const birds = [];
  for (let i = 0; i < BIRD_COUNT; i++) {
    const sp = i % 3, perch = perches[Math.floor(rand() * perches.length)];
    birds.push({
      sp, state: 'perch', perch, timer: 4 + rand() * 18,
      x: perch.x, y: perch.y, z: perch.z,
      tx: perch.x, ty: perch.y, tz: perch.z, kind: 'perch',
      heading: rand() * Math.PI * 2, pitch: 0, roll: 0,
      flapPhase: rand() * 6.28, flapAmp: 0, glide: 0,
      callIn: 6 + rand() * 26, hop: 0, pecks: 0,
    });
    col.set(BIRD_SPECIES[sp].body); parts.body.setColorAt(i, col);
    col.set(BIRD_SPECIES[sp].head); parts.head.setColorAt(i, col);
    col.set(BIRD_SPECIES[sp].wing); parts.wingL.setColorAt(i, col); parts.wingR.setColorAt(i, col);
    col.set(BIRD_SPECIES[sp].wing).multiplyScalar(0.8); parts.tail.setColorAt(i, col);
  }
  for (const k of ['body', 'head', 'wingL', 'wingR', 'tail'])
    if (parts[k].instanceColor) parts[k].instanceColor.needsUpdate = true;

  function setPart(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
    _p.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
  }
  function flyTo(b, t, kind) {
    b.tx = t.x; b.ty = t.y + (kind === 'perch' ? 0.12 : 0.09); b.tz = t.z;
    b.kind = kind; b.state = 'fly'; b.glide = 0;
  }
  let calls = 0, lastCall = -10;
  function maybeCall(b, now, player, day, weather) {
    if (!day || weather === 'storm') return;
    b.callIn -= 1 / 60;
    if (b.callIn > 0 || now - lastCall < 2) return;
    const d = Math.hypot(player.x - b.x, player.z - b.z);
    if (d > 30 || !sounds || !sounds.call) { b.callIn = 4; return; }
    b.callIn = 12 + rand() * 26;
    lastCall = now; calls++;
    _v.set(b.x, b.y, b.z);
    try { sounds.call(_v); } catch { /* audio optional */ }
  }

  function update(dt, now, player, day, weather) {
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      b.timer -= dt;
      const hidden = b.state === 'perch' && b.perch.tree && !b.perch.tree.visible;
      if (!day && b.state !== 'roost' && b.state !== 'fly') {
        if (b.state !== 'perch' || b.perch !== b.homePerch) { /* finish current */ }
        b.homePerch = b.homePerch || b.perch;
        flyTo(b, b.homePerch, 'perch'); b.roosting = true;
      }
      if (b.state === 'perch') {
        b.flapAmp += (0 - b.flapAmp) * Math.min(1, dt * 6);
        if (rand() < dt * 0.5) b.heading += (rand() - .5) * 1.6;
        if (!day && b.roosting) { b.state = 'roost'; }
        else {
          maybeCall(b, now, player, day, weather);
          if (b.timer <= 0) {
            const r = rand();
            if (r < 0.62) { b.perch = perches[Math.floor(rand() * perches.length)]; flyTo(b, b.perch, 'perch'); }
            else if (r < 0.88 && grounds.length) { const g = grounds[Math.floor(rand() * grounds.length)]; b.ground = g; flyTo(b, g, 'ground'); }
            else b.timer = 5 + rand() * 12;
          }
        }
      } else if (b.state === 'ground') {
        b.flapAmp += (0 - b.flapAmp) * Math.min(1, dt * 6);
        b.hop -= dt;
        if (b.hop <= 0) {
          if (b.pecks > 0) { b.pecks--; b.hop = 0.32; b.pecking = 0.22; }
          else {
            b.heading += (rand() - .5) * 2;
            b.x += Math.sin(b.heading) * 0.35; b.z += Math.cos(b.heading) * 0.35;
            b.y = terrainH(b.x, b.z) + 0.09;
            b.hop = 0.4 + rand() * 0.5;
            if (rand() < 0.4) { b.pecks = 1 + Math.floor(rand() * 3); b.hop = 0.3; }
          }
        }
        if (b.pecking > 0) b.pecking -= dt;
        maybeCall(b, now, player, day, weather);
        if (b.timer <= 0) {
          if (!day) { b.homePerch = b.homePerch || b.perch; flyTo(b, b.homePerch, 'perch'); b.roosting = true; }
          else { b.perch = perches[Math.floor(rand() * perches.length)]; flyTo(b, b.perch, 'perch'); }
        }
      } else if (b.state === 'fly') {
        const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < (b.kind === 'perch' ? 0.7 : 0.5)) {
          b.x = b.tx; b.y = b.ty; b.z = b.tz;
          if (b.kind === 'perch') {
            b.state = b.roosting || !day ? 'roost' : 'perch';
            b.timer = 6 + rand() * 20; b.callIn = 3 + rand() * 10; b.roosting = false;
          } else {
            b.state = 'ground'; b.timer = 4 + rand() * 8; b.hop = 0.2; b.pecks = 2;
          }
        } else {
          const want = Math.atan2(dx, dz);
          const before = b.heading;
          b.heading = turnToward(b.heading, want, 2.6 * dt);
          const turn = (b.heading - before) / Math.max(dt, 0.001);
          const climbing = dy > 0.5, diving = dy < -1.5;
          const speed = climbing ? 5 : diving ? 9 : 7;
          const step = Math.min(dist, speed * dt);
          b.x += Math.sin(b.heading) * step * (Math.hypot(dx, dz) / Math.max(dist, 0.001));
          b.z += Math.cos(b.heading) * step * (Math.hypot(dx, dz) / Math.max(dist, 0.001));
          b.y += (dy / Math.max(dist, 0.001)) * step;
          b.pitch += (THREE.MathUtils.clamp(-Math.asin(THREE.MathUtils.clamp(dy / Math.max(dist, 0.001), -1, 1)) * 0.7, -0.6, 0.6) - b.pitch) * Math.min(1, dt * 4);
          b.roll += (THREE.MathUtils.clamp(-turn * 0.35, -0.7, 0.7) - b.roll) * Math.min(1, dt * 5);
          b.glide -= dt;
          let target = climbing ? 1 : diving ? 0.12 : 0.75;
          if (!climbing && !diving) {
            if (b.glide < -2.5) b.glide = 1.6 + rand();
            if (b.glide > 0) target = 0.1;
          }
          b.flapAmp += (target - b.flapAmp) * Math.min(1, dt * 5);
          b.flapPhase += dt * (6 + b.flapAmp * 26);
        }
      } else if (b.state === 'roost') {
        b.flapAmp = 0;
        if (day) { b.state = 'perch'; b.timer = 2 + rand() * 6; b.callIn = 1 + rand() * 4; }
      }
      // Compose 6 parts.
      const s = 1, flap = Math.sin(b.flapPhase) * b.flapAmp;
      const fold = (1 - b.flapAmp) * 1.15;
      const fy = hidden ? -50 : b.y;
      const fyaw = b.heading, froll = b.roll * b.flapAmp + (b.roll * 0.3);
      let fpitch = b.pitch;
      if (b.state === 'ground' && b.pecking > 0) fpitch = 0.85;
      if (b.state === 'roost') fpitch = 0.15;
      const pl = hidden ? 0 : 1;
      setPart(parts.body, i, b.x, fy, b.z, fpitch, fyaw, froll, 0.085 * s * pl, 0.08 * s * pl, 0.13 * s * pl);
      const hx = b.x + Math.sin(fyaw) * 0.1 * s, hz = b.z + Math.cos(fyaw) * 0.1 * s;
      setPart(parts.head, i, hx, fy + 0.085 * s, hz, fpitch * 0.7, fyaw, 0, 0.055 * s * pl, 0.058 * s * pl, 0.06 * s * pl);
      const bx = b.x + Math.sin(fyaw) * 0.155 * s, bz = b.z + Math.cos(fyaw) * 0.155 * s;
      setPart(parts.beak, i, bx, fy + 0.08 * s, bz, fpitch * 0.7 + Math.PI / 2 - Math.PI / 2, fyaw, 0, 0.016 * pl, 0.05 * pl, 0.016 * pl);
      const wcos = Math.cos(fyaw), wsin = Math.sin(fyaw);
      const shx = 0.05 * s, shy = fy + 0.045 * s;
      setPart(parts.wingL, i, b.x - wcos * shx, shy, b.z + wsin * shx, 0, fyaw, flap * 0.95 + fold, 0.19 * s * pl, 0.11 * s * pl, pl);
      setPart(parts.wingR, i, b.x + wcos * shx, shy, b.z - wsin * shx, 0, fyaw, -flap * 0.95 - fold, 0.19 * s * pl, 0.11 * s * pl, pl);
      const txp = b.x - Math.sin(fyaw) * 0.13 * s, tzp = b.z - Math.cos(fyaw) * 0.13 * s;
      setPart(parts.tail, i, txp, fy + 0.015, tzp, 0, fyaw, 0, 0.09 * s * pl, 0.13 * s * pl, pl);
    }
    for (const k in parts) parts[k].instanceMatrix.needsUpdate = true;
  }
  return {
    birds, update,
    get calls() { return calls; },
    flying() { return birds.filter(b => b.state === 'fly').length; },
  };
}

// --------------------------------------------------------------- forage --
const FORAGE_TYPES = [
  { name: 'Chanterelle', kind: 'mushroom', cap: '#d8a03a' },
  { name: 'Bolete', kind: 'mushroom', cap: '#8a5f3a' },
  { name: 'Berries', kind: 'berries', cap: '#b03040' },
];

function createForage(opts) {
  const { scene, terrainH, inWater, sounds, toast, onBasket } = opts;
  const rand = lcg(51523);
  const items = [];
  for (let i = 0; i < 200 && items.length < 46; i++) {
    const x = 80 + (rand() - .5) * 380, z = (rand() - .5) * 380;
    const h = terrainH(x, z);
    if (!(h > 1 && h < 38) || (inWater && inWater(x, z))) continue;
    if (slopeAt(terrainH, x, z) > 0.6) continue;
    let ok = true;
    for (const o of items) if (Math.hypot(x - o.x, z - o.z) < 5) { ok = false; break; }
    if (!ok) continue;
    items.push({ x, z, y: h, type: items.length % 3, active: true, regrow: 0 });
  }
  const shrooms = items.filter(o => FORAGE_TYPES[o.type].kind === 'mushroom');
  const bushes = items.filter(o => FORAGE_TYPES[o.type].kind === 'berries');
  function inst(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.castShadow = true;
    scene.add(m);
    return m;
  }
  const stems = inst(new THREE.CylinderGeometry(.03, .05, .26, 7),
    new THREE.MeshStandardMaterial({ color: '#e2d8bd', roughness: .9 }), Math.max(shrooms.length, 1));
  const caps = inst(new THREE.SphereGeometry(.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ roughness: .55 }), Math.max(shrooms.length, 1));
  const bushMesh = inst(new THREE.IcosahedronGeometry(.26, 1),
    new THREE.MeshStandardMaterial({ color: '#33502a', roughness: .95, flatShading: true }), Math.max(bushes.length, 1));
  const dots = inst(new THREE.SphereGeometry(.05, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#c83548', roughness: .3 }), Math.max(bushes.length * 3, 1));
  const col = new THREE.Color();
  shrooms.forEach((o, j) => {
    o.mi = j;
    col.set(FORAGE_TYPES[o.type].cap); caps.setColorAt(j, col);
  });
  if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  bushes.forEach((o, j) => { o.bi = j; });
  function drawItem(o) {
    const s = o.active ? 1 : 0.0001;
    if (o.mi !== undefined) {
      _e.set(0, o.x, 0); _q.setFromEuler(_e);
      _p.set(o.x, o.y + .13, o.z); _s.set(s, s, s); _m.compose(_p, _q, _s);
      stems.setMatrixAt(o.mi, _m);
      _p.set(o.x, o.y + .26, o.z); _m.compose(_p, _q, _s);
      caps.setMatrixAt(o.mi, _m);
      stems.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
    } else {
      _e.set(0, o.x * 2, 0); _q.setFromEuler(_e);
      _p.set(o.x, o.y + .16, o.z); _s.set(1, .62, 1); _m.compose(_p, _q, _s);
      bushMesh.setMatrixAt(o.bi, _m);
      for (let k = 0; k < 3; k++) {
        const a = o.x + k * 2.1;
        _p.set(o.x + Math.sin(a) * .27, o.y + .22 + (k - 1) * .1, o.z + Math.cos(a) * .27);
        _s.set(s, s, s); _m.compose(_p, _q, _s);
        dots.setMatrixAt(o.bi * 3 + k, _m);
      }
      bushMesh.instanceMatrix.needsUpdate = true; dots.instanceMatrix.needsUpdate = true;
    }
  }
  items.forEach(drawItem);
  let basket = 0, picked = 0, regrown = 0, lastPick = null;
  function nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const o of items) {
      if (!o.active) continue;
      const d = Math.hypot(x - o.x, z - o.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function pick(o) {
    o.active = false; o.regrow = 150;
    drawItem(o);
    basket++; picked++; lastPick = { name: FORAGE_TYPES[o.type].name };
    try { sounds && sounds.rustle && sounds.rustle(); } catch { /* optional */ }
    try { toast && toast(`${FORAGE_TYPES[o.type].name} +1 — basket ${basket}`); } catch { /* optional */ }
    try { onBasket && onBasket(basket); } catch { /* optional */ }
  }
  return {
    items,
    get lastPick() { return lastPick; },
    forage(x, z) {
      const o = nearest(x, z, 2.6);
      if (o) { pick(o); return true; }
      try { toast && toast('No ripe forage within reach.'); } catch { /* optional */ }
      return false;
    },
    nearestPoint(x, z) {
      const o = nearest(x, z, 400);
      return o ? [o.x, o.y, o.z] : null;
    },
    update(dt) {
      for (const o of items) {
        if (!o.active) {
          o.regrow -= dt;
          if (o.regrow <= 0) { o.active = true; regrown++; drawItem(o); }
        }
      }
    },
    stats() { return { basket, picked, regrown, active: items.filter(o => o.active).length }; },
  };
}


// ----------------------------------------------------------------- fox ---
const FOX_MODEL = './public/models/fox.glb';
const FOX_ANIMS = ['Survey', 'Walk', 'Run'];

function createFoxes(opts) {
  const { scene, terrainH, inWater, houses } = opts;
  const rand = lcg(31337);
  const foxes = { list: [], loaded: false, loadError: '', anchors: [{ x: -40, z: 40 }, { x: 190, z: -20 }] };
  const valid = (x, z) => {
    const h = terrainH(x, z);
    if (!(h > 0.7 && h < 42)) return false;
    if (inWater && inWater(x, z)) return false;
    if (slopeAt(terrainH, x, z) > 0.75) return false;
    for (const hb of houses || []) if (Math.hypot(x - hb.x, z - hb.z) < 18) return false;
    return true;
  };
  function playClip(f, name, rate = 1) {
    if (f.clip === name && f.rate === rate) return;
    const next = f.actions[name];
    if (!next) return;
    if (f.current) f.current.fadeOut(0.3);
    next.reset().setEffectiveTimeScale(rate).fadeIn(0.3).play();
    f.current = next; f.clip = name; f.rate = rate;
  }
  function setState(f, s, dur) {
    f.state = s; f.timer = dur;
    if (s === 'idle' || s === 'sit') playClip(f, 'Survey');
    else if (s === 'walk') playClip(f, 'Walk', 1);
    else if (s === 'stalk') playClip(f, 'Walk', 0.55);
    else if (s === 'trot') playClip(f, 'Run', 0.55);
    else if (s === 'flee') playClip(f, 'Run', 1);
  }
  function pickWander(f) {
    const a = f.anchor;
    for (let i = 0; i < 8; i++) {
      const x = a.x + (rand() - 0.5) * 70, z = a.z + (rand() - 0.5) * 70;
      if (valid(x, z)) { f.tx = x; f.tz = z; return true; }
    }
    return false;
  }
  function startle(f, px, pz) {
    let best = Math.atan2(f.x - px, f.z - pz), bestScore = -1e9;
    for (let i = 0; i < 9; i++) {
      const h = (i / 9) * Math.PI * 2;
      const x = f.x + Math.sin(h) * 22, z = f.z + Math.cos(h) * 22;
      let score = Math.cos(h - Math.atan2(f.x - px, f.z - pz)) * 2;
      if (!valid(x, z)) score -= 5;
      if (score > bestScore) { bestScore = score; best = h; }
    }
    f.tx = f.x + Math.sin(best) * 30; f.tz = f.z + Math.cos(best) * 30;
    setState(f, 'flee', 5);
  }
  function spawn(group, clips) {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const scale = 0.65 / Math.max(size.y, 0.001);
    const footOff = -box.min.y * scale;
    for (let i = 0; i < 2; i++) {
      const anchor = foxes.anchors[i % foxes.anchors.length];
      let x = anchor.x, z = anchor.z;
      for (let t = 0; t < 12; t++) {
        const cx = anchor.x + (rand() - 0.5) * 40, cz = anchor.z + (rand() - 0.5) * 40;
        if (valid(cx, cz)) { x = cx; z = cz; break; }
      }
      const clone = SkeletonUtils.clone(group);
      const wrap = new THREE.Group();
      wrap.scale.setScalar(scale);
      clone.position.y = footOff / scale;
      clone.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
      wrap.add(clone);
      wrap.position.set(x, terrainH(x, z), z);
      scene.add(wrap);
      const mixer = new THREE.AnimationMixer(clone);
      const acts = {};
      for (const c of clips) acts[c.name] = mixer.clipAction(c);
      const f = { wrap, mixer, actions: acts, current: null, clip: '', rate: 1,
        x, z, heading: rand() * Math.PI * 2, tx: x, tz: z,
        state: 'idle', timer: 1 + rand() * 2, anchor };
      wrap.rotation.y = f.heading;
      setState(f, rand() < 0.5 ? 'sit' : 'idle', 2 + rand() * 3);
      foxes.list.push(f);
    }
  }
  new GLTFLoader().loadAsync(FOX_MODEL).then(gltf => {
    const clips = (gltf.animations || []).filter(c => FOX_ANIMS.includes(c.name));
    if (!clips.length) throw new Error('fox.glb has no usable clips');
    spawn(gltf.scene, clips);
    foxes.loaded = true;
  }).catch(err => { foxes.loadError = String((err && err.message) || err); });

  let senseTick = 0;
  function update(dt, now, player, playerSpeed) {
    senseTick -= dt;
    const sensing = senseTick <= 0;
    if (sensing) senseTick = 0.25;
    for (const f of foxes.list) {
      f.timer -= dt;
      const dx = player.x - f.x, dz = player.z - f.z;
      const dist = Math.hypot(dx, dz);
      if (sensing && f.state !== 'flee') {
        // Foxes are warier than deer and trot off early.
        if (dist < 8 || (dist < 16 && playerSpeed > 4)) startle(f, player.x, player.z);
      }
      let speed = 0;
      if (f.state === 'walk' || f.state === 'stalk' || f.state === 'trot' || f.state === 'flee') {
        const want = Math.atan2(f.tx - f.x, f.tz - f.z);
        f.heading = turnToward(f.heading, want, (f.state === 'flee' ? 3.8 : 2.4) * dt);
        speed = f.state === 'flee' ? 5.6 : f.state === 'trot' ? 3.2 : f.state === 'stalk' ? 0.7 : 1.3;
        const nx = f.x + Math.sin(f.heading) * speed * dt;
        const nz = f.z + Math.cos(f.heading) * speed * dt;
        if (valid(nx, nz)) { f.x = nx; f.z = nz; }
        else if (f.state === 'walk' || f.state === 'stalk') { pickWander(f); }
        const arrived = Math.hypot(f.tx - f.x, f.tz - f.z) < (f.state === 'flee' ? 3 : 1.4);
        if (arrived || f.timer <= 0) {
          if (f.state === 'flee' && dist < 22 && f.timer > 0) { startle(f, player.x, player.z); }
          else {
            const r = rand();
            if (r < 0.3) setState(f, 'sit', 3 + rand() * 5);
            else if (r < 0.5) setState(f, 'idle', 2 + rand() * 3);
            else if (pickWander(f)) setState(f, r < 0.7 ? 'stalk' : (r < 0.85 ? 'walk' : 'trot'), 30);
            else setState(f, 'sit', 3 + rand() * 3);
          }
        }
      } else if (f.timer <= 0) {
        if (pickWander(f)) setState(f, rand() < 0.4 ? 'stalk' : 'walk', 30);
        else setState(f, 'sit', 2 + rand() * 3);
      }
      f.wrap.position.set(f.x, terrainH(f.x, f.z), f.z);
      f.wrap.rotation.y = f.heading;
      f.mixer.update(dt);
    }
  }
  foxes.update = update;
  return foxes;
}

// ------------------------------------------------------------- rabbit ---
function createRabbits(opts) {
  const { scene, terrainH, inWater, houses } = opts;
  const rand = lcg(71723);
  const sys = { list: [], anchors: [{ x: 45, z: 88 }, { x: 20, z: 110 }] };
  const valid = (x, z) => {
    const h = terrainH(x, z);
    if (!(h > 0.7 && h < 30)) return false;
    if (inWater && inWater(x, z)) return false;
    if (slopeAt(terrainH, x, z) > 0.6) return false;
    for (const hb of houses || []) if (Math.hypot(x - hb.x, z - hb.z) < 15) return false;
    return true;
  };
  const coatM = new THREE.MeshStandardMaterial({ color: '#8a7a68', roughness: 1 });
  const whiteM = new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 1 });
  const darkM = new THREE.MeshStandardMaterial({ color: '#1a140f', roughness: 0.4 });
  const bodyG = new THREE.SphereGeometry(0.11, 12, 10);
  const headG = new THREE.SphereGeometry(0.075, 12, 10);
  const earG = new THREE.CapsuleGeometry(0.02, 0.09, 3, 8);
  const tailG = new THREE.SphereGeometry(0.035, 8, 6);
  const eyeG = new THREE.SphereGeometry(0.015, 6, 5);
  function build() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      m.castShadow = true; m.frustumCulled = false; g.add(m); return m;
    };
    add(bodyG, coatM, 0, 0.12, 0, 1.25, 0.9, 1);
    const head = add(headG, coatM, 0, 0.22, 0.1);
    const earL = add(earG, coatM, -0.035, 0.32, 0.06);
    const earR = add(earG, coatM, 0.035, 0.32, 0.06);
    earL.rotation.x = earR.rotation.x = -0.3;
    add(tailG, whiteM, 0, 0.14, -0.12);
    add(eyeG, darkM, -0.045, 0.24, 0.15);
    add(eyeG, darkM, 0.045, 0.24, 0.15);
    scene.add(g);
    return { g, head, earL, earR };
  }
  for (let i = 0; i < 4; i++) {
    const anchor = sys.anchors[i % sys.anchors.length];
    let x = anchor.x, z = anchor.z;
    for (let t = 0; t < 12; t++) {
      const cx = anchor.x + (rand() - 0.5) * 36, cz = anchor.z + (rand() - 0.5) * 36;
      if (valid(cx, cz)) { x = cx; z = cz; break; }
    }
    const parts = build();
    parts.g.position.set(x, terrainH(x, z), z);
    sys.list.push({ ...parts, x, z, heading: rand() * Math.PI * 2,
      state: 'idle', timer: 1 + rand() * 3, hopT: 0, hopDur: 0.45, hopLen: 1.2, sx: x, sz: z, anchor });
  }
  function startHop(r, bolt) {
    r.hopT = 0; r.hopDur = bolt ? 0.3 : 0.45; r.hopLen = bolt ? 2.4 : 0.8 + rand() * 0.9;
    r.sx = r.x; r.sz = r.z;
    r.state = bolt ? 'bolt' : 'hop';
  }
  function update(dt, now, player) {
    for (const r of sys.list) {
      r.timer -= dt;
      const dist = Math.hypot(player.x - r.x, player.z - r.z);
      if (r.state === 'hop' || r.state === 'bolt') {
        r.hopT += dt / r.hopDur;
        const t = Math.min(1, r.hopT);
        r.x = r.sx + Math.sin(r.heading) * r.hopLen * t;
        r.z = r.sz + Math.cos(r.heading) * r.hopLen * t;
        const arc = 4 * (r.state === 'bolt' ? 0.42 : 0.3) * t * (1 - t);
        const gy = terrainH(r.x, r.z);
        r.g.position.set(r.x, gy + arc, r.z);
        r.g.rotation.x = -0.25 + 0.5 * t;
        r.earL.rotation.x = r.earR.rotation.x = -0.3 - arc * 1.4;
        r.g.scale.set(1, t > 0.92 ? 0.8 : 1, 1);
        if (t >= 1) {
          r.g.scale.set(1, 1, 1); r.g.rotation.x = 0;
          if (r.state === 'bolt' && dist < 12 && r.timer > -4) {
            r.heading = Math.atan2(r.x - player.x, r.z - player.z) + (rand() - 0.5) * 0.6;
            startHop(r, true);
          } else setStateIdle(r);
        }
      } else {
        if (dist < 5) { // bolt!
          r.heading = Math.atan2(r.x - player.x, r.z - player.z) + (rand() - 0.5) * 0.6;
          r.timer = 3; startHop(r, true);
        } else if (dist < 10) { // freeze flat
          r.state = 'freeze'; r.g.scale.set(1.1, 0.72, 1.1);
          r.earL.rotation.x = r.earR.rotation.x = -1.1;
        } else {
          if (r.state === 'freeze') { r.g.scale.set(1, 1, 1); r.earL.rotation.x = r.earR.rotation.x = -0.3; }
          r.state = 'idle';
          r.head.position.y = 0.22 + Math.max(0, Math.sin(now * 6 + r.sx)) * 0.02; // nibbling
          if (r.timer <= 0) {
            r.timer = 1.5 + rand() * 4;
            if (rand() < 0.65) {
              const a = r.anchor;
              const tx = a.x + (rand() - 0.5) * 36, tz = a.z + (rand() - 0.5) * 36;
              if (valid(tx, tz)) { r.heading = Math.atan2(tx - r.x, tz - r.z); startHop(r, false); }
            }
          }
          r.g.position.set(r.x, terrainH(r.x, r.z), r.z);
        }
      }
      r.g.rotation.y = r.heading;
    }
  }
  function setStateIdle(r) { r.state = 'idle'; r.timer = 1 + rand() * 3; }
  sys.update = update;
  return sys;
}

// ----------------------------------------------------------- squirrel ---
function createSquirrels(opts) {
  const { scene, terrainH, inWater, treeGroup } = opts;
  const rand = lcg(42423);
  const sys = { list: [] };
  const kids = (treeGroup && treeGroup.children) || [];
  const coatM = new THREE.MeshStandardMaterial({ color: '#9a5a30', roughness: 1 });
  const creamM = new THREE.MeshStandardMaterial({ color: '#d8c4a0', roughness: 1 });
  const darkM = new THREE.MeshStandardMaterial({ color: '#140e08', roughness: 0.4 });
  const bodyG = new THREE.SphereGeometry(0.09, 12, 10);
  const headG = new THREE.SphereGeometry(0.06, 10, 8);
  const earG = new THREE.ConeGeometry(0.02, 0.05, 6);
  const eyeG = new THREE.SphereGeometry(0.013, 6, 5);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, -0.1),
    new THREE.Vector3(0, 0.22, -0.12), new THREE.Vector3(0, 0.3, -0.02)]);
  const tailG = new THREE.TubeGeometry(tailCurve, 10, 0.035, 6, false);
  function build() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true; m.frustumCulled = false;
      (parent || g).add(m); return m;
    };
    const body = add(bodyG, coatM, 0, 0.1, 0); body.scale.set(1, 0.9, 1.3);
    add(headG, coatM, 0, 0.19, 0.09);
    add(creamM ? bodyG : bodyG, creamM, 0, 0.06, 0.05).scale.set(0.7, 0.6, 0.9);
    add(earG, coatM, -0.035, 0.25, 0.07); add(earG, coatM, 0.035, 0.25, 0.07);
    add(eyeG, darkM, -0.032, 0.2, 0.135); add(eyeG, darkM, 0.032, 0.2, 0.135);
    const tail = new THREE.Group(); tail.position.set(0, 0.08, -0.1); g.add(tail);
    add(tailG, coatM, 0, 0, 0, tail);
    scene.add(g);
    return { g, tail };
  }
  for (let i = 0; i < 3; i++) {
    const t = kids.length ? kids[Math.floor(rand() * kids.length)] : null;
    const tx = t ? t.position.x : (rand() - 0.5) * 200;
    const tz = t ? t.position.z : (rand() - 0.5) * 200;
    const parts = build();
    const s = { ...parts, tx, tz, x: tx + 2, z: tz + 2, y: 0, heading: rand() * 6.28,
      state: 'ground', timer: 2 + rand() * 4, climbA: rand() * 6.28, climbY: 0, topY: 4 + rand() * 3 };
    s.y = terrainH(s.x, s.z);
    parts.g.position.set(s.x, s.y, s.z);
    sys.list.push(s);
  }
  function update(dt, now) {
    for (const s of sys.list) {
      s.timer -= dt;
      const gy = terrainH(s.tx, s.tz);
      if (s.state === 'ground') {
        // scamper: quick darts with pauses
        if (s.timer <= 0) {
          s.timer = 0.5 + rand() * 1.5;
          const a = rand() * Math.PI * 2, r = 1 + rand() * 3;
          const nx = s.tx + (s.x - s.tx) * 0.5 + Math.sin(a) * r;
          const nz = s.tz + (s.z - s.tz) * 0.5 + Math.cos(a) * r;
          if (!(inWater && inWater(nx, nz))) { s.dx = nx; s.dz = nz; }
          if (rand() < 0.3) { s.state = 'climb'; s.climbY = s.y; }
        }
        if (s.dx !== undefined) {
          const ddx = s.dx - s.x, ddz = s.dz - s.z, dd = Math.hypot(ddx, ddz);
          if (dd > 0.1) {
            s.heading = Math.atan2(ddx, ddz);
            const sp = 3.2 * dt;
            s.x += ddx / dd * Math.min(sp, dd); s.z += ddz / dd * Math.min(sp, dd);
          }
        }
        s.y = terrainH(s.x, s.z);
        s.g.position.set(s.x, s.y + Math.abs(Math.sin(now * 14)) * 0.05, s.z);
        s.g.rotation.x = 0; s.g.rotation.y = s.heading;
        s.tail.rotation.x = -0.4 + Math.sin(now * 3) * 0.15;
      } else if (s.state === 'climb') {
        s.climbA += dt * 2.2; s.climbY += dt * 1.6;
        s.x = s.tx + Math.sin(s.climbA) * 0.55; s.z = s.tz + Math.cos(s.climbA) * 0.55;
        s.y = Math.min(s.climbY, gy + s.topY);
        s.g.position.set(s.x, s.y, s.z);
        s.g.rotation.y = s.climbA + Math.PI / 2; s.g.rotation.x = -0.9;
        s.tail.rotation.x = 0.5;
        if (s.climbY >= gy + s.topY) { s.state = 'sit'; s.timer = 5 + rand() * 5; }
      } else if (s.state === 'sit') {
        s.g.position.set(s.x, s.y, s.z);
        s.g.rotation.x = -0.15; s.g.rotation.y = s.heading + Math.sin(now * 0.8) * 0.6;
        s.tail.rotation.x = -0.5 + Math.sin(now * 6) * 0.45; // tail flicks
        if (s.timer <= 0) { s.state = 'descend'; }
      } else { // descend
        s.climbA -= dt * 2.6; s.climbY -= dt * 2.0;
        s.x = s.tx + Math.sin(s.climbA) * 0.55; s.z = s.tz + Math.cos(s.climbA) * 0.55;
        s.y = Math.max(s.climbY, gy);
        s.g.position.set(s.x, s.y, s.z);
        s.g.rotation.y = s.climbA - Math.PI / 2; s.g.rotation.x = 0.9;
        if (s.climbY <= gy + 0.05) {
          s.state = 'ground'; s.timer = 3 + rand() * 5;
          s.x = s.tx + 1.5; s.z = s.tz + 1.5; s.dx = undefined;
        }
      }
    }
  }
  sys.update = update;
  return sys;
}

// --------------------------------------------------------------- frog ---
const POND_FROG = { x: 45, z: 60, r: 12 };
function createFrogs(opts) {
  const { scene, terrainH, sounds } = opts;
  const rand = lcg(51509);
  const sys = { list: [] };
  const skinM = new THREE.MeshStandardMaterial({ color: '#4a7a3a', roughness: 0.7 });
  const bellyM = new THREE.MeshStandardMaterial({ color: '#c8d890', roughness: 0.9 });
  const eyeM = new THREE.MeshStandardMaterial({ color: '#c8a020', roughness: 0.3 });
  const pupM = new THREE.MeshStandardMaterial({ color: '#0a0a08', roughness: 0.3 });
  const bodyG = new THREE.SphereGeometry(0.07, 12, 10);
  const eyeG = new THREE.SphereGeometry(0.02, 8, 6);
  const pupG = new THREE.SphereGeometry(0.01, 6, 5);
  const legG = new THREE.CapsuleGeometry(0.02, 0.06, 3, 6);
  function build() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      m.castShadow = true; m.frustumCulled = false; g.add(m); return m;
    };
    add(bodyG, skinM, 0, 0.045, 0, 1, 0.62, 1.2);
    add(bodyG, bellyM, 0, 0.03, 0.02, 0.8, 0.5, 1.0);
    add(eyeG, eyeM, -0.035, 0.085, 0.045); add(eyeG, eyeM, 0.035, 0.085, 0.045);
    add(pupG, pupM, -0.035, 0.09, 0.06); add(pupG, pupM, 0.035, 0.09, 0.06);
    const legL = add(legG, skinM, -0.07, 0.03, -0.02); legL.rotation.z = 1.2;
    const legR = add(legG, skinM, 0.07, 0.03, -0.02); legR.rotation.z = -1.2;
    scene.add(g);
    return { g };
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rand();
    const x = POND_FROG.x + Math.cos(a) * (POND_FROG.r + 1.5);
    const z = POND_FROG.z + Math.sin(a) * (POND_FROG.r + 1.5);
    const parts = build();
    parts.g.position.set(x, Math.max(terrainH(x, z), 0) + 0.01, z);
    sys.list.push({ ...parts, x, z, heading: Math.atan2(POND_FROG.x - x, POND_FROG.z - z),
      state: 'sit', timer: 1 + rand() * 3, hopT: 0, sx: x, sz: z, tx: x, tz: z });
  }
  function update(dt, now, player) {
    for (const f of sys.list) {
      f.timer -= dt;
      const dp = Math.hypot(f.x - POND_FROG.x, f.z - POND_FROG.z);
      const inPond = dp < POND_FROG.r;
      if (f.state === 'hop') {
        f.hopT += dt / 0.38;
        const t = Math.min(1, f.hopT);
        f.x = f.sx + (f.tx - f.sx) * t; f.z = f.sz + (f.tz - f.sz) * t;
        const arc = 4 * 0.28 * t * (1 - t);
        const gy = Math.max(terrainH(f.x, f.z), inPond ? -0.05 : 0);
        f.g.position.set(f.x, gy + 0.01 + arc, f.z);
        f.g.rotation.x = -0.3 + 0.6 * t;
        if (t >= 1) {
          f.g.rotation.x = 0; f.state = 'sit'; f.timer = 1.5 + rand() * 4;
          const dp2 = Math.hypot(f.x - POND_FROG.x, f.z - POND_FROG.z);
          if (dp2 < POND_FROG.r && Math.hypot(player.x - f.x, player.z - f.z) < 25) {
            try { sounds && sounds.effect && sounds.effect('splash'); } catch (e) { /* optional */ }
          }
        }
      } else {
        // throat-bob while sitting; swim drift when floating
        f.g.scale.set(1, 1 + Math.sin(now * 5 + f.sx) * 0.06, 1);
        if (inPond) {
          f.heading = Math.atan2(POND_FROG.x - f.x + 3, POND_FROG.z - f.z);
          f.x += Math.sin(f.heading) * 0.25 * dt; f.z += Math.cos(f.heading) * 0.25 * dt;
          f.g.position.set(f.x, 0.02, f.z);
          if (f.timer <= 0) { // hop out toward bank
            const a = Math.atan2(f.z - POND_FROG.z, f.x - POND_FROG.x);
            f.sx = f.x; f.sz = f.z;
            f.tx = POND_FROG.x + Math.cos(a) * (POND_FROG.r + 1);
            f.tz = POND_FROG.z + Math.sin(a) * (POND_FROG.r + 1);
            f.heading = Math.atan2(f.tx - f.sx, f.tz - f.sz);
            f.hopT = 0; f.state = 'hop';
          }
        } else if (f.timer <= 0) {
          f.timer = 2 + rand() * 5;
          const dist = Math.hypot(player.x - f.x, player.z - f.z);
          f.sx = f.x; f.sz = f.z;
          if (dist < 4) { // plop! escape into the pond
            f.tx = POND_FROG.x + (f.x - POND_FROG.x) * 0.55;
            f.tz = POND_FROG.z + (f.z - POND_FROG.z) * 0.55;
          } else if (rand() < 0.5) {
            const a = Math.atan2(f.x - POND_FROG.x, f.z - POND_FROG.z) + (rand() - 0.5) * 2;
            const rr = POND_FROG.r + 0.5 + rand() * 2.5;
            f.tx = POND_FROG.x + Math.sin(a) * rr; f.tz = POND_FROG.z + Math.cos(a) * rr;
          } else continue;
          f.heading = Math.atan2(f.tx - f.sx, f.tz - f.sz);
          f.hopT = 0; f.state = 'hop';
        }
        if (f.state === 'sit' && !inPond) f.g.position.set(f.x, Math.max(terrainH(f.x, f.z), 0) + 0.01, f.z);
      }
      f.g.rotation.y = f.heading;
    }
  }
  sys.update = update;
  return sys;
}

// ------------------------------------------------------------------ api --

export function createWildlife(opts) {
  const herd = createDeerHerd(opts);
  const flock = createBirdFlock(opts);
  const forage = createForage(opts);
  const foxes = createFoxes(opts);
  const rabbits = createRabbits(opts);
  const squirrels = createSquirrels(opts);
  const frogs = createFrogs(opts);
  const lastPlayer = new THREE.Vector3();
  let playerSpeed = 0, first = true;
  return {
    update(dt, now, env) {
      dt = Math.min(dt, 0.05);
      const cam = opts.camera.position;
      if (first) { lastPlayer.copy(cam); first = false; }
      else {
        const inst = _v.copy(cam).sub(lastPlayer).length() / Math.max(dt, 0.001);
        playerSpeed += (Math.min(inst, 12) - playerSpeed) * Math.min(1, dt * 3);
        lastPlayer.copy(cam);
      }
      herd.update(dt, now, cam, playerSpeed);
      flock.update(dt, now, cam, env.day, env.weather);
      forage.update(dt);
      foxes.update(dt, now, cam, playerSpeed);
      rabbits.update(dt, now, cam);
      squirrels.update(dt, now);
      frogs.update(dt, now, cam);
    },
    forage() {
      const c = opts.camera.position;
      const ok = forage.forage(c.x, c.z);
      if (!ok) return { hint: 'No ripe forage within reach.' };
      const s = forage.stats(), lp = forage.lastPick;
      return { picked: true, name: (lp && lp.name) || 'Forage', count: s.basket };
    },
    forageAtCamera() { const r = this.forage(); return !!(r && r.picked); },
    killDeer(maxDist) {
      const c = opts.camera.position;
      let best = null, bd = maxDist || 12;
      for (const d of herd.deer) {
        const dd = Math.hypot(c.x - d.x, c.z - d.z);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (!best) return null;
      opts.scene.remove(best.wrap);
      herd.deer.splice(herd.deer.indexOf(best), 1);
      return { x: best.x, z: best.z };
    },
    nearestForage() { return forage.nearestPoint(opts.camera.position.x, opts.camera.position.z); },
    deerSpot() {
      const d = herd.deer[0];
      if (!d) return null;
      return { pos: [d.x, herd && opts.terrainH(d.x, d.z), d.z] };
    },
    rabbitSpot() {
      const r = rabbits.list[0];
      if (!r) return null;
      return { pos: [r.x, opts.terrainH(r.x, r.z), r.z] };
    },
    diagnostics() {
      return {
        deer: herd.deer.length,
        deerLoaded: herd.loaded,
        birds: flock.birds.length,
        birdSpecies: 3,
        flying: flock.flying(),
        calls: flock.calls,
        loadError: herd.loadError,
        deerPos: herd.deer.length ? [+herd.deer[0].x.toFixed(1), +herd.deer[0].z.toFixed(1)] : null,
        foxes: foxes.list.length,
        foxLoaded: foxes.loaded,
        foxError: foxes.loadError,
        rabbits: rabbits.list.length,
        squirrels: squirrels.list.length,
        frogs: frogs.list.length,
        deerState: herd.deer.length ? herd.deer[0].state : null,
      };
    },
    effects() { return forage.stats(); },
  };
}

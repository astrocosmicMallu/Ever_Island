import * as THREE from 'three';

/** Pale birch bark with dark horizontal lenticel fissures. */
export function birchBark() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#ddd9c8'; x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 512; i += 2) {
    x.fillStyle = `rgba(120,118,104,${.04 + Math.random() * .06})`;
    x.fillRect(0, i, 256, 1);
  }
  for (let i = 0; i < 46; i++) {
    const y = Math.random() * 512, w = 20 + Math.random() * 90, h = 2 + Math.random() * 5;
    x.fillStyle = `rgba(38,34,28,${.55 + Math.random() * .35})`;
    const px = Math.random() * 256;
    x.beginPath(); x.ellipse(px, y, w / 2, h, 0, 0, 6.29); x.fill();
    x.fillStyle = 'rgba(230,228,214,.5)';
    x.beginPath(); x.ellipse(px, y - h, w / 3, h * .5, 0, 0, 6.29); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Spring cherry-blossom canopy: layered pink-white petal clusters. */
export function blossoms() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#6d7f62'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const px = Math.random() * 512, py = Math.random() * 512, r = 3 + Math.random() * 9;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const tint = ['#f3dfe4', '#eec3cf', '#f7ecec', '#e5aebd'][i % 4];
    g.addColorStop(0, tint); g.addColorStop(.7, tint + 'cc'); g.addColorStop(1, 'rgba(240,200,210,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, r, 0, 6.29); x.fill();
  }
  x.fillStyle = '#d7ac41';
  for (let i = 0; i < 260; i++) {
    x.globalAlpha = .5;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Forest-floor fungi: clustered toadstools (instanced stems + caps) on
 * damp low ground that stays clear of water. The caller hides the whole
 * group under winter snow via .visible.
 */
export function createFungi(scene, terrainH, inWater) {
  let seed = 42423;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const group = new THREE.Group();
  const spots = [];
  for (let i = 0; i < 90 && spots.length < 46; i++) {
    const x = 80 + (rand() - .5) * 420, z = (rand() - .5) * 420;
    const h = terrainH(x, z);
    if (inWater && inWater(x, z)) continue;
    if (!(h > .8 && h < 26)) continue;
    spots.push({ x, z, h });
  }
  const per = 3, count = spots.length * per;
  const stemGeo = new THREE.CylinderGeometry(.035, .055, .3, 7);
  const capGeo = new THREE.SphereGeometry(.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const stemMat = new THREE.MeshStandardMaterial({ color: '#ddd5bd', roughness: .9 });
  const capMat = new THREE.MeshStandardMaterial({ color: '#a8503c', roughness: .55 });
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
  const caps = new THREE.InstancedMesh(capGeo, capMat, count);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  let n = 0;
  for (const s of spots) {
    for (let j = 0; j < per; j++) {
      const x = s.x + (rand() - .5) * 1.6, z = s.z + (rand() - .5) * 1.6;
      const y = terrainH(x, z), sc = .6 + rand() * 1.1;
      dummy.position.set(x, y + .15 * sc, z);
      dummy.rotation.set((rand() - .5) * .25, rand() * 6.28, (rand() - .5) * .25);
      dummy.scale.setScalar(sc); dummy.updateMatrix();
      stems.setMatrixAt(n, dummy.matrix);
      dummy.position.y = y + .3 * sc; dummy.updateMatrix();
      caps.setMatrixAt(n, dummy.matrix);
      color.set(['#a8503c', '#c07a45', '#8a4a3a'][n % 3]);
      caps.setColorAt(n, color);
      n++;
    }
  }
  stems.count = caps.count = n;
  stems.castShadow = caps.castShadow = true;
  group.add(stems, caps);
  scene.add(group);
  return group;
}

import * as THREE from 'three';

/**
 * Trailhead campsite: canvas A-tent with rolled-back doorway flaps, ridge
 * poles and guy ropes, bedroll, storm lantern with a real point light, and
 * a duffel bag. Positioned/rotated via opts so settlements can place it
 * anywhere; registers one tent collider in world space.
 */
export function makeCamp(scene, terrainH, collider, opts = {}) {
  const cx = opts.x ?? 12, cz = opts.z ?? 7;
  const camp = new THREE.Group();
  camp.position.set(cx, terrainH(cx, cz) + .06, cz);
  camp.rotation.y = opts.rotation ?? -.38;
  scene.add(camp);
  const fabricCanvas = document.createElement('canvas'); fabricCanvas.width = fabricCanvas.height = 256;
  const ctx = fabricCanvas.getContext('2d');
  ctx.fillStyle = '#9b6234'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i++) {
    ctx.strokeStyle = i % 2 ? '#ffffff09' : '#00000010';
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  const fabric = new THREE.CanvasTexture(fabricCanvas);
  fabric.colorSpace = THREE.SRGBColorSpace;
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping; fabric.repeat.set(3, 3);
  const tentMat = new THREE.MeshStandardMaterial({ map: fabric, color: '#b79261', roughness: .77, side: THREE.DoubleSide });
  const verts = [-2,0,-2, 0,2.65,-2, 0,2.65,2, -2,0,-2, 0,2.65,2, -2,0,2, 0,2.65,-2, 2,0,-2, 2,0,2, 0,2.65,-2, 2,0,2, 0,2.65,2, -2,0,-2, 2,0,-2, 0,2.65,-2];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const uv = []; for (let i = 0; i < 5; i++) uv.push(0, 0, .5, 1, 1, 0);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, tentMat);
  roof.castShadow = true; roof.receiveShadow = true; camp.add(roof);
  // Open front doorway, with two rolled-back canvas flaps.
  const flapGeo = new THREE.BufferGeometry();
  flapGeo.setAttribute('position', new THREE.Float32BufferAttribute([-2,0,2, 0,2.65,2, -1.05,0,2.04, 2,0,2, 1.05,0,2.04, 0,2.65,2], 3));
  flapGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, .5,1, 1,0, 0,0, 1,0, .5,1], 2));
  flapGeo.computeVertexNormals();
  camp.add(new THREE.Mesh(flapGeo, tentMat));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 3.9), new THREE.MeshStandardMaterial({ color: '#202723', roughness: .85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .025; camp.add(floor);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#3d4744', metalness: .75, roughness: .28 });
  function rod(a, b, r, mat) {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat);
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    camp.add(m);
  }
  rod(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 2.72, 2), .025, poleMat);
  rod(new THREE.Vector3(0, 2.68, -2.15), new THREE.Vector3(0, 2.68, 2.15), .024, poleMat);
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#b6b29d', roughness: 1 });
  for (const z of [-2, 2]) for (const x of [-1, 1]) {
    rod(new THREE.Vector3(0, 2.65, z), new THREE.Vector3(x * 3.5, .03, z * 1.5), .009, ropeMat);
    rod(new THREE.Vector3(x * 3.5, 0, z * 1.5), new THREE.Vector3(x * 3.5, .22, z * 1.5), .022, poleMat);
  }
  const sleeping = new THREE.Mesh(new THREE.CapsuleGeometry(.4, 1.35, 5, 10), new THREE.MeshStandardMaterial({ color: '#7d8067', roughness: 1 }));
  sleeping.rotation.x = Math.PI / 2; sleeping.scale.z = .5; sleeping.position.set(.6, .2, 0); camp.add(sleeping);
  const lantern = new THREE.Group(); lantern.position.set(-.8, .45, 2.25); camp.add(lantern);
  const lightMat = new THREE.MeshStandardMaterial({ color: '#ffd093', emissive: '#ffa74d', emissiveIntensity: 3 });
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(.1, .12, .26, 12), lightMat); lantern.add(bulb);
  for (const y of [-.17, .17]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .07, 12), poleMat);
    cap.position.y = y; lantern.add(cap);
  }
  const light = new THREE.PointLight('#ffb85f', 13, 8, 1.8);
  light.position.set(-.8, .8, 2); camp.add(light);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(.7, 1, .38, 2, 2, 2), new THREE.MeshStandardMaterial({ color: '#515942', roughness: 1 }));
  bag.rotation.z = .14; bag.position.set(2.5, .47, 1.6); bag.castShadow = true; camp.add(bag);
  collider(cx, cz, 2.4);
}

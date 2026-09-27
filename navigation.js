import * as THREE from 'three';

/**
 * Everwood navigation — cabin-local/world transforms, walkable surfaces
 * (ground floor, stair run, upper slab, porch ramp) and NPC waypoint routes.
 *
 * Conventions match buildAsianCabin exactly:
 *  - cabin group: position (cx, baseY, cz), rotation.y = rot
 *  - world = R(rot) * local + origin, with
 *      wx = cx + lx*cos(rot) + lz*sin(rot)
 *      wz = cz - lx*sin(rot) + lz*cos(rot)
 *  - local +z faces the front door / porch; stairs ascend from op.x1 (lower)
 *    to op.x0 (upper) inside the op stairwell opening.
 */

function cabinOrigin(cab) {
  return { x: cab.cx ?? cab.x ?? 0, z: cab.cz ?? cab.z ?? 0 };
}

/** Cabin-local (x, y-above-base, z) -> world Vector3. */
export function localToWorld(cab, x, y, z) {
  const o = cabinOrigin(cab), r = cab.rot || 0;
  const c = Math.cos(r), s = Math.sin(r);
  return new THREE.Vector3(
    o.x + x * c + z * s,
    (cab.baseY || 0) + y,
    o.z - x * s + z * c
  );
}

/** World (x, z) -> cabin-local {x, z}. */
export function worldToLocal(cab, x, z) {
  const o = cabinOrigin(cab), r = -(cab.rot || 0);
  const dx = x - o.x, dz = z - o.z;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

/**
 * Walkable floor height (world Y) at (x, z), or NaN when no cabin floor
 * applies (caller falls back to terrain). currentY is the walker's eye
 * height; the level is picked from the feet position so stairs, the upper
 * slab and the porch ramp all resolve continuously.
 */
export function cabinSurface(cabins, terrainH, x, z, currentY, EYE) {
  const eyeH = EYE || 1.7;
  for (const cab of cabins) {
    const l = worldToLocal(cab, x, z);
    const CHW = cab.CHW ?? 6.5, CHD = cab.CHD ?? 5;
    const baseY = cab.baseY || 0;
    const inFoot = Math.abs(l.x) < CHW && Math.abs(l.z) < CHD;
    const onPorch = Math.abs(l.x) < 1.55 && l.z >= CHD && l.z <= 8.5;
    if (!inFoot && !onPorch) continue;
    const floorW = baseY + (cab.floorTopLocal ?? 0.3);
    const slabW = baseY + (cab.slabTopLocal ?? 4.0);
    if (onPorch && !inFoot) {
      // Exterior threshold ramp: cabin floor down to the terrain exit point.
      const t = (l.z - CHD) / (8.5 - CHD);
      const o = cabinOrigin(cab), r = cab.rot || 0;
      const ex = o.x + 8.5 * Math.sin(r), ez = o.z + 8.5 * Math.cos(r);
      const exitW = terrainH ? terrainH(ex, ez) : floorW;
      return floorW + (exitW - floorW) * t;
    }
    const op = cab.op;
    if (op && cab.hasRamp && l.x >= op.x0 && l.x <= op.x1 && l.z >= op.z0 && l.z <= op.z1) {
      // Stair run: linear tread ramp from the lower to the upper landing.
      const t = (op.x1 - l.x) / (op.x1 - op.x0);
      return floorW + (slabW - floorW) * t;
    }
    const feet = currentY - eyeH;
    return feet > (floorW + slabW) / 2 ? slabW : floorW;
  }
  return NaN;
}

/**
 * Outdoor waypoint route (world Vector3s with terrain heights) from start to
 * goal. Waypoints sidestep open water (via inWater) and steer around trunk /
 * rock / furniture colliders (via collidesFn(x, feetY, z)) with perpendicular
 * offsets, plus midpoint guards so no leg cuts through an obstacle. The goal
 * is always kept exact (fire chairs and doorsteps are clear standing spots).
 * collidesFn is the world's collidesAt(x, eyeY, z); inWater is the water
 * probe. Both are optional — with no callbacks this degrades to a straight
 * multipart route.
 */
export function outdoorPath(start, goal, terrainH, collidesFn, inWater) {
  const pts = [];
  const dist = Math.hypot(goal.x - start.x, goal.z - start.z);
  const n = Math.max(1, Math.ceil(dist / 4));
  let px = 0, pz = 0;
  if (dist > 0.001) { px = -(goal.z - start.z) / dist; pz = (goal.x - start.x) / dist; }
  const groundY = (x, z) => (terrainH ? terrainH(x, z) : 0);
  const wet = (x, z) => (typeof inWater === 'function' && inWater(x, z));
  const blocked = (x, z) => {
    if (typeof collidesFn !== 'function') return false;
    // collidesAt(x, eyeY, z): probe with feet planted on the terrain.
    try { return !!collidesFn(x, groundY(x, z) + 1.7, z); } catch { return false; }
  };
  const steer = (x, z, isGoal) => {
    if (isGoal) return [x, z];
    if (wet(x, z)) { x += px * 7; z += pz * 7; }
    if (!blocked(x, z)) return [x, z];
    for (const d of [2, 4, 6, 8, 10, 12]) {
      for (const s of [1, -1]) {
        const nx = x + px * d * s, nz = z + pz * d * s;
        if (!wet(nx, nz) && !blocked(nx, nz)) return [nx, nz];
      }
    }
    return [x, z];
  };
  let prevX = start.x, prevZ = start.z;
  for (let i = 1; i <= n; i++) {
    const t = i / n, isGoal = i === n;
    let x = start.x + (goal.x - start.x) * t;
    let z = start.z + (goal.z - start.z) * t;
    if (!isGoal) {
      const mx = (prevX + x) / 2, mz = (prevZ + z) / 2;
      if (blocked(mx, mz)) {
        const [sx, sz] = steer(mx, mz, false);
        pts.push(new THREE.Vector3(sx, groundY(sx, sz), sz));
        prevX = sx; prevZ = sz;
      }
    }
    [x, z] = steer(x, z, isGoal);
    pts.push(new THREE.Vector3(x, groundY(x, z), z));
    prevX = x; prevZ = z;
  }
  if (pts.length) pts[pts.length - 1].copy(goal);
  return pts;
}

/**
 * Interior route for the cabin worker, ordered desk -> porch exit in world
 * coordinates with true floor heights (upper slab, stair slope, ground
 * floor, doorway). The NPC stepper lerps 3D position between waypoints, so
 * the stair descent follows the tread slope exactly. Callers reverse this
 * for the morning return trip and re-ground the exit point on the terrain.
 */
export function workerInteriorRoute(cab, to) {
  const slab = cab.slabTopLocal ?? 4.0, floor = cab.floorTopLocal ?? 0.3;
  const op = cab.op || { x0: -2, x1: 2.8, z0: -3.5, z1: 0.5 };
  const zmid = (op.z0 + op.z1) / 2;
  const P = (x, y, z) => localToWorld(cab, x, y, z);
  const pts = [];
  if (to && Number.isFinite(to.x) && Number.isFinite(to.z))
    pts.push(new THREE.Vector3(to.x, (cab.baseY || 0) + slab, to.z));
  pts.push(P(-2.6, slab, zmid));   // upper landing beside the stairwell
  pts.push(P(op.x0, slab, zmid));  // stair head
  pts.push(P(op.x1, floor, zmid)); // stair foot
  pts.push(P(1.2, floor, 1.5));    // hall (clear of table and kitchen)
  pts.push(P(0, floor, 5.2));      // doorway (|x| < 1.6 opening)
  pts.push(P(0, floor, 8.6));      // porch exit
  return pts;
}

import * as THREE from 'three';

/**
 * Procedurally painted botanical atlas (individual lanceolate leaves with
 * vein detail, tapered branching, fern fronds). Alpha-tested cards preserve
 * fine silhouettes at distance without any image downloads.
 *
 * kind: 'leaves' | 'fern'. rand: seeded random function (defaults to Math.random).
 */
export function createBotanical(kind, rand) {
  const R = typeof rand === 'function' ? rand : Math.random;
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  function leaf(x, y, a, len, w) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 0, -len);
    g.addColorStop(0, '#172c13');
    g.addColorStop(.5, kind === 'fern' ? '#627844' : '#587440');
    g.addColorStop(1, '#9ea36a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-w, -len * .3, -w * .7, -len * .74, 0, -len);
    ctx.bezierCurveTo(w * .9, -len * .74, w * .6, -len * .22, 0, 0);
    ctx.fill();
    ctx.strokeStyle = '#c0c68b50'; ctx.lineWidth = .65;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len * .94); ctx.stroke();
    ctx.restore();
  }
  if (kind === 'fern') {
    for (let f = 0; f < 9; f++) {
      const a = (f - 4) * .23, ox = 512, oy = 990, len = 520 + R() * 330;
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(a);
      ctx.strokeStyle = '#657741'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(60, -len * .4, 0, -len); ctx.stroke();
      for (let j = 1; j < 24; j++) {
        const t = j / 24, y = -t * len, x = Math.sin(t * Math.PI) * 26;
        const l = 105 * Math.sin(t * Math.PI) * (.8 + R() * .3);
        leaf(x, y, -1.1, l, 13); leaf(x, y, 1.1, l, 13);
      }
      ctx.restore();
    }
  } else {
    const branch = (x, y, a, len, depth) => {
      const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
      ctx.strokeStyle = depth > 1 ? '#3a3a26' : '#67714a';
      ctx.lineWidth = depth * 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      if (depth > 0) {
        for (let j = 1; j <= 4; j++) {
          const t = j / 4;
          branch(x + (ex - x) * t, y + (ey - y) * t, a + (j % 2 ? -.7 : .7), len * .45, depth - 1);
        }
      } else {
        for (let j = 0; j < 6; j++) {
          const t = j / 6;
          leaf(x + (ex - x) * t, y + (ey - y) * t, a + (j % 2 ? .9 : -.9), 28 + R() * 25, 9 + R() * 7);
        }
      }
    };
    branch(512, 985, -.26, 420, 3); branch(512, 985, .48, 420, 3); branch(512, 985, -.9, 290, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

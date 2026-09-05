(() => {
  const stage = document.querySelector('.cat-walk');
  const canvas = stage?.querySelector('.cat-walk-sprite');
  const pet = document.querySelector('.pet-card');
  if (!stage || !canvas || !pet) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = 40;
  canvas.height = 28;
  ctx.imageSmoothingEnabled = false;

  const color = {
    outline: '#805039', orange: '#c58049', light: '#dda16d',
    stripe: '#a46136', cream: '#f6eee3', eye: '#171614', pink: '#d8aaa6', tooth: '#fffaf0'
  };
  // Separate pixel prop keeps the cat's original sprite size and layout intact.
  const treat = document.createElement('canvas');
  treat.className = 'cat-walk-treat';
  treat.width = 12;
  treat.height = 10;
  treat.hidden = true;
  stage.append(treat);
  const treatCtx = treat.getContext('2d');
  if (treatCtx) {
    treatCtx.fillStyle = '#805039';
    treatCtx.fillRect(2, 3, 8, 4);
    treatCtx.fillRect(4, 2, 5, 6);
    treatCtx.fillStyle = '#dba15c';
    treatCtx.fillRect(3, 3, 6, 3);
    treatCtx.fillStyle = '#f2cd8d';
    treatCtx.fillRect(4, 3, 3, 1);
    treatCtx.fillStyle = '#a86436';
    treatCtx.fillRect(5, 5, 3, 1);
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let frameRequest = 0;
  let stillTimer = 0;
  let startedAt = 0;
  let lastPaint = -Infinity;
  let travel = 0;
  let sequence = [];
  let totalDuration = 0;
  let playStarted = null;
  let petStarted = null;
  let tailStarted = null;
  let attention = null;
  let walkAway = null;
  let quietUntil = 0;
  let cursorPoint = null;
  let tailRoot = { x: 11, y: 21 };
  let petTimer = 0;
  let headRegion = { left: 20, right: 40, top: 3, bottom: 23 };
  let stroke = null;
  let currentX = 0;
  let direction = 1;

  function rect(x, y, width, height, ink) {
    ctx.fillStyle = ink;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  }

  // Integer scan lines keep every contour a hand-drawn pixel edge.
  function polygon(points, ink) {
    ctx.fillStyle = ink;
    if (!points.flat().every(Number.isFinite)) return;
    const low = Math.max(0, Math.floor(Math.min(...points.map(point => point[1]))));
    const high = Math.min(28, Math.ceil(Math.max(...points.map(point => point[1]))));
    for (let y = low; y < high; y++) {
      const crossings = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5)) {
          crossings.push(a[0] + (y + .5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const left = Math.ceil(crossings[i] - .5);
        const right = Math.ceil(crossings[i + 1] - .5);
        ctx.fillRect(left, y, right - left, 1);
      }
    }
  }

  function line(points, ink, thickness = 1) {
    for (let i = 1; i < points.length; i++) {
      let [x, y] = points[i - 1].map(Math.round);
      const [endX, endY] = points[i].map(Math.round);
      if (![x, y, endX, endY].every(Number.isFinite)) continue;
      const dx = Math.abs(endX - x);
      const dy = -Math.abs(endY - y);
      const stepX = x < endX ? 1 : -1;
      const stepY = y < endY ? 1 : -1;
      let error = dx + dy;
      const maxSteps = Math.min(128, Math.max(dx, -dy) + 1);
      for (let step = 0; step < maxSteps; step++) {
        rect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, ink);
        if (x === endX && y === endY) break;
        const twice = error * 2;
        if (twice >= dy) { error += dy; x += stepX; }
        if (twice <= dx) { error += dx; y += stepY; }
      }
    }
  }

  function limb(points, far = false) {
    line(points, color.outline, 4);
    line(points, far ? color.stripe : color.orange, 2);
    const [x, y] = points[points.length - 1];
    rect(x - 1, y, 4, 1, color.outline);
    rect(x - 1, y - 1, 3, 1, far ? color.orange : color.cream);
  }

  // Two connected bones and a small flat paw keep the gait compact.
  function groundLeg(root, foot, far = false, length = 3.5) {
    const dx = foot[0] - root[0], dy = foot[1] - root[1];
    const distance = Math.max(.01, Math.hypot(dx, dy));
    const reach = Math.min(distance, length * 2 - .01);
    const end = [root[0] + dx / distance * reach, root[1] + dy / distance * reach];
    const bend = Math.sqrt(Math.max(0, length * length - reach * reach / 4));
    const knee = [(root[0] + end[0]) / 2 - dy / distance * bend,
      (root[1] + end[1]) / 2 + dx / distance * bend];
    line([root, knee, end], color.outline, 3);
    line([root, knee, end], far ? color.stripe : color.orange, 2);
    rect(end[0] - 1, end[1] - 1, 3, 2, far ? color.light : color.cream);
  }

  function tail(bob, sway = 0, sitting = false) {
    const points = sitting
      ? [[14, 24], [8, 25], [5, 23], [5 + sway, 20]]
      : [[11, 21 + bob], [6, 20 + bob], [3, 17 + bob], [3, 13 + bob], [5 + sway, 11 + bob]];
    const matrix = ctx.getTransform();
    const [rootX, rootY] = points[0];
    tailRoot = { x: matrix.a * rootX + matrix.c * rootY + matrix.e,
      y: matrix.b * rootX + matrix.d * rootY + matrix.f };
    line(points, color.outline, 5);
    line(points, color.orange, 3);
    const [tipX, tipY] = points[points.length - 1];
    rect(tipX - 1, tipY, 2, 2, color.stripe);
  }

  function body(bob = 0, rump = 0) {
    const rise = x => rump * Math.max(0, Math.min(1, (26 - x) / 15));
    const shift = points => points.map(([x, y]) => [x, y + bob - rise(x)]);
    polygon(shift([[9, 16], [11, 13], [15, 11], [23, 11], [27, 14], [29, 19], [28, 23], [25, 25], [12, 25], [8, 23], [7, 19]]), color.outline);
    polygon(shift([[10, 16], [12, 14], [15, 12], [22, 12], [26, 15], [28, 19], [27, 22], [24, 24], [12, 24], [9, 22], [8, 19]]), color.orange);
    rect(12, 15 + bob - rise(17), 10, 3, color.light);
    polygon(shift([[13, 21], [23, 20], [27, 21], [25, 24], [13, 24], [11, 23]]), color.cream);
    rect(13, 13 + bob - rise(14), 2, 3, color.stripe);
    rect(18, 12 + bob - rise(19), 2, 3, color.stripe);
  }

  function head(dx = 0, dy = 0, expression = 'normal', mouth = 0, tilt = 0) {
    const turn = ([x, y]) => [25 + (x - 25) * Math.cos(tilt) - (y - 22) * Math.sin(tilt),
      22 + (x - 25) * Math.sin(tilt) + (y - 22) * Math.cos(tilt)];
    const shift = points => points.map(([x, y]) => turn([x + dx, y + dy]));
    // Rasterize tilted shapes on the pixel grid, keeping the face and teeth crisp.
    const box = (x, y, width, height, ink) => {
      if (!tilt) { rect(x, y, width, height, ink); return; }
      polygon([[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(turn), ink);
    };
    const inkLine = (points, ink, thickness = 1) => line(points.map(turn), ink, thickness);
    const matrix = ctx.getTransform();
    const corners = [[20 + dx, 3 + dy], [40 + dx, 3 + dy], [20 + dx, 23 + dy], [40 + dx, 23 + dy]]
      .map(turn).map(([x, y]) => [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f]);
    headRegion = { left: Math.min(...corners.map(p => p[0])), right: Math.max(...corners.map(p => p[0])),
      top: Math.min(...corners.map(p => p[1])), bottom: Math.max(...corners.map(p => p[1])) };
    // Oversized British Shorthair cheeks, small rounded ears, and an orange-white blaze.
    polygon(shift([[21, 10], [22, 7], [22, 4], [23, 3], [25, 3], [28, 6], [32, 6], [35, 3], [37, 3], [38, 4], [38, 8], [40, 11], [40, 18], [38, 21], [35, 23], [25, 23], [21, 21], [19, 18], [19, 13]]), color.outline);
    polygon(shift([[22, 10], [23, 8], [23, 5], [25, 5], [27, 8], [33, 8], [36, 5], [37, 5], [37, 9], [39, 12], [39, 17], [37, 20], [34, 22], [25, 22], [22, 20], [20, 17], [20, 13]]), color.orange);
    box(23 + dx, 6 + dy, 2, 2, color.pink);
    box(35 + dx, 6 + dy, 2, 2, color.pink);
    box(21 + dx, 13 + dy, 3, 4, color.light);
    box(37 + dx, 13 + dy, 2, 4, color.light);
    box(27 + dx, 9 + dy, 2, 2, color.stripe);
    box(33 + dx, 9 + dy, 2, 2, color.stripe);
    polygon(shift([[30, 9], [31, 11], [32, 13], [34, 15], [37, 17], [38, 19], [35, 22], [25, 22], [22, 20], [22, 17], [26, 15], [28, 13], [29, 11]]), color.cream);
    box(30 + dx, 17 + dy, 3, 1, color.pink);
    box(31 + dx, 18 + dy, 1, 1, color.pink);
    // A small mouth-side marking fades into the cream fur at its pixel edges.
    box(28 + dx, 18 + dy, 2, 2, `${color.orange}55`);
    box(29 + dx, 18 + dy, 1, 1, `${color.orange}88`);
    box(28 + dx, 19 + dy, 1, 1, `${color.orange}55`);
    box(29 + dx, 19 + dy, 1, 1, color.orange);
    box(30 + dx, 19 + dy, 1, 1, `${color.orange}55`);
    box(29 + dx, 20 + dy, 1, 1, `${color.orange}44`);
    if (expression === 'normal') {
      for (const eyeX of [25, 34]) {
        box(eyeX + dx, 13 + dy, 3, 3, color.eye);
        box(eyeX + dx, 13 + dy, 1, 1, color.cream);
      }
      box(31 + dx, 19 + dy, 1, 1, color.outline);
      box(30 + dx, 20 + dy, 1, 1, color.outline);
      box(32 + dx, 20 + dy, 1, 1, color.outline);
    } else {
      box(25 + dx, 14 + dy, 3, 1, color.eye);
      box(34 + dx, 14 + dy, 3, 1, color.eye);
      if (expression === 'pet') {
        box(25 + dx, 14 + dy, 3, 1, color.orange);
        box(34 + dx, 14 + dy, 3, 1, color.orange);
        inkLine([[25 + dx, 15 + dy], [26 + dx, 14 + dy], [27 + dx, 15 + dy]], color.eye);
        inkLine([[34 + dx, 15 + dy], [35 + dx, 14 + dy], [36 + dx, 15 + dy]], color.eye);
        inkLine([[30 + dx, 19 + dy], [31 + dx, 20 + dy], [32 + dx, 19 + dy]], color.outline);
      }
      if (expression === 'yawn' && mouth > 0) {
        // Keep the nose above the mouth; the small canines sit on the upper jaw.
        box(28 + dx, 18 + dy, 7, mouth + 1, color.cream);
        box(31 + dx, 18 + dy, 1, 1, color.pink);
        box(29 + dx, 19 + dy, 5, mouth, color.eye);
        box(30 + dx, 18 + dy + mouth, 3, 1, color.pink);
        if (mouth >= 2) {
          box(29 + dx, 19 + dy, mouth >= 3 ? 2 : 1, 1, color.tooth);
          box((mouth >= 3 ? 32 : 33) + dx, 19 + dy, mouth >= 3 ? 2 : 1, 1, color.tooth);
          if (mouth >= 3) {
            box(29 + dx, 20 + dy, 1, 1, color.tooth);
            box(33 + dx, 20 + dy, 1, 1, color.tooth);
          }
        }
      }
    }
  }

  function drawWalk(frame) {
    const phase = frame % 12 / 12 * Math.PI * 2;
    const bob = Math.round(-.55 * Math.sin(phase * 2) ** 2);
    const foot = (x, offset) => {
      const angle = phase + offset;
      return [x + 2 * Math.cos(angle), 26 - Math.max(0, -Math.sin(angle))];
    };
    tail(bob, Math.round(Math.sin(phase) * .5));
    groundLeg([14, 21 + bob], foot(14, Math.PI), true);
    groundLeg([25, 21 + bob], foot(25, 0), true);
    body(bob);
    groundLeg([16, 22 + bob], foot(16, 0));
    groundLeg([27, 22 + bob], foot(27, Math.PI));
    head(0, bob);
  }

  function drawYawn(progress) {
    const open = Math.sin(progress * Math.PI) ** 2;
    const mouth = Math.round(open * 4);
    tail(0, 0);
    groundLeg([14, 22], [13, 26], true);
    groundLeg([25, 22], [29, 26], true, 4);
    body(0);
    groundLeg([16, 22], [15, 26]);
    groundLeg([27, 22], [31 + Math.round(open), 26], false, 4);
    // A small upward head tilt, rather than a downward lunge, follows the yawn.
    head(0, 1, 'yawn', mouth, -open * Math.PI / 15);
  }

  function drawScratch(frame, progress) {
    const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const reach = ease(progress / .22) * (1 - ease((progress - .8) / .2));
    const scoot = 3 * reach;
    const shift = points => points.map(([x, y]) => [x + scoot, y]);
    // Bring the haunch forward before lifting the hind paw under the chin.
    ctx.save();
    ctx.translate(Math.round(scoot), 0);
    tail(0, 0, true);
    ctx.restore();
    groundLeg([25, 21], [25, 26], true);
    polygon(shift([[10, 22], [12, 17], [17, 14], [22, 14], [25, 18], [26, 23], [23, 26], [13, 26]]), color.outline);
    polygon(shift([[11, 22], [13, 18], [17, 15], [21, 15], [24, 18], [25, 22], [22, 25], [13, 25]]), color.orange);
    rect(14 + scoot, 18, 6, 3, color.light);
    rect(15 + scoot, 16, 2, 3, color.stripe);
    groundLeg([27, 22], [27, 26]);
    head(0, 0, 'content');
    const rub = reach > .95 ? Math.round(Math.sin(frame * Math.PI / 3)) : 0;
    const foot = [19 + 9 * reach, 26 - 4 * reach + rub];
    groundLeg([18 + scoot, 23], foot, false, 4.5);
  }

  function drawSploot(frame) {
    // Only the upper ribs rise by one pixel over a slow breathing cycle.
    // The grounded belly, paws, and fur markings stay still.
    const breath = Math.round(.6 * Math.sin(frame / 30 * Math.PI) ** 2);
    line([[10, 23], [5, 24], [2, 22]], color.outline, 3);
    line([[10, 23], [5, 24], [2, 22]], color.orange);
    groundLeg([14, 23], [8, 26], true);
    groundLeg([16, 24], [10, 26]);
    polygon([[9, 23], [12, 18 - breath], [23, 17 - breath], [29, 21], [29, 26], [11, 26]], color.outline);
    polygon([[10, 23], [13, 19 - breath], [23, 18 - breath], [28, 22], [27, 25], [11, 25]], color.orange);
    rect(14, 21, 9, 2, color.light);
    rect(14, 19, 2, 3, color.stripe);
    groundLeg([26, 23], [23, 26]);
    groundLeg([33, 23], [37, 26]);
    head(-1, 3, 'content');
  }

  function drawBelly(frame, progress) {
    const sideways = progress < .16 || progress > .86;
    const curl = Math.round(Math.sin(frame / 12 * Math.PI) * .6);
    const paw = (root, elbow, tip, far) => {
      line([root, elbow, tip], color.outline, 3);
      line([root, elbow, tip], far ? color.stripe : color.orange, 2);
      rect(tip[0] - 1, tip[1] - 1, 3, 3, color.cream);
      rect(tip[0], tip[1], 1, 1, color.pink);
    };
    line([[11, 23], [6, 25], [3, 23]], color.outline, 3);
    line([[11, 23], [6, 25], [3, 23]], color.orange, 2);
    // Far paws sit behind the torso; near paws fold inward over the belly.
    paw([12, 19], [10, 17], [11, 14 + curl], true);
    paw([21, 18], [20, 16], [21, 13 - curl], true);
    polygon([[8, 20], [10, 15], [17, 13], [25, 16], [29, 22], [26, 26], [11, 26]], color.outline);
    polygon([[9, 20], [11, 16], [17, 14], [24, 17], [28, 22], [25, 25], [11, 25]], color.orange);
    polygon([[12, 19], [15, 16], [21, 17], [25, 21], [23, 25], [13, 25]], sideways ? color.light : color.cream);
    ctx.save();
    ctx.translate(58, 28);
    ctx.scale(-1, -1);
    head(0, 0, 'content');
    ctx.restore();
    paw([12, 24], [12, 22], [14, 20 - curl], false);
    paw([23, 24], [21, 22], [21, 20 + curl], false);
  }

  function drawSprint(frame) {
    const phase = frame % 12 / 12 * Math.PI * 2;
    const lift = Math.round(-(Math.sin(phase) ** 2));
    const foot = (x, offset) => {
      const angle = phase + offset;
      return [x + 4 * Math.cos(angle), 26 - Math.max(0, -Math.sin(angle)) * 2];
    };
    tail(lift, 1);
    groundLeg([14, 21 + lift], foot(14, Math.PI + .5), true, 4);
    groundLeg([25, 21 + lift], foot(25, .5), true, 4);
    body(lift);
    groundLeg([16, 22 + lift], foot(16, Math.PI), false, 4);
    groundLeg([27, 22 + lift], foot(27, 0), false, 4);
    head(0, lift);
  }

  function drawPet(progress) {
    const rise = Math.sin(Math.PI * Math.min(1, progress / .65));
    const nuzzle = -Math.round(Math.max(0, rise) * 3);
    tail(0, Math.round(Math.sin(progress * Math.PI * 2)));
    body(0);
    groundLeg([16, 22], [16, 26]);
    groundLeg([27, 22], [27, 26]);
    head(0, nuzzle, 'pet');
  }

  function drawTailEnjoy(progress) {
    const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const raised = ease(progress / .28) * (1 - ease((progress - .72) / .28));
    const lift = 2 * raised;
    const resting = [[11,21],[6,20],[3,17],[3,13],[5,11]];
    const upright = [[11,19],[7,16],[6,11],[7,7],[9,6]];
    const points = resting.map(([x,y], i) => [x + (upright[i][0] - x) * raised, y + (upright[i][1] - y) * raised]);
    line(points, color.outline, 5);
    line(points, color.orange, 3);
    const tip = points[points.length - 1];
    rect(tip[0] - 1, tip[1], 2, 2, color.stripe);
    tailRoot = { x: points[0][0], y: points[0][1] };
    // Preserve the plump torso and short legs: only a small arch over the hips.
    groundLeg([14, 22 - lift], [13, 26], true);
    groundLeg([25, 22], [25, 26], true);
    body(0, lift);
    groundLeg([16, 22 - lift * .67], [15, 26]);
    groundLeg([27, 22], [28, 26]);
    head(0, Math.round(raised), 'pet');
  }

  function drawChase(frame, progress) {
    if (progress > .87) {
      drawWalk(0);
      // A little chewing motion when the treat reaches the muzzle.
      rect(30, 19, 4, frame % 2 ? 2 : 1, color.outline);
      rect(31, 19, 2, 1, color.light);
      return;
    }
    ctx.save();
    ctx.translate(0, frame % 6 < 3 ? -1 : 0);
    drawWalk(frame);
    ctx.restore();
  }

  function drawPlay(frame, progress) {
    const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    const upright = smooth(progress / .17) * (1 - smooth((progress - .82) / .18));
    const mix = (a, b) => a + (b - a) * upright;
    // Fixed-length bones rotate at their joints; no independently sliding elbow/paw.
    // Angles are measured from the forward axis, with positive angles pointing down.
    const poses = [
      [0, 90, 90, 90, 90],
      [.17, 65, -15, 75, 15],
      [.30, -35, -70, 65, -15],
      [.42, 65, -15, -30, -65],
      [.54, -30, -65, 65, -15],
      [.66, 0, -65, 5, -60],
      [.74, 50, -25, 55, -20],
      [.84, 75, 40, 80, 45],
      [1, 90, 90, 90, 90]
    ];
    let i = 0;
    while (i < poses.length - 2 && progress > poses[i + 1][0]) i++;
    const from = poses[i], to = poses[i + 1];
    const t = smooth((progress - from[0]) / (to[0] - from[0]));
    const angle = n => (from[n] + (to[n] - from[n]) * t) * Math.PI / 180;
    const foreleg = (far) => {
      // Shoulder attachment follows the same torso transform throughout the rise.
      const shoulder = [mix(far ? 25 : 27, far ? 24 : 25), mix(22,18)];
      const upper = angle(far ? 3 : 1), lower = angle(far ? 4 : 2);
      const reach = mix(2, 2.8);
      const elbow = [shoulder[0] + reach * Math.cos(upper), shoulder[1] + reach * Math.sin(upper)];
      const paw = [elbow[0] + reach * Math.cos(lower), elbow[1] + reach * Math.sin(lower)];
      // Slim forelegs avoid the heavy block that previously covered the entire chest.
      line([shoulder, elbow, paw], color.outline, 3);
      line([shoulder, elbow, paw], far ? color.stripe : color.orange, 2);
      rect(paw[0] - 1, paw[1] - 1, 3, 2, far ? color.light : color.cream);
    };
    const morph = (standing, seated) => standing.map(([x,y], n) => [mix(x,seated[n][0]),mix(y,seated[n][1])]);
    tail(0, Math.round(Math.sin(progress * Math.PI * 4) * upright));
    limb([[14, 23], [14, 25], [14, 26]], true);
    polygon(morph(
      [[9,16],[11,13],[15,11],[23,11],[27,14],[29,19],[28,23],[25,25],[12,25],[8,23],[7,19]],
      [[10,20],[13,16],[18,12],[23,10],[26,13],[26,19],[25,23],[23,25],[12,25],[9,23],[8,21]]), color.outline);
    polygon(morph(
      [[10,16],[12,14],[15,12],[22,12],[26,15],[28,19],[27,22],[24,24],[12,24],[9,22],[8,19]],
      [[11,20],[14,17],[18,13],[22,11],[25,14],[25,19],[24,22],[22,24],[12,24],[10,22],[9,21]]), color.orange);
    polygon([[mix(13,17),21],[mix(23,24),mix(20,14)],[mix(27,25),21],[mix(25,23),24],[13,24],[11,23]], color.cream);
    rect(13, mix(14,19), 2, 3, color.stripe);
    rect(18, mix(13,15), 2, 3, color.stripe);
    limb([[16, 23], [16, 25], [16, 26]]);
    head(-Math.round(4 * upright), -Math.round(3 * upright));
    foreleg(true);
    foreleg(false);
  }

  function paint(kind, frame, progress = 0) {
    frame = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
    progress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    ctx.clearRect(0, 0, 40, 28);
    tailRoot = { x: 11, y: 21 };
    stage.dataset.action = kind;
    if (kind === 'tail-enjoy') drawTailEnjoy(progress);
    else if (kind === 'pet') drawPet(progress);
    else if (kind === 'play') drawPlay(frame, progress);
    else if (kind === 'belly') drawBelly(frame, progress);
    else if (kind === 'sploot') drawSploot(frame);
    else if (kind === 'sprint') drawSprint(frame, progress);
    else if (kind === 'chase') drawChase(frame, progress);
    else if (kind === 'yawn') drawYawn(progress);
    else if (kind === 'scratch') drawScratch(frame, progress);
    else if (kind === 'idle') drawWalk(0);
    else drawWalk(frame);
    if (cursorPoint && active) {
      const point = pointerOnSprite(cursorPoint);
      showCursor(point ? cursorZone(point) : null);
    }
  }

  function measure() {
    travel = Math.max(0, stage.getBoundingClientRect().width - canvas.getBoundingClientRect().width);
  }

  function stop() {
    active = false;
    treat.hidden = true;
    playStarted = petStarted = tailStarted = null;
    attention = null;
    walkAway = null;
    quietUntil = 0;
    cursorPoint = null;
    clearCursor();
    stroke = null;
    clearTimeout(petTimer);
    cancelAnimationFrame(frameRequest);
    clearTimeout(stillTimer);
    frameRequest = stillTimer = 0;
    stage.classList.remove('is-active');
    canvas.style.removeProperty('transform');
    ctx.clearRect(0, 0, 40, 28);
  }

  function tick(now) {
    if (!active) return;
    if (document.hidden || !stage.isConnected || !pet.isConnected) { stop(); return; }
    if (walkAway !== null) {
      const elapsed = Math.max(0, now - walkAway.start);
      const progress = Math.min(1, elapsed / 3000);
      if (now - lastPaint >= 1000 / 24) {
        lastPaint = now;
        currentX = Math.round(walkAway.from + (walkAway.to - walkAway.from) * progress);
        canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${direction})`;
        treat.hidden = true;
        paint('walk', Math.floor(elapsed / 110));
      }
      if (progress < 1) { frameRequest = requestAnimationFrame(tick); return; }
      currentX = walkAway.to;
      walkAway = null;
      if ((direction === 1 && currentX >= travel - .5) || (direction === -1 && currentX <= .5)) direction *= -1;
      const along = travel ? (direction === 1 ? currentX / travel : 1 - currentX / travel) : 0;
      buildSequence(Math.max(0, Math.min(.999, along)));
      startedAt = now;
      lastPaint = -Infinity;
    }
    if (attention !== null) {
      if (now < attention.until) {
        frameRequest = requestAnimationFrame(tick);
        return;
      }
      releaseAttention(now);
      stroke = null;
    }
    if (tailStarted !== null) {
      const elapsed = Math.max(0, now - tailStarted);
      if (elapsed < 3000) {
        if (now - lastPaint >= 1000 / 24) {
          lastPaint = now;
          treat.hidden = true;
          paint('tail-enjoy', 0, elapsed / 3000);
        }
        frameRequest = requestAnimationFrame(tick);
        return;
      }
      tailStarted = null;
      beginWalkAway(now);
      frameRequest = requestAnimationFrame(tick);
      return;
    }
    if (petStarted !== null) {
      const elapsed = Math.max(0, now - petStarted);
      if (elapsed < 2400) {
        if (now - lastPaint >= 1000 / 24) {
          lastPaint = now;
          treat.hidden = true;
          paint('pet', 0, elapsed / 2400);
        }
        frameRequest = requestAnimationFrame(tick);
        return;
      }
      petStarted = null;
      beginWalkAway(now);
      frameRequest = requestAnimationFrame(tick);
      return;
    }
    if (playStarted !== null) {
      const playElapsed = Math.max(0, now - playStarted);
      if (playElapsed < 2100) {
        if (now - lastPaint >= 1000 / 24) {
          lastPaint = now;
          const progress = playElapsed / 2100;
          canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${direction})`;
          treat.hidden = true;
          paint('play', Math.floor(playElapsed / 80), progress);
        }
        frameRequest = requestAnimationFrame(tick);
        return;
      }
      playStarted = null;
      beginWalkAway(now);
      frameRequest = requestAnimationFrame(tick);
      return;
    }
    // A frame timestamp can precede activation within the same rendering frame.
    let elapsed = Math.max(0, now - startedAt);
    if (elapsed >= totalDuration) {
      if (pet.dataset.pinned !== 'true') { stop(); return; }
      direction *= -1;
      buildSequence();
      startedAt = now;
      elapsed = 0;
    }
    if (now - lastPaint >= 1000 / 24) {
      lastPaint = now;
      let phaseTime = elapsed;
      let phase = sequence[0];
      for (const candidate of sequence) {
        phase = candidate;
        if (phaseTime < phase.duration) break;
        phaseTime -= phase.duration;
      }
      const progress = Math.min(1, phaseTime / phase.duration);
      const along = phase.from + (phase.to - phase.from) * progress;
      const position = direction === 1 ? along : 1 - along;
      currentX = Math.round(travel * position);
      canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${direction})`;
      paint(phase.kind, Math.floor(phaseTime / (phase.frameMs || 110)), progress);
    }
    frameRequest = requestAnimationFrame(tick);
  }

  function activate() {
    if (active || document.hidden || !stage.isConnected) return;
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height || bounds.bottom < 0 || bounds.top > innerHeight) return;
    active = true;
    measure();
    stage.classList.add('is-active');
    direction = 1;
    currentX = 0;
    paint('walk', 0);
    if (reducedMotion.matches) {
      canvas.style.transform = `translate3d(${Math.round(travel * .15)}px,0,0)`;
      stillTimer = setTimeout(() => { if (pet.dataset.pinned !== 'true') stop(); }, 1500);
      return;
    }
    direction = 1;
    buildSequence();
    startedAt = performance.now();
    lastPaint = -Infinity;
    frameRequest = requestAnimationFrame(tick);
  }

  function buildSequence(startPosition = 0) {
    // Choose once per appearance so movement stays smooth between random pauses.
    const between = (min, max) => min + Math.random() * (max - min);
    const stopCount = 1 + Math.floor(Math.random() * 3);
    let position = startPosition;
    let previousAction = '';
    sequence = [];
    function walkTo(destination) {
      const roll = Math.random();
      const kind = roll < .3 ? 'chase' : roll < .55 ? 'sprint' : 'walk';
      const speed = kind === 'sprint' ? between(.22, .3) : kind === 'chase' ? between(.10, .14) : between(.075, .105);
      sequence.push({
        kind, from: position, to: destination,
        duration: Math.max(kind === 'sprint' ? 1050 : 1400, (destination - position) / speed * 1000),
        frameMs: kind === 'sprint' ? 75 : kind === 'chase' ? 75 : 110 * .09 / speed
      });
      position = destination;
    }
    for (let i = 0; i < stopCount; i++) {
      walkTo(startPosition + (1 - startPosition) * (i + between(.65, 1.25)) / (stopCount + 1));
      const choices = ['belly', 'sploot', 'yawn', 'scratch'].filter(kind => kind !== previousAction);
      const kind = choices[Math.floor(Math.random() * choices.length)];
      const duration = kind === 'belly' ? between(2600, 3400)
        : kind === 'sploot' ? between(2100, 3200) : between(1800, 2800);
      sequence.push({ kind, duration, from: position, to: position, frameMs: between(90, 140) });
      previousAction = kind;
    }
    walkTo(1);
    sequence.push({ kind: 'idle', duration: 250, from: 1, to: 1 });
    totalDuration = sequence.reduce((sum, phase) => sum + phase.duration, 0);
  }

  function beginWalkAway(now) {
    releaseAttention(now);
    stroke = null;
    clearCursor();
    let room = direction === 1 ? travel - currentX : currentX;
    if (room < Math.min(36, travel * .2)) { direction *= -1; room = direction === 1 ? travel - currentX : currentX; }
    const distance = Math.min(room, Math.max(36, travel * .23));
    walkAway = { start: now, from: currentX, to: Math.max(0, Math.min(travel, currentX + direction * distance)) };
    lastPaint = -Infinity;
  }

  function clearCursor() {
    document.documentElement.classList.remove('cat-cursor-hand', 'cat-cursor-feather');
  }

  function cursorZone(point) {
    if (point.x >= headRegion.left - 3 && point.x <= headRegion.right + 3 &&
        point.y >= headRegion.top - 5 && point.y <= headRegion.top + 16) return 'head';
    if (Math.abs(point.x - tailRoot.x) <= 6 && Math.abs(point.y - tailRoot.y) <= 7) return 'tail';
    if (point.x > headRegion.right && point.x < headRegion.right + 36 &&
        point.y >= headRegion.top - 6 && point.y <= headRegion.bottom + 6) return 'front';
    return null;
  }

  function showCursor(zone) {
    document.documentElement.classList.toggle('cat-cursor-hand', zone === 'head' || zone === 'tail');
    document.documentElement.classList.toggle('cat-cursor-feather', zone === 'front');
  }

  function releaseAttention(now) {
    if (attention === null) return;
    startedAt += Math.max(0, now - attention.start);
    attention = null;
  }

  function pointerOnSprite(event) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const x = (event.clientX - bounds.left) / bounds.width * 40;
    return { x: direction === 1 ? x : 40 - x,
      y: (event.clientY - bounds.top) / bounds.height * 28 };
  }

  function beginReaction(kind, now) {
    releaseAttention(now);
    stroke = null;
    if (playStarted !== null) { startedAt += now - playStarted; playStarted = null; }
    if (reducedMotion.matches) {
      paint(kind, 0, kind === 'tail-enjoy' ? .4 : 0);
      clearTimeout(petTimer);
      petTimer = setTimeout(() => {
        if (active) { quietUntil = performance.now() + 3000; paint('walk', 0); }
      }, 1800);
      return;
    }
    if (kind === 'pet') petStarted = now;
    else tailStarted = now;
    lastPaint = -Infinity;
  }

  // Hovering a contact area steadies the cat briefly, then small back-and-forth
  // strokes pet its forehead or rump. Neither gesture needs a click.
  document.addEventListener('pointermove', event => {
    if (!active || event.pointerType !== 'mouse') { clearCursor(); return; }
    cursorPoint = { clientX: event.clientX, clientY: event.clientY };
    const point = pointerOnSprite(event);
    if (!point) return;
    const zone = cursorZone(point);
    showCursor(zone);
    const now = performance.now();
    if (event.buttons || petStarted !== null || tailStarted !== null || playStarted !== null || walkAway !== null || now < quietUntil) return;
    if (zone !== 'head' && zone !== 'tail') {
      stroke = null;
      releaseAttention(now);
      return;
    }
    if (attention && attention.reason !== zone) releaseAttention(now);
    if (!attention && !reducedMotion.matches) attention = { start: now, until: now + 1800, reason: zone };
    if (!stroke || stroke.zone !== zone || now - stroke.time > 2000) {
      stroke = { zone, x: event.clientX, y: event.clientY, vector: null, turns: 0, travel: 0, time: now };
      return;
    }
    const dx = event.clientX - stroke.x, dy = event.clientY - stroke.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 3) return;
    const vector = [dx / distance, dy / distance];
    if (stroke.vector && vector[0] * stroke.vector[0] + vector[1] * stroke.vector[1] < -.25) stroke.turns++;
    stroke.x = event.clientX;
    stroke.y = event.clientY;
    stroke.vector = vector;
    stroke.travel += distance;
    if (stroke.turns >= 1 && stroke.travel >= 10) beginReaction(zone === 'head' ? 'pet' : 'tail-enjoy', now);
  }, { passive: true });

  document.addEventListener('pointerdown', event => {
    if (!active || petStarted !== null || tailStarted !== null || playStarted !== null || walkAway !== null ||
        performance.now() < quietUntil || reducedMotion.matches || !event.isPrimary || event.button !== 0) return;
    const point = pointerOnSprite(event);
    if (!point || cursorZone(point) !== 'front') return;
    releaseAttention(performance.now());
    playStarted = performance.now();
  });
  document.addEventListener('pointerout', event => {
    if (!event.relatedTarget) { cursorPoint = null; clearCursor(); stroke = null; releaseAttention(performance.now()); }
  });
  window.addEventListener('blur', () => { cursorPoint = null; clearCursor(); });

  pet.addEventListener('catpreviewstart', activate);
  pet.addEventListener('catpreviewend', stop);
  if (pet.dataset.interacting === 'true') activate();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (pet.dataset.interacting === 'true') activate();
  });
  window.addEventListener('pagehide', stop);
  reducedMotion.addEventListener('change', () => {
    stop();
    if (pet.dataset.interacting === 'true') activate();
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!active) return;
      if (!stage.getBoundingClientRect().width) stop();
      else measure();
    }).observe(stage);
  } else {
    window.addEventListener('resize', () => { if (active) measure(); });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) stop();
      else if (pet.dataset.interacting === 'true') activate();
    }).observe(stage);
  }
})();

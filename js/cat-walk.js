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
    line(points, color.outline, 5);
    line(points, color.orange, 3);
    const [tipX, tipY] = points[points.length - 1];
    rect(tipX - 1, tipY, 2, 2, color.stripe);
  }

  function body(bob = 0) {
    const shift = points => points.map(([x, y]) => [x, y + bob]);
    polygon(shift([[9, 16], [11, 13], [15, 11], [23, 11], [27, 14], [29, 19], [28, 23], [25, 25], [12, 25], [8, 23], [7, 19]]), color.outline);
    polygon(shift([[10, 16], [12, 14], [15, 12], [22, 12], [26, 15], [28, 19], [27, 22], [24, 24], [12, 24], [9, 22], [8, 19]]), color.orange);
    rect(12, 15 + bob, 10, 3, color.light);
    polygon(shift([[13, 21], [23, 20], [27, 21], [25, 24], [13, 24], [11, 23]]), color.cream);
    rect(13, 13 + bob, 2, 3, color.stripe);
    rect(18, 12 + bob, 2, 3, color.stripe);
  }

  function head(dx = 0, dy = 0, expression = 'normal', mouth = 0) {
    const shift = points => points.map(([x, y]) => [x + dx, y + dy]);
    const matrix = ctx.getTransform();
    const corners = [[20 + dx, 3 + dy], [40 + dx, 3 + dy], [20 + dx, 23 + dy], [40 + dx, 23 + dy]]
      .map(([x, y]) => [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f]);
    headRegion = { left: Math.min(...corners.map(p => p[0])), right: Math.max(...corners.map(p => p[0])),
      top: Math.min(...corners.map(p => p[1])), bottom: Math.max(...corners.map(p => p[1])) };
    // Oversized British Shorthair cheeks, small rounded ears, and an orange-white blaze.
    polygon(shift([[21, 10], [22, 7], [22, 4], [23, 3], [25, 3], [28, 6], [32, 6], [35, 3], [37, 3], [38, 4], [38, 8], [40, 11], [40, 18], [38, 21], [35, 23], [25, 23], [21, 21], [19, 18], [19, 13]]), color.outline);
    polygon(shift([[22, 10], [23, 8], [23, 5], [25, 5], [27, 8], [33, 8], [36, 5], [37, 5], [37, 9], [39, 12], [39, 17], [37, 20], [34, 22], [25, 22], [22, 20], [20, 17], [20, 13]]), color.orange);
    rect(23 + dx, 6 + dy, 2, 2, color.pink);
    rect(35 + dx, 6 + dy, 2, 2, color.pink);
    rect(21 + dx, 13 + dy, 3, 4, color.light);
    rect(37 + dx, 13 + dy, 2, 4, color.light);
    rect(27 + dx, 9 + dy, 2, 2, color.stripe);
    rect(33 + dx, 9 + dy, 2, 2, color.stripe);
    polygon(shift([[30, 9], [31, 11], [32, 13], [34, 15], [37, 17], [38, 19], [35, 22], [25, 22], [22, 20], [22, 17], [26, 15], [28, 13], [29, 11]]), color.cream);
    rect(30 + dx, 17 + dy, 3, 1, color.pink);
    rect(31 + dx, 18 + dy, 1, 1, color.pink);
    // A small mouth-side marking fades into the cream fur at its pixel edges.
    rect(28 + dx, 18 + dy, 2, 2, `${color.orange}55`);
    rect(29 + dx, 18 + dy, 1, 1, `${color.orange}88`);
    rect(28 + dx, 19 + dy, 1, 1, `${color.orange}55`);
    rect(29 + dx, 19 + dy, 1, 1, color.orange);
    rect(30 + dx, 19 + dy, 1, 1, `${color.orange}55`);
    rect(29 + dx, 20 + dy, 1, 1, `${color.orange}44`);
    if (expression === 'normal') {
      for (const eyeX of [25, 34]) {
        rect(eyeX + dx, 13 + dy, 3, 3, color.eye);
        rect(eyeX + dx, 13 + dy, 1, 1, color.cream);
      }
      rect(31 + dx, 19 + dy, 1, 1, color.outline);
      rect(30 + dx, 20 + dy, 1, 1, color.outline);
      rect(32 + dx, 20 + dy, 1, 1, color.outline);
    } else {
      rect(25 + dx, 14 + dy, 3, 1, color.eye);
      rect(34 + dx, 14 + dy, 3, 1, color.eye);
      if (expression === 'pet') {
        rect(25 + dx, 14 + dy, 3, 1, color.orange);
        rect(34 + dx, 14 + dy, 3, 1, color.orange);
        line([[25 + dx, 15 + dy], [26 + dx, 14 + dy], [27 + dx, 15 + dy]], color.eye);
        line([[34 + dx, 15 + dy], [35 + dx, 14 + dy], [36 + dx, 15 + dy]], color.eye);
        line([[30 + dx, 19 + dy], [31 + dx, 20 + dy], [32 + dx, 19 + dy]], color.outline);
      }
      if (expression === 'yawn' && mouth > 0) {
        rect(29 + dx, 16 + dy, 7, mouth + 2, color.cream);
        rect(30 + dx, 17 + dy, 5, mouth, color.eye);
        rect(31 + dx, 16 + dy + mouth, 3, 1, color.pink);
        if (mouth >= 2) {
          // Two tiny upper canines taper to single-pixel tips as the jaw opens.
          rect(30 + dx, 17 + dy, mouth >= 3 ? 2 : 1, 1, color.tooth);
          rect((mouth >= 3 ? 33 : 34) + dx, 17 + dy, mouth >= 3 ? 2 : 1, 1, color.tooth);
          if (mouth >= 3) {
            rect(30 + dx, 18 + dy, 1, 1, color.tooth);
            rect(34 + dx, 18 + dy, 1, 1, color.tooth);
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
      return [x + 2 * Math.cos(angle), 26 - Math.max(0, Math.sin(angle))];
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
    const mouth = Math.max(0, Math.round(Math.sin(progress * Math.PI) * 4));
    tail(0, 1);
    limb([[14, 21], [12, 24], [11, 26]], true);
    body(1);
    limb([[17, 22], [16, 25], [15, 26]]);
    // The front paws reach forward while the large, pink-tongued mouth opens.
    limb([[27, 21], [32, 24], [36, 26]], true);
    limb([[28, 22], [33, 25], [37, 26]]);
    head(0, 2, 'yawn', mouth);
  }

  function drawScratch(frame) {
    const pawLift = [0, -1, -2, -1][frame % 4];
    tail(0, frame % 4 < 2 ? 0 : 1, true);
    polygon([[13, 17], [17, 13], [23, 13], [27, 17], [28, 23], [25, 26], [13, 26], [10, 23]], color.outline);
    polygon([[14, 18], [18, 14], [23, 14], [26, 18], [27, 22], [24, 25], [13, 25], [11, 22]], color.orange);
    rect(14, 18, 7, 3, color.light);
    rect(15, 16, 2, 3, color.stripe);
    rect(24, 18, 2, 5, color.cream);
    limb([[27, 18], [28, 24], [28, 26]]);
    // Route the raised hind leg outside the rear cheek, behind the head.
    // The paw touches the outer base of the rear ear (21, 5), never the muzzle.
    line([[15, 23], [11, 18], [16, 11], [20, 6 + pawLift]], color.outline, 3);
    line([[15, 23], [11, 18], [16, 11], [20, 6 + pawLift]], color.orange, 2);
    head(-1, -2, 'content');
    rect(18, 4 + pawLift, 3, 3, color.outline);
    rect(19, 4 + pawLift, 2, 2, color.cream);
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
      return [x + 4 * Math.cos(angle), 26 - Math.max(0, Math.sin(angle)) * 2];
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
    const nuzzle = -Math.round(Math.max(0, rise) * 2);
    tail(0, Math.round(Math.sin(progress * Math.PI * 2)));
    body(0);
    groundLeg([16, 22], [16, 26]);
    groundLeg([27, 22], [27, 26]);
    head(0, nuzzle, 'pet');
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
    if (kind === 'pet') drawPet(progress);
    else if (kind === 'play') drawPlay(frame, progress);
    else if (kind === 'belly') drawBelly(frame, progress);
    else if (kind === 'sploot') drawSploot(frame);
    else if (kind === 'sprint') drawSprint(frame, progress);
    else if (kind === 'chase') drawChase(frame, progress);
    else if (kind === 'yawn') drawYawn(progress);
    else if (kind === 'scratch') drawScratch(frame);
    else if (kind === 'idle') drawWalk(0);
    else drawWalk(frame);
  }

  function measure() {
    travel = Math.max(0, stage.getBoundingClientRect().width - canvas.getBoundingClientRect().width);
  }

  function stop() {
    active = false;
    treat.hidden = true;
    playStarted = petStarted = null;
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
      startedAt += elapsed;
      petStarted = null;
      lastPaint = -Infinity;
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
      startedAt += playElapsed;
      playStarted = null;
      lastPaint = -Infinity;
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

  function buildSequence() {
    // Choose once per appearance so movement stays smooth between random pauses.
    const between = (min, max) => min + Math.random() * (max - min);
    const stopCount = 1 + Math.floor(Math.random() * 3);
    let position = 0;
    let previousAction = '';
    sequence = [];
    function walkTo(destination) {
      const roll = Math.random();
      const kind = roll < .3 ? 'chase' : roll < .55 ? 'sprint' : 'walk';
      const speed = kind === 'sprint' ? between(.22, .3) : kind === 'chase' ? between(.10, .14) : between(.075, .105);
      sequence.push({
        kind, from: position, to: destination,
        duration: Math.max(kind === 'sprint' ? 1050 : 1400, (destination - position) / speed * 1000),
        frameMs: kind === 'sprint' ? 55 : kind === 'chase' ? 75 : 110 * .09 / speed
      });
      position = destination;
    }
    for (let i = 0; i < stopCount; i++) {
      walkTo((i + between(.65, 1.25)) / (stopCount + 1));
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

  // Two deliberate back-and-forth strokes over the forehead trigger a nuzzle.
  // Observe the pointer without capturing it or intercepting page controls.
  document.addEventListener('pointermove', event => {
    if (!active || event.pointerType !== 'mouse' || event.buttons || petStarted !== null) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const now = performance.now();
    const rawX = (event.clientX - bounds.left) / bounds.width * 40;
    const x = direction === 1 ? rawX : 40 - rawX;
    const y = (event.clientY - bounds.top) / bounds.height * 28;
    if (x < headRegion.left - 2 || x > headRegion.right + 2 ||
        y < headRegion.top - 6 || y > headRegion.top + 9) { stroke = null; return; }
    if (!stroke || now - stroke.time > 1400) {
      stroke = { anchor: event.clientX, sign: 0, turns: 0, time: now };
      return;
    }
    const delta = event.clientX - stroke.anchor;
    if (Math.abs(delta) < 6) return;
    const sign = Math.sign(delta);
    if (stroke.sign && sign !== stroke.sign) stroke.turns++;
    stroke.anchor = event.clientX;
    stroke.sign = sign;
    if (stroke.turns < 2) return;
    stroke = null;
    if (reducedMotion.matches) {
      paint('pet', 0, 0);
      clearTimeout(petTimer);
      petTimer = setTimeout(() => { if (active) paint('walk', 0); }, 1800);
      return;
    }
    if (playStarted !== null) { startedAt += now - playStarted; playStarted = null; }
    petStarted = now;
    lastPaint = -Infinity;
  }, { passive: true });

  // Listen without blocking links, scrolling, or the page's normal pointer behavior.
  document.addEventListener('pointerdown', event => {
    if (!active || petStarted !== null || reducedMotion.matches || !event.isPrimary || event.button !== 0) return;
    const bounds = canvas.getBoundingClientRect();
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    if (Math.abs(dx) > bounds.width / 2 + 85 || Math.abs(dy) > 55) return;
    // Repeated clicks change the target without indefinitely extending a play cycle.
    // Only react in front of the face: preserve the current heading and world position.
    if (dx * direction < 0) return;
    if (playStarted === null) playStarted = performance.now();
  });

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

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
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let frameRequest = 0;
  let stillTimer = 0;
  let startedAt = 0;
  let lastPaint = -Infinity;
  let travel = 0;
  let sequence = [];
  let totalDuration = 0;
  let direction = 1;

  function rect(x, y, width, height, ink) {
    ctx.fillStyle = ink;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  }

  // Integer scan lines keep every contour a hand-drawn pixel edge.
  function polygon(points, ink) {
    ctx.fillStyle = ink;
    const low = Math.floor(Math.min(...points.map(point => point[1])));
    const high = Math.ceil(Math.max(...points.map(point => point[1])));
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
    rect(22 + dx, 17 + dy, 2, 1, color.pink);
    rect(36 + dx, 17 + dy, 2, 1, color.pink);
    rect(30 + dx, 17 + dy, 3, 1, color.pink);
    rect(31 + dx, 18 + dy, 1, 1, color.pink);
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
    const stride = [-2, -1, 1, 2, 2, 1, -1, -2];
    const near = stride[frame % 8];
    const far = stride[(frame + 4) % 8];
    const bob = frame % 4 < 2 ? 0 : -1;
    tail(bob, frame % 4 < 2 ? 0 : 1);
    limb([[14, 23], [14 + far, 25], [14 + far, 26]], true);
    limb([[25, 22], [25 - far, 25], [25 - far, 26]], true);
    body(bob);
    limb([[16, 23 + bob], [16 + near, 25], [16 + near, 26]]);
    limb([[27, 22 + bob], [27 - near, 25], [27 - near, 26]]);
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
    head(-1, -2, 'content');
    // A visibly bent hind leg runs from the rear haunch up to the back of the ear.
    limb([[15, 23], [19, 20], [22, 14 + pawLift], [24, 10 + pawLift]]);
    rect(23, 8 + pawLift, 3, 3, color.outline);
    rect(24, 8 + pawLift, 2, 2, color.cream);
  }

  function paint(kind, frame, progress = 0) {
    frame = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
    ctx.clearRect(0, 0, 40, 28);
    if (kind === 'yawn') drawYawn(progress);
    else if (kind === 'scratch') drawScratch(frame);
    else if (kind === 'idle') drawWalk(0);
    else drawWalk(frame);
  }

  function measure() {
    travel = Math.max(0, stage.getBoundingClientRect().width - canvas.getBoundingClientRect().width);
  }

  function stop() {
    active = false;
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
      canvas.style.transform = `translate3d(${Math.round(travel * position)}px,0,0) scaleX(${direction})`;
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
      const speed = between(.075, .105);
      sequence.push({
        kind: 'walk', from: position, to: destination,
        duration: (destination - position) / speed * 1000,
        frameMs: 110 * .09 / speed
      });
      position = destination;
    }
    for (let i = 0; i < stopCount; i++) {
      walkTo((i + between(.65, 1.25)) / (stopCount + 1));
      const choices = ['idle', 'yawn', 'scratch'].filter(kind => kind !== previousAction);
      const kind = choices[Math.floor(Math.random() * choices.length)];
      const duration = kind === 'idle' ? between(650, 1400)
        : kind === 'yawn' ? between(1800, 2800) : between(1600, 3000);
      sequence.push({ kind, duration, from: position, to: position, frameMs: between(90, 140) });
      previousAction = kind;
    }
    walkTo(1);
    sequence.push({ kind: 'idle', duration: 250, from: 1, to: 1 });
    totalDuration = sequence.reduce((sum, phase) => sum + phase.duration, 0);
  }

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

(() => {
  const stage = document.querySelector('.cat-walk');
  const canvas = stage?.querySelector('.cat-walk-sprite');
  const pet = document.querySelector('.pet-card');
  if (!stage || !canvas || !pet) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Keep the existing 40-unit rig; a finer backing grid lets the face turn
  // between pixel poses without changing the torso, gait or on-screen size.
  const rasterScale=ctx.setTransform?3:1;
  let spriteHeight=28;
  canvas.width = 40*rasterScale;
  function setSpriteHeight(height) {
    spriteHeight=height;canvas.height=height*rasterScale;
    ctx.setTransform?.(rasterScale,0,0,rasterScale,0,0);
    ctx.imageSmoothingEnabled=false;
  }
  setSpriteHeight(28);
  function rigTransform() {
    const m=ctx.getTransform();
    return Object.fromEntries(['a','b','c','d','e','f'].map(k=>[k,m[k]/rasterScale]));
  }
  ctx.imageSmoothingEnabled = false;

  const color = {
    outline: '#805039', orange: '#c58049', light: '#dda16d',
    stripe: '#a46136', cream: '#f6eee3', eye: '#171614', pink: '#d8aaa6', tooth: '#fffaf0', mouth: '#b09485'
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
  const featherToy = document.createElement('img');
  featherToy.className = 'cat-feather-toy';
  featherToy.src = 'assets/cat-feather-cursor.svg?v=20260906-single-feather';
  featherToy.alt = '';
  featherToy.ariaHidden = 'true';
  featherToy.draggable = false;
  featherToy.hidden = true;
  document.body.append(featherToy);
  const desktopLane = matchMedia('(min-width: 1100px)');
  let laneMotion = null;
  let laneOffset = 0;
  let catLift = 0;
  let pendingLandingGroom = false;
  let pendingCompactTension = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let frameRequest = 0, visibilityPauseAt = null;
  let stillTimer = 0;
  let startedAt = 0;
  let lastPaint = -Infinity;
  let travel = 0;
  let pixelScale = 1.6;
  let gaitDistance = 0;
  let lastGaitX = 0;
  let sequence = [];
  let totalDuration = 0;
  let playStarted = null;
  let pendingInput = null;
  let pounceHeld = false;
  let chargePointer = null;
  let featherPress = null;
  const featherHoldDuration = 180;
  const timing = { pet: 1500, tail: 1800, grab: 1200, pounce: 1300 };
  const pounceTiming = { takeoff: .48, landing: .86 };
  let playKind = 'pounce';
  let playOrigin = 0;
  let pounceBackstep = 0;
  let playTarget = 0;
  let petStarted = null;
  let tailStarted = null;
  let walkAway = null;
  let cursorPoint = null;
  let gazePoint=null,gazeLast=0,gazeX=0,gazeY=0,gazeTargetX=0,gazeTargetY=0,gazeFocus=0;
  let gazeHistory=[],gazeSample=null;
  function trackGazePoint(point,now=performance.now()) {
    gazePoint=point;
    if(!point){gazeHistory=[];gazeSample=null;return;}
    const last=gazeHistory[gazeHistory.length-1];
    // Coalesce high-rate mice to one sample per display frame. Preserve time
    // rather than restarting a debounce on every move, so a moving hand is followed too.
    if(last&&now-last.time<16)last.point=point;
    else gazeHistory.push({time:now,point});
    if(gazeHistory.length>64)gazeHistory.shift();
  }
  const gazeKinds=new Set(['idle','walk','sprint','chase']);
  function resetGaze(clearPointer=false) {
    gazeLast=0;gazeX=gazeY=gazeTargetX=gazeTargetY=gazeFocus=0;
    gazeHistory=[];gazeSample=null;
    if(clearPointer)gazePoint=null;
    delete stage.dataset.lookDirection;
  }
  function updateGaze(kind) {
    const now=performance.now(),dt=gazeLast?Math.max(0,Math.min(50,now-gazeLast)):16;gazeLast=now;
    gazeTargetX=gazeTargetY=0;let focusTarget=0;
    const free=active&&gazeKinds.has(kind)&&!turnMotion&&!poseHandoff&&!transportDriver?.blocksInput()&&
      playStarted===null&&petStarted===null&&tailStarted===null&&!featherPress&&!pounceHeld;
    if(free&&gazePoint) {
      const r=canvas.getBoundingClientRect(),cx=r.left+r.width*(direction===1?.75:.25),cy=r.top+r.height*13/spriteHeight;
      // A local ellipse: roughly two cat lengths sideways and one-and-a-half
      // vertically, with a feathered outer edge instead of a global listener effect.
      const rx=Math.max(100,Math.min(155,r.width*2.2)),ry=Math.max(76,Math.min(115,r.width*1.6));
      const presentRadius=Math.hypot((gazePoint.clientX-cx)/rx,(gazePoint.clientY-cy)/ry);
      if(presentRadius>=1){gazeHistory=[];gazeSample=null;}
      else {
        if(!gazeHistory.length&&!gazeSample)trackGazePoint(gazePoint,now);
        while(gazeHistory.length&&gazeHistory[0].time<=now-(reducedMotion.matches?0:250))gazeSample=gazeHistory.shift().point;
      }
      const dx=gazeSample?gazeSample.clientX-cx:0,dy=gazeSample?gazeSample.clientY-cy:0;
      const radius=Math.hypot(dx/rx,dy/ry),distance=Math.hypot(dx,dy);
      if(radius<1&&distance>5&&r.bottom>0&&r.top<innerHeight) {
        const fade=1-easePose((radius-.76)/.24),near=easePose((distance-5)/24);
        gazeTargetX=dx/distance*direction*fade*near;
        gazeTargetY=-dy/distance*fade*near;
        const point=pointerOnSprite(gazeSample);
        if(point&&cursorZone(point)==='front')focusTarget=fade*near;
        stage.dataset.lookDirection=String((Math.atan2(dx,-dy)*180/Math.PI+360)%360);
      }else delete stage.dataset.lookDirection;
    }else delete stage.dataset.lookDirection;
    const amount=reducedMotion.matches?1:1-Math.exp(-dt/85);
    gazeX+=(gazeTargetX-gazeX)*amount;gazeY+=(gazeTargetY-gazeY)*amount;
    gazeFocus+=(focusTarget-gazeFocus)*(reducedMotion.matches?1:1-Math.exp(-dt/180));
    if(gazeFocus<.001&&focusTarget===0)gazeFocus=0;
    if(Math.abs(gazeX)<.001&&gazeTargetX===0)gazeX=0;
    if(Math.abs(gazeY)<.001&&gazeTargetY===0)gazeY=0;
  }
  let lastInteractionMove = -Infinity;
  let featherFollowing = false;
  let lastFeatherMotion=-Infinity;
  let followTime = 0;
  let nearAttention=false,nearLast=0;
  let tailRoot = { x: 11, y: 21 };
  let petTimer = 0;
  let headRegion = { left: 20, right: 40, top: 3, bottom: 23 };
  let stroke = null;
  let currentX = 0;
  let direction = 1;
  let turnMotion = null;
  let transportDriver = null;
  const turnDuration = 720;
  let lastPose=null, liftOrigin=null, poseHandoff=null, postureOverride=null;
  let actionWeight=1,gaitBlend=0,gaitPaintAt=0;
  const easePose=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const poseLevel=p=>postureOverride===null?easePose(p/.16)*(1-easePose((p-.84)/.16)):postureOverride;
  const mixPoint=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  function mixContour(a,b,t) {
    if(t<=0)return a;if(t>=1)return b;
    const sample=(points,count)=>{
      const lengths=points.map((p,i)=>Math.hypot(p[0]-points[(i+1)%points.length][0],p[1]-points[(i+1)%points.length][1]));
      const total=lengths.reduce((a,b)=>a+b,0);
      return Array.from({length:count},(_,n)=>{let d=total*n/count,i=0;while(i<lengths.length-1&&d>lengths[i])d-=lengths[i++];return mixPoint(points[i],points[(i+1)%points.length],d/(lengths[i]||1));});
    };
    const target=sample(b,28);return sample(a,28).map((point,i)=>mixPoint(point,target[i],t));
  }
  function poseBody(outer,inner,cream,amount) {
    const baseOuter=[[6.5,17],[8.5,14],[11.8,11.7],[16,11.7],[19,13],[23,11],[26,14],[28,17],[28,20],[25,23],[21,22],[19,23.3],[17,24],[15,24],[13,23.3],[11,22.4],[7.5,22.4],[5.5,20]];
    const baseInner=[[7.5,17],[9.5,15],[11.8,12.7],[16,12.7],[19,14],[23,12],[25,15],[27,18],[27,20],[24,22],[20,21],[18,22.3],[17,23],[15,23],[13,22.3],[11,21.4],[8.5,21.4],[6.5,19]];
    polygon(mixContour(baseOuter,outer,amount),color.outline);
    polygon(mixContour(baseInner,inner,amount),color.orange);
    polygon(mixContour([[14,20],[21,20],[25,18],[27,19],[25,21],[20,22],[18,22],[18,23],[15,23],[14,22],[12,21]],cream,amount),color.cream);
    rect(12,15+4*amount,8,2,color.light);rect(13,13+4*amount,2,3,color.stripe);rect(18,12+4*amount,2,3,color.stripe);
  }
  function poseTail(points,amount) {
    const resting=[[11,21],[6,20],[3,17],[3,12],[5,10]];
    const contour=resting.map((point,i)=>mixPoint(point,points[i],amount));
    line(contour,color.outline,5);line(contour,color.orange,3);
    const tip=contour.at(-1);rect(tip[0]-1,tip[1],2,2,color.stripe);
    tailRoot={x:contour[0][0],y:contour[0][1]};
  }

  function rect(x, y, width, height, ink) {
    ctx.fillStyle = ink;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  }

  let rasterTop = 0;
  // Integer scan lines keep every contour a hand-drawn pixel edge.
  function polygon(points, ink) {
    ctx.fillStyle = ink;
    if (!points.flat().every(Number.isFinite)) return;
    const low = Math.max(rasterTop, Math.floor(Math.min(...points.map(point => point[1]))));
    const high = Math.min(spriteHeight, Math.ceil(Math.max(...points.map(point => point[1]))));
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

  function pawEdge(x,y,width=3) {
    // A solid sprite pixel stays crisp in motion; no CSS filter re-rasterizes the cat.
    if(document.documentElement.dataset?.theme==='light')rect(x,y,width,1,'#b0957d');
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
    line([mixPoint(root,knee,.5),knee,end],color.outline,far?2:3);
    line([root,knee,end],far?color.stripe:color.orange,2);
    rect(end[0] - 1, end[1] - 1, far ? 2 : 3, 2, far ? color.orange : color.cream);
    if(!far)pawEdge(end[0]-1,end[1]);
  }

  function softForeleg(root, elbow, paw, far = false) {
    const ink=far?color.stripe:color.orange;
    // Leave the shoulder open inside the chest; outline only the exposed lower leg.
    line([mixPoint(root,elbow,.45),elbow,paw],far?color.stripe:color.outline,3);
    line([root,elbow,paw],ink,2);
    const dx=elbow[0]-root[0],dy=elbow[1]-root[1],length=Math.hypot(dx,dy)||1;
    const nx=-dy/length,ny=dx/length,m= mixPoint(root,elbow,.55);
    polygon([[root[0]+nx*1.6,root[1]+ny*1.6],[root[0]-nx*1.6,root[1]-ny*1.6],
      [m[0]-nx,m[1]-ny],[m[0]+nx,m[1]+ny]],ink);
    rect(paw[0]-1,paw[1]-1,3,2,far?color.light:color.cream);
    if(!far)pawEdge(paw[0]-1,paw[1]);
  }
  function frontLeg(root, foot, far = false) {
    const elbow=[root[0]+(foot[0]-root[0])*.35,root[1]+(foot[1]-root[1])*.5];
    softForeleg(root,elbow,foot,far);
  }

  function tail(bob, sway = 0, sitting = false) {
    const points = sitting
      ? [[14, 24], [8, 25], [5, 23], [5 + sway, 20]]
      : [[11, 21 + bob], [6, 20 + bob], [3, 17 + bob], [3, 12 + bob], [5 + sway, 10 + bob]];
    const matrix = rigTransform();
    const [rootX, rootY] = points[0];
    tailRoot = { x: matrix.a * rootX + matrix.c * rootY + matrix.e,
      y: matrix.b * rootX + matrix.d * rootY + matrix.f };
    line(points, color.outline, 5);
    line(points, color.orange, 3);
    const [tipX, tipY] = points[points.length - 1];
    rect(tipX - 1, tipY, 2, 2, color.stripe);
  }

  function body(bob = 0, rump = 0, stretch = 0, hipSway = 0) {
    const rise = x => rump * Math.max(0, Math.min(1, (26 - x) / 15));
    const shift = points => points.map(([x, y]) => [x + Math.min(0,x-23)*stretch + hipSway*Math.max(0,Math.min(1,(26-x)/15)), y + bob - rise(x)]);
    polygon(shift([[6.5,17],[8.5,14],[11.8,11.7],[16,11.7],[19,13],[23,11],[26,14],[28,17],[28,20],[25,23],[21,22],[19,23.3],[17,24],[15,24],[13,23.3],[11,22.4],[7.5,22.4],[5.5,20]]), color.outline);
    polygon(shift([[7.5,17],[9.5,15],[11.8,12.7],[16,12.7],[19,14],[23,12],[25,15],[27,18],[27,20],[24,22],[20,21],[18,22.3],[17,23],[15,23],[13,22.3],[11,21.4],[8.5,21.4],[6.5,19]]), color.orange);
    polygon(shift([[10,17],[12,15],[16,15],[19,16],[21,16],[22,18],[16,18],[12,19],[10,18]]),color.light);
    polygon(shift([[14,20],[21,20],[25,18],[27,19],[25,21],[20,22],[18,22],[18,23],[15,23],[14,22],[12,21]]), color.cream);
    rect(13, 14 + bob - rise(14), 2, 3, color.stripe);
    rect(18, 13 + bob - rise(19), 2, 3, color.stripe);
  }

  function head(dx = 0, dy = -1, expression = 'normal', mouth = 0, tilt = 0) {
    // Preserve the approved face pixel-for-pixel. Looking changes only the
    // head's placement and the eyes' attention, never their shape or markings.
    ctx.save();
    ctx.translate(.75*gazeX,-.8*gazeY);
    ctx.translate(25,22);ctx.rotate(gazeX*(.045+.035*gazeY));ctx.translate(-25,-22);
    const turn = ([x, y]) => [25 + (x - 25) * Math.cos(tilt) - (y - 22) * Math.sin(tilt),
      22 + (x - 25) * Math.sin(tilt) + (y - 22) * Math.cos(tilt)];
    const shift = points => points.map(([x, y]) => turn([x + dx, y + dy]));
    // Rasterize tilted shapes on the pixel grid, keeping the face and teeth crisp.
    const box = (x, y, width, height, ink) => {
      if (!tilt) { rect(x, y, width, height, ink); return; }
      polygon([[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(turn), ink);
    };
    const inkLine = (points, ink, thickness = 1) => line(points.map(turn), ink, thickness);
    const matrix = rigTransform();
    const corners = [[20 + dx, 3 + dy], [40 + dx, 3 + dy], [20 + dx, 23 + dy], [40 + dx, 23 + dy]]
      .map(turn).map(([x, y]) => [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f]);
    headRegion = { left: Math.min(...corners.map(p => p[0])), right: Math.max(...corners.map(p => p[0])),
      top: Math.min(...corners.map(p => p[1])), bottom: Math.max(...corners.map(p => p[1])) };
    // British Shorthair cheeks, modest pointed ear tips, and an orange-white blaze.
    polygon(shift([[21, 10], [22, 7], [22, 4], [23, 3], [24, 2], [25, 3], [28, 6], [32, 6], [35, 3], [36, 2], [37, 3], [38, 4], [38, 8], [40, 11], [40, 18], [38, 21], [35, 23], [25, 23], [21, 21], [19, 18], [19, 13]]), color.outline);
    polygon(shift([[22, 10], [23, 8], [23, 5], [25, 5], [27, 8], [33, 8], [36, 5], [37, 5], [37, 9], [39, 12], [39, 17], [37, 20], [34, 22], [25, 22], [22, 20], [20, 17], [20, 13]]), color.orange);
    box(23 + dx, 6 + dy, 2, 2, color.pink);
    box(35 + dx, 6 + dy, 2, 2, color.pink);
    box(21 + dx, 13 + dy, 3, 4, color.light);
    box(37 + dx, 13 + dy, 2, 4, color.light);
    box(27 + dx, 9 + dy, 2, 2, color.stripe);
    box(33 + dx, 9 + dy, 2, 2, color.stripe);
    polygon(shift([[30, 9], [31, 11], [32, 13], [34, 15], [37, 17], [38, 19], [35, 22], [25, 22], [22, 20], [22, 17], [26, 15], [28, 13], [29, 11]]), color.cream);
    box(31 + dx, 17 + dy, 1, 1, color.pink);
    // A small mouth-side marking fades into the cream fur at its pixel edges.
    box(28 + dx, 18 + dy, 2, 2, `${color.orange}55`);
    box(29 + dx, 18 + dy, 1, 1, `${color.orange}88`);
    box(28 + dx, 19 + dy, 1, 1, color.orange);
    box(27 + dx, 19 + dy, 1, 1, `${color.orange}33`);
    box(28 + dx, 20 + dy, 1, 1, `${color.orange}33`);
    box(29 + dx, 19 + dy, 1, 1, color.orange);
    box(30 + dx, 19 + dy, 1, 1, `${color.orange}55`);
    box(29 + dx, 20 + dy, 1, 1, `${color.orange}44`);
    if (expression === 'normal' || expression === 'aim') {
      const pupil = expression === 'aim' && mouth > .35 ? 5 : 3;
      ctx.save();ctx.translate(.65*gazeX,-.5*gazeY);
      for (const eyeX of [25, 34]) {
        const focus=expression==='normal'?1+.1*gazeFocus:1;
        ctx.save();ctx.translate(eyeX+dx+1.5,14.5+dy);ctx.scale(focus,focus);ctx.translate(-eyeX-dx-1.5,-14.5-dy);
        if (pupil === 5) {
          // Rounded pixel pupil: narrow top/bottom rows and fuller middle rows.
          box(eyeX + dx, 12 + dy, 3, 5, color.eye);
          box(eyeX - 1 + dx, 13 + dy, 5, 3, color.eye);
        } else box(eyeX + dx, 13 + dy, 3, 3, color.eye);
        box(eyeX + dx, 13 + dy, 1, 1, color.cream);
        ctx.restore();
      }
      ctx.restore();
    } else {
      box(25 + dx, 14 + dy, 3, 1, color.eye);
      box(34 + dx, 14 + dy, 3, 1, color.eye);
      if (expression === 'pet') {
        box(25 + dx, 14 + dy, 3, 1, color.orange);
        box(34 + dx, 14 + dy, 3, 1, color.orange);
        inkLine([[25 + dx, 15 + dy], [26 + dx, 14 + dy], [27 + dx, 15 + dy]], color.eye);
        inkLine([[34 + dx, 15 + dy], [35 + dx, 14 + dy], [36 + dx, 15 + dy]], color.eye);
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
    if (!(expression === 'yawn' && mouth > 0)) {
      // A quiet warm-gray mouth line stays separate from the orange marking
      // on the left muzzle. The clean right cheek must not read as a second stain.
      inkLine([[29 + dx,18 + dy],[29 + dx,19 + dy],[30 + dx,19 + dy],
        [31 + dx,18 + dy],[32 + dx,19 + dy],[33 + dx,19 + dy],[33 + dx,18 + dy]],color.mouth);
      box(31 + dx,18 + dy,1,1,color.mouth);
    }
    ctx.restore();
  }

  // During stance, the paw retreats by exactly the distance the body advances.
  // During swing it lifts and returns forward; elapsed time alone never moves a leg.
  function gaitFoot(x, distance, offset = 0, stride = 4, stance = .65, lift = 2) {
    const cycle = stride / stance;
    const phase = ((distance / cycle + offset) % 1 + 1) % 1;
    if (phase < stance) return [x + stride / 2 - cycle * phase, 26];
    const swing = (phase - stance) / (1 - stance);
    // Match the stance velocity at toe-off and touchdown, then tuck and reach in between.
    const ease = swing * swing * (3 - 2 * swing)
      - (1-stance)/stance * swing*(1-swing)*(1-2*swing);
    return [x - stride / 2 + stride * ease, 26 - lift * Math.sin(Math.PI * swing)**2];
  }

  function drawWalk(distance) {
    const phase=distance/(4/.65)*Math.PI*2;
    tail(0,Math.round(Math.sin(phase)*.5));
    groundLeg([11,20],gaitFoot(11,distance,.5),true,4);
    frontLeg([23,20],gaitFoot(23,distance,.75),true);
    body();
    groundLeg([13,20],gaitFoot(13,distance,0),false,4);
    frontLeg([28,20],gaitFoot(28,distance,.25));
    const looking=Math.hypot(gazeX,gazeY)>.001;
    if(!looking)head();
    polygon([[24,20],[28,20],[29,21],[28,22],[26,23],[24,22]],color.orange);
    polygon([[25,20],[28,20],[28,21],[26,22],[25,21]],color.cream);
    if(looking)head();
  }

  function drawYawn(progress) {
    const open = Math.sin(progress * Math.PI) ** 2 * actionWeight;
    const mouth = Math.round(open * 4);
    tail(0, 0);
    groundLeg([14, 22], [13, 26], true);
    groundLeg([25, 22], [29, 26], true, 4);
    body(0);
    groundLeg([16, 22], [15, 26]);
    groundLeg([30, 22], [31 + Math.round(open), 26], false, 4);
    // A small upward head tilt, rather than a downward lunge, follows the yawn.
    head(0, 1, 'yawn', mouth, -open * Math.PI / 15);
  }

  function drawScratch(frame, progress) {
    const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const reach = poseLevel(progress);
    const scoot = 3 * reach;
    const shift = points => points.map(([x, y]) => [x + scoot, y]);
    poseTail([[14+scoot,24],[8+scoot,25],[5+scoot,23],[5+scoot,21],[5+scoot,20]],reach);
    groundLeg([25,21],[25,26],true);
    poseBody(shift([[10,22],[12,17],[17,14],[22,14],[25,18],[26,23],[23,26],[13,26]]),
      shift([[11,22],[13,18],[17,15],[21,15],[24,18],[25,22],[22,25],[13,25]]),
      [[14,20],[21,20],[25,18],[27,19],[25,21],[20,22],[18,22],[18,23],[15,23],[14,22],[12,21]],reach);
    frontLeg([27, 20], [29, 26]);
    head(0,0,reach>.3?'content':'normal');
    const rub = reach > .95 ? Math.round(Math.sin(frame * Math.PI / 3)) : 0;
    const foot = [19 + 9 * reach, 26 - 4 * reach + rub];
    groundLeg([18 + scoot, 23], foot, false, 4.5);
  }

  function drawStretch(frame, progress) {
    const stretch=poseLevel(progress);
    // A slow play-bow: planted hind paws, rounded raised hips and reaching forepaws.
    poseTail([[12,18],[7,16],[5,12],[6,8],[8,7]],stretch);
    groundLeg(mixPoint([11,20],[12,18],stretch),mixPoint(restFoot(11),[11,26],stretch),true,4.5);
    softForeleg(mixPoint([23,20],[23,21],stretch),mixPoint([23,23],[27,24],stretch),mixPoint(restFoot(23),[32,26],stretch),true);
    poseBody([[8,17],[10,13],[14,11],[18,13],[22,17],[26,20],[29,23],[28,26],[23,26],[18,23],[14,21],[10,21],[7,19]],
      [[9,17],[11,14],[14,12],[17,14],[21,18],[25,21],[28,24],[27,25],[23,25],[18,22],[14,20],[10,20],[8,19]],
      [[15,19],[20,20],[26,23],[28,25],[22,25],[18,22]],stretch);
    groundLeg(mixPoint([13,20],[15,18],stretch),mixPoint(restFoot(13),[15,26],stretch),false,4.5);
    // The shoulder stays inside the lowered chest; the elbow unfolds along the floor.
    // Draw the arm before the head so the cheek overlaps its root, not vice versa.
    const paw=mixPoint(restFoot(28),[36,26],stretch);
    softForeleg(mixPoint([28,20],[24.5,21.5],stretch),
      mixPoint([28,23],[29,24.5],stretch),paw);
    head(-stretch,-1+3.5*stretch,stretch>.35?'content':'normal');
    if(stretch>.65){
      rect(paw[0]-1,25,4,2,color.cream);pawEdge(paw[0]-1,26,4);
      rect(paw[0],26,1,1,color.light);rect(paw[0]+2,26,1,1,color.light);
    }
  }

  function drawGroom(frame, progress, belly = false) {
    const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const settle = poseLevel(progress);
    const cycle = (1 - Math.cos(frame / 9 * Math.PI * 2)) / 2;
    const dip = settle * (.55 + .45 * cycle);
    poseTail([[14,24],[8,25],[5,23],[5,21],[5,20]],settle);
    poseBody([[10,23],[12,17],[17,14],[22,14],[25,18],[26,24],[23,26],[13,26]],
      [[11,23],[13,18],[17,15],[21,15],[24,18],[25,23],[22,25],[13,25]],
      [[16,21],[22,20],[24,24],[20,26],[16,25]],settle);
    groundLeg(mixPoint([13,20],[16,24],settle),mixPoint([13,26],[18,26],settle),false,4);
    if (belly) {
      // Sit first, fold the knee, then extend the lower leg. Reverse that order before standing.
      const lift=easePose((progress-.1)/.22)*(1-easePose((progress-.67)/.2))*actionWeight;
      const extend=easePose((lift-.35)/.65);
      const root=mixPoint([13,20],[16,24],settle);
      const knee=mixPoint(mixPoint([13,23],[15,25],settle),[12,20],lift);
      const folded=mixPoint(mixPoint([13,26],[18,26],settle),[14,21],lift);
      const paw=mixPoint(folded,[12,13],extend);
      line([mixPoint(root,knee,.35),knee,paw],color.outline,3);
      line([root,knee,paw],color.orange,2);
      rect(paw[0]-1,paw[1]-1,3,2,color.cream);pawEdge(paw[0]-1,paw[1]);
      const groomingDip=dip*(.3+.7*lift);
      head(-8*groomingDip,2*groomingDip,settle>.25?'content':'normal',0,.4*groomingDip);
      if(lift>.8&&cycle>.65)rect(21,24,2,1,color.pink);
      frontLeg([24,21],[27,26]);
    } else {
      // Repeated head dips bring the muzzle down onto the foreleg fur.
      frontLeg([24,20],[26,26],true);
      head(-4*dip,1.5*dip,settle>.25?'content':'normal',0,.32*dip);
      frontLeg([25,21],[29,26-2*settle]);
      if (settle > .8 && cycle > .65) rect(28, 23, 2, 1, color.pink);
      rect(13, 25, 4, 2, color.cream);pawEdge(13,26,4);
    }
  }

  function drawCarried(frame,amount=1) {
    const lift=easePose(amount),curl=(1-Math.cos(frame*.28))/2*lift;
    poseTail([[12,27],[10,29],[9,32],[8,35],[8,38]],lift);
    groundLeg(mixPoint([14,21],[15,30],lift),mixPoint([14,26],[14,36-curl],lift),true,4);
    groundLeg(mixPoint([25,21],[26,25],lift),mixPoint([25,26],[28,30-curl],lift),true,4);
    poseBody([[16,10],[22,12],[27,19],[29,26],[28,31],[25,34],[14,34],[10,31],[9,26],[11,18]],
      [[16,12],[21,13],[25,20],[27,26],[26,30],[24,33],[15,33],[12,30],[11,26],[13,18]],
      [[18,23],[24,23],[26,27],[24,32],[17,32],[14,29],[15,25]],lift);
    groundLeg(mixPoint([16,22],[24,31],lift),mixPoint([16,26],[24,36-curl],lift),false,4);
    head(-6*lift,2*lift,'normal');
    groundLeg(mixPoint([30,22],[21,25],lift),mixPoint([31,26],[21,29-curl],lift),false,3);
    if(lift>.5){rect(19,29-curl,3,1,color.cream);rect(28,29-curl,3,1,color.cream);}
  }

  function drawScared(progress = 1) {
    const tuck = Math.max(0, Math.min(1, progress))*actionWeight;
    if(tuck<.001){drawStanding();return;}
    const paw=(x,phase,target)=>mixPoint(restFoot(x),target,tuck);
    poseTail([[12,23],[7,24],[6,22],[6,20],[8,17]],tuck);
    groundLeg(mixPoint([11,20],[15,24],tuck),paw(11,.5,[17,26]),true,4);
    frontLeg(mixPoint([23,20],[24,24],tuck),paw(23,.75,[25,26]),true);
    ctx.save();ctx.translate(3*tuck,26*.2*tuck);ctx.scale(1-.08*tuck,1-.2*tuck);body();ctx.restore();
    groundLeg(mixPoint([13,20],[19,24],tuck),paw(13,0,[23,26]),false,4);
    frontLeg(mixPoint([28,20],[27,24],tuck),paw(28,.25,[29,26]));
    head(-4*tuck,-1+4*tuck,tuck>.2?'aim':'normal',tuck);
  }

  function drawFalling(progress) {
    const spread=actionWeight;
    if(spread<.001){drawStanding();return;}
    tail(0,-spread);
    groundLeg([11,20],mixPoint(restFoot(11),[12,26],spread),true,4);
    frontLeg([23,20],mixPoint(restFoot(23),[25,26],spread),true);
    body();
    groundLeg([13,20],mixPoint(restFoot(13),[12,26],spread),false,4);
    frontLeg([28,20],mixPoint(restFoot(28),[30,26],spread));
    head(-spread,-1+spread,spread>.2?'aim':'normal',spread);
  }

  function drawSploot(frame,progress=0) {
    const settle=poseLevel(progress),breath=.4*Math.sin(frame/30*Math.PI)**2*settle;
    poseTail([[11,23],[7,24],[4,24],[3,23],[2,22]],settle);
    groundLeg(mixPoint([14,21],[14,23],settle),mixPoint([14,26],[8,26],settle),true);
    groundLeg(mixPoint([16,22],[16,24],settle),mixPoint([16,26],[10,26],settle));
    poseBody([[9,23],[12,18-breath],[23,17-breath],[29,21],[29,26],[11,26]],
      [[10,23],[13,19-breath],[23,18-breath],[28,22],[27,25],[11,25]],
      [[12,24],[24,23],[27,24],[26,25],[13,25]],settle);
    groundLeg(mixPoint([25,20],[26,23],settle),mixPoint([25,26],[23,26],settle));
    groundLeg(mixPoint([31,20],[33,23],settle),mixPoint([31,26],[37,26],settle));
    head(-settle,3*settle,settle>.4?'content':'normal');
  }

  function drawBelly(frame,progress) {
    const amount=poseLevel(progress),side=easePose(amount/.65),roll=easePose((amount-.4)/.6);
    const curl=Math.sin(frame/15*Math.PI)*.4*roll;
    const paw=(root,elbow,tip,standingRoot,standingTip,far,front=false)=>{
      const r=mixPoint(standingRoot,root,side),end=mixPoint(standingTip,tip,side);
      const joint=mixPoint([(standingRoot[0]+standingTip[0])/2,24],elbow,side);
      if(front)softForeleg(r,joint,end,far);else limb([r,joint,end],far);
      if(roll>.7)rect(end[0],end[1],1,1,color.pink);
    };
    poseTail([[11,23],[8,24],[6,25],[4,24],[3,23]],side);
    paw([12,22],[11,20-3*roll],[12,22-7*roll+curl],[11,20],restFoot(11),true);
    paw([24,21],[25,22-5*roll],[27,24-9*roll-curl],[23,20],restFoot(23),true,true);
    const blend=(a,b)=>mixContour(a,b,roll);
    poseBody(blend([[7,22],[10,18],[17,17],[25,19],[29,23],[26,26],[10,26]],[[7,22],[10,17],[17,15],[25,17],[29,22],[26,26],[10,26]]),
      blend([[8,22],[11,19],[17,18],[24,20],[28,23],[25,25],[11,25]],[[8,22],[11,18],[17,16],[24,18],[28,22],[25,25],[11,25]]),
      blend([[12,24],[15,22],[21,22],[25,23],[23,25],[13,25]],[[11,21],[15,18],[21,18],[25,21],[23,25],[12,25]]),side);
    // Settle onto one shoulder, then expose the belly; the head never spins upside down.
    head(-2*side,3*side,side>.3?'content':'normal',0,.32*roll);
    paw([13,23],[14,22],[16,23-2*roll-curl],[13,20],restFoot(13),false);
    paw([25,22],[26,21],[28,23-3*roll+curl],[28,20],restFoot(28),false,true);
  }

  function sprintPose(distance) {
    const cycle = 15;
    const phase = ((distance / cycle) % 1 + 1) % 1;
    const air = phase > .37 && phase < .5 ? Math.sin((phase - .37) / .13 * Math.PI)
      : phase > .87 ? Math.sin((phase - .87) / .13 * Math.PI) : 0;
    const load = (start,end) => phase>start && phase<end ? Math.sin((phase-start)/(end-start)*Math.PI) : 0;
    const compression = .5*load(.07,.3)+.25*load(.57,.8);
    const lift = compression - air * 1.2;
    const arch = .35 * load(.57,.87);
    const stretch = .04*air-.025*compression;
    const foot = (x, offset) => gaitFoot(x, distance, offset, 4.5, .3, 3.1);
    return { phase, lift, arch, stretch, feet: [foot(11,.5),foot(23,0),foot(13,.43),foot(28,-.07)] };
  }

  const standingFeet=[[11,26],[23,26],[15,26],[28,26]];
  const restFoot=x=>[x===13?15:x,26];
  function locomotionPose(distance,blend=1,settle=0) {
    const pose=sprintPose(distance),phase=pose.phase;
    const walkLoad=.2*(1-Math.cos(distance/(4/.65)*Math.PI*4))/2;
    const lift=pose.lift*blend+walkLoad*(1-blend),arch=pose.arch*blend,stretch=pose.stretch*blend;
    const hipShift=-12*stretch;
    const walking=[gaitFoot(11,distance,.5),gaitFoot(23,distance,.75),gaitFoot(13,distance,0),gaitFoot(28,distance,.25)];
    const movingFeet=pose.feet.map((foot,i)=>mixPoint(walking[i],foot,blend));
    // Finish a step by lowering its actual paws, not by fast-forwarding a whole
    // stride in place. Starting again grows naturally out of the planted stance.
    const planted=Math.max(settle,1-easePose(Math.max(0,distance)/1.8));
    return {lift:lift*(1-planted),arch:arch*(1-planted),stretch:stretch*(1-planted),
      hipShift:hipShift*(1-planted),sway:Math.sin(phase*Math.PI*2)*.5*(1-planted),
      feet:movingFeet.map((foot,i)=>mixPoint(foot,standingFeet[i],planted))};
  }
  function drawStanding(){drawSprint(0,0,1);}
  function drawSprint(distance,blend=1,settle=0) {
    const {lift,arch,stretch,hipShift,sway,feet}=locomotionPose(distance,blend,settle);
    ctx.save();ctx.translate(hipShift,0);tail(lift-arch*.4,sway);ctx.restore();
    groundLeg([11+hipShift,20+lift-arch],feet[0],true,4);
    frontLeg([23,20+lift],feet[1],true);
    body(lift,arch,stretch);
    groundLeg([13+hipShift,20+lift-arch*.65],feet[2],false,4);
    frontLeg([28,20+lift],feet[3]);
    const looking=Math.hypot(gazeX,gazeY)>.001;
    if(!looking)head(-arch*.25,-1+lift*.4);
    polygon([[24,20],[28,20],[29,21],[28,22],[26,23],[24,22]].map(([x,y])=>[x,y+lift]),color.orange);
    polygon([[25,20],[28,20],[28,21],[26,22],[25,21]].map(([x,y])=>[x,y+lift]),color.cream);
    if(looking)head(-arch*.25,-1+lift*.4);
  }

  function drawTurn(progress) {
    // A continuous pivot with staggered paw placement, through a front view.
    // World-space paw paths stay continuous when the sprite changes facing.
    // One monotonic yaw through the whole turn: no easing toward a middle
    // keyframe, no held front view, and no second animation after the midpoint.
    const yaw=Math.PI*easePose(progress),cos=Math.cos(yaw),sin=Math.sin(yaw);
    const amount=1-Math.abs(cos),look=amount;
    const mix=(a,b)=>a+(b-a)*amount;
    const localX=x=>progress<.5?x:40-x;
    const roots=[[11,20],[23,20],[13,20],[28,20]],depth=[-3,-3,4,4];
    const starts=standingFeet;
    const windows=[[.04,.72],[.06,.44],[.30,.92],[.47,.98]];
    const feet=starts.map((foot,i)=>{
      const q=Math.max(0,Math.min(1,(progress-windows[i][0])/(windows[i][1]-windows[i][0])));
      const x=foot[0]+(40-2*foot[0])*easePose(q);
      return [localX(x),foot[1]-1.4*Math.sin(Math.PI*q)**2];
    });
    const leg=i=>{
      const root=[localX(20+(roots[i][0]-20)*cos+depth[i]*sin),roots[i][1]+.7*sin];
      if(i%2)frontLeg(root,feet[i],i<2);else groundLeg(root,feet[i],i<2,4);
    };
    poseTail([[20,21],[20,20],[20,17],[20,12],[20,10]],amount);
    leg(0);leg(1);
    poseBody([[12,17],[13,14],[16,12],[20,11],[24,12],[27,14],[28,17],[28,22],[25,24],[15,24],[12,22]],
      [[13,17],[14,15],[17,13],[20,12],[23,13],[26,15],[27,17],[27,21],[24,23],[16,23],[13,21]],
      [[16,19],[20,18],[24,19],[25,21],[23,23],[17,23],[15,21]],amount);
    leg(2);leg(3);
    // Cover the shoulder seams in the same order as the normal standing pose.
    polygon([[24,20],[28,20],[29,21],[28,22],[26,23],[24,22]].map(([x,y])=>[mix(x,20),y]),color.orange);
    polygon([[25,20],[28,20],[28,21],[26,22],[25,21]].map(([x,y])=>[mix(x,20),y]),color.cream);
    head(-10*look,-1+.6*amount);
  }

  function requestTurn(nextDirection, now = performance.now()) {
    if (turnMotion) { turnMotion.next = nextDirection; return; }
    if (nextDirection === direction) return;
    const from = direction;
    if (pounceHeld && playStarted !== null) {
      // A charged cat pivots where its paws are planted, without jumping across its old origin.
      playOrigin = currentX;
      pounceBackstep = 0;
    }
    direction = nextDirection;
    if (reducedMotion.matches) return;
    turnMotion = { from, to: nextDirection, next: nextDirection, start: now, lastTick: now, progress: 0 };
    paint('turn', 0, 0);
  }

  function tickTurn(now) {
    if (!turnMotion) return false;
    const turn = turnMotion;
    const dt = Math.max(0, now - turn.lastTick);
    turn.lastTick = now;
    // Pause translation and reaction clocks while the paws change stance.
    startedAt += dt;
    if (playStarted !== null) playStarted += dt;
    if (petStarted !== null) petStarted += dt;
    if (tailStarted !== null) tailStarted += dt;
    if (walkAway) walkAway.start += dt;
    followTime = now;
    turn.progress = Math.min(1, Math.max(0, (now - turn.start) / turnDuration));
    if (now - lastPaint >= 1000 / 60) { lastPaint = now; paint('turn', 0, turn.progress); }
    if (turn.progress >= 1) {
      const next = turn.next;
      turnMotion = null;
      lastPaint = -Infinity;
      if (next !== direction) requestTurn(next, now);
    }
    return true;
  }

  function travelProgress(progress, edge = .12) {
    const ramp = t => (t - edge / Math.PI * Math.sin(Math.PI * t / edge)) / (2 * (1 - edge));
    if (progress < edge) return ramp(progress);
    if (progress > 1 - edge) return 1 - ramp(1 - progress);
    return (progress - edge / 2) / (1 - edge);
  }

  function drawPet(progress) {
    const rise = Math.sin(Math.PI * Math.min(1, progress / .65)) * actionWeight;
    const nuzzle = -Math.round(Math.max(0, rise) * 3);
    tail(0, Math.round(Math.sin(progress * Math.PI * 2)));
    body(0);
    groundLeg([16, 22], [16, 26]);
    frontLeg([27, 20], [29, 26]);
    head(0,nuzzle,actionWeight>.4?'pet':'normal');
  }

  function drawTailEnjoy(progress) {
    const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const raised = ease(progress / .28) * (1 - ease((progress - .72) / .28)) * actionWeight;
    const lift = 2 * raised;
    const resting = [[11,21],[6,20],[3,17],[3,12],[5,10]];
    const upright = [[11,19],[10,16],[10,12],[10,8],[10,4]];
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
    frontLeg([27, 20], [29, 26]);
    head(0, Math.round(raised), raised>.2?'pet':'normal');
  }

  function pouncePose(progress) {
    const clamp = t => Math.max(0, Math.min(1, t));
    const smooth = t => t * t * (3 - 2 * t);
    const prep = clamp(progress / pounceTiming.takeoff);
    const flight = clamp((progress - pounceTiming.takeoff) / (pounceTiming.landing - pounceTiming.takeoff));
    const settling = clamp((progress - pounceTiming.landing) / (1 - pounceTiming.landing));
    return { prep, flight, crouch: progress < pounceTiming.takeoff ? smooth(clamp(prep * 2.5))
      : progress < pounceTiming.landing ? 0 : Math.sin(settling * Math.PI),
      retreat: progress < pounceTiming.takeoff ? smooth(prep) : 1 - flight,
      wiggle: progress < pounceTiming.takeoff ? Math.sin(prep * Math.PI * 5) * Math.sin(prep * Math.PI) : 0 };
  }

  function drawPounce(progress, frame = 0) {
    const pose = pouncePose(progress);
    const { prep, flight } = pose;
    const crouch=pose.crouch*actionWeight;
    const wiggle = pounceHeld ? Math.sin(frame * .36) * Math.min(1, prep * 3) : pose.wiggle;
    const aiming = progress < pounceTiming.takeoff;
    const reach = Math.sin(flight * Math.PI)*actionWeight;
    const hip = aiming ? wiggle * 1.6 * actionWeight : 0;
    // Only the haunches sway; the chest and planted feet do not translate with the hips.
    const plant=aiming?pounceBackstep*pose.retreat*actionWeight/pixelScale:0;
    const foot=(x,dx,dy)=>[x+plant+dx*reach,26+dy*reach];
    tail(crouch, Math.sin(frame*.36)*.65*crouch);
    groundLeg([11+hip,20+crouch*.6],foot(13,-2,-2),true,4);
    frontLeg([23,20+crouch*.6],foot(24,4,-2),true);
    ctx.save();ctx.translate(0,26*.1*crouch);ctx.scale(1,1-.1*crouch);
    body(0,0,0,hip);ctx.restore();
    groundLeg([13+hip*.87,20+crouch*.6],foot(15,-3,-2),false,4);
    frontLeg([28,20+crouch*.6],foot(28.5,5,-3));
    head(0,-1+3*crouch,aiming&&actionWeight>.3?'aim':'normal',prep*actionWeight);

  }

  function drawChase(distance) {
    drawWalk(distance);
  }

  function portalGesture(progress) {
    const clip=t=>Math.max(0,Math.min(1,t)),ease=t=>t*t*(3-2*t);
    const circle=clip((progress-.24)/.54),theta=Math.PI/2+2*Math.PI*circle;
    const expand=ease(clip((progress-.78)/.22));
    return {circle,x:0,lift:0,paw:[32+5*Math.cos(theta),13+9.2*Math.sin(theta)],
      upright:ease(clip(progress/.24))*(1-ease(clip((progress-.78)/.22))),
      size:.5+.5*expand,centerX:32+7.2*expand,bottom:-5.8+4.8*expand};
  }
  function drawPortalOpen(frame,progress) {
    ctx.save();const previousRasterTop=rasterTop;
    if(spriteHeight===40){ctx.translate(0,12);rasterTop=-12;}
    const gesture=portalGesture(progress),rise=gesture.upright*actionWeight;
    if(rise<.0001){drawStanding();rasterTop=previousRasterTop;ctx.restore();return;}
    // Rear paws remain planted. The hips support an upright chest while one
    // foreleg traces the circle; the torso never orbits the aperture.
    poseTail([[12,22],[8,24],[4,23],[3,19],[4,16]],rise);
    groundLeg(mixPoint([11,20],[13,22],rise),[11,26],true,4);
    const farShoulder=mixPoint([23,20],[22,13],rise);
    frontLeg(farShoulder,mixPoint(standingFeet[1],[24,18],rise),true);
    poseBody([[9,22],[11,18],[16,15],[18,10],[22,8],[26,10],[27,15],[24,21],[22,25],[13,26],[9,24]],
      [[10,22],[12,19],[17,16],[19,11],[22,9],[25,11],[26,15],[23,21],[21,24],[13,25],[10,24]],
      [[19,12],[23,11],[25,14],[23,20],[20,23],[16,23],[17,19]],rise);
    groundLeg(mixPoint([13,20],[17,23],rise),standingFeet[2],false,4+.5*rise);
    head(-6*rise,-5*rise,'normal');
    const shoulder=mixPoint([28,20],[26,13],rise);
    const paw=mixPoint(standingFeet[3],gesture.paw,rise);
    const dx=paw[0]-shoulder[0],dy=paw[1]-shoulder[1],distance=Math.hypot(dx,dy)||1;
    const bone=3+(6.2-3)*rise,bend=Math.sqrt(Math.max(0,bone*bone-distance*distance/4));
    const elbow=[(shoulder[0]+paw[0])/2-dy/distance*bend,(shoulder[1]+paw[1])/2+dx/distance*bend];
    softForeleg(shoulder,elbow,paw);
    rasterTop=previousRasterTop;ctx.restore();
  }
  function drawPlay(frame, progress, singleTap = false) {
    const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    const upright = smooth(progress / .17) * (1 - smooth((progress - .82) / .18)) * actionWeight;
    const mix = (a, b) => a + (b - a) * upright;
    // Fixed-length bones rotate at their joints; no independently sliding elbow/paw.
    // Angles are measured from the forward axis, with positive angles pointing down.
    const poses = singleTap ? [
      [0,90,90,90,90], [.5,-25,-55,85,75], [.62,-25,-55,85,75], [1,90,90,90,90]
    ] : [
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
    const angle = n => (90+(from[n]+(to[n]-from[n])*t-90)*actionWeight)*Math.PI/180;
    const foreleg = (far) => {
      // Shoulder attachment follows the same torso transform throughout the rise.
      const shoulder = [mix(far?23:26,far?22:singleTap?24:25),mix(20,singleTap?17:20)];
      const upper = far||singleTap?angle(far?3:1):Math.max(0,angle(1));
      const lower = far||singleTap?angle(far?4:2):Math.max(-.25,angle(2));
      const reach = mix(3, singleTap?2.8:far?3.2:4.2);
      let elbow = [shoulder[0] + reach * Math.cos(upper), shoulder[1] + reach * Math.sin(upper)];
      let paw = [elbow[0] + reach * Math.cos(lower), elbow[1] + reach * Math.sin(lower)];
      // Slim forelegs avoid the heavy block that previously covered the entire chest.
      softForeleg(shoulder,elbow,paw,far);
    };
    const morph = (standing,seated) => mixContour(standing,seated,upright);
    tail(0, Math.round(Math.sin(progress * Math.PI * (singleTap ? 1 : 4)) * upright));
    limb([[14,23],[14,25],[14,26]],true);
    foreleg(true);
    polygon(morph(
      [[6.5,17],[8.5,14],[11.8,11.7],[16,11.7],[19,13],[23,11],[26,14],[28,17],[28,20],[25,23],[21,22],[19,23.3],[17,24],[15,24],[13,23.3],[11,22.4],[7.5,22.4],[5.5,20]],
      [[10,20],[13,16],[18,12],[23,10],[26,13],[26,19],[25,23],[23,25],[12,25],[9,23],[8,21]]), color.outline);
    polygon(morph(
      [[7.5,17],[9.5,15],[11.8,12.7],[16,12.7],[19,14],[23,12],[25,15],[27,18],[27,20],[24,22],[20,21],[18,22.3],[17,23],[15,23],[13,22.3],[11,21.4],[8.5,21.4],[6.5,19]],
      [[11,20],[14,17],[18,13],[22,11],[25,14],[25,19],[24,22],[22,24],[12,24],[10,22],[9,21]]), color.orange);
    polygon([[mix(13,17),21],[mix(23,24),mix(20,14)],[mix(27,25),21],[mix(25,23),24],[13,24],[11,23]], color.cream);
    rect(13, mix(14,19), 2, 3, color.stripe);
    rect(18, mix(13,15), 2, 3, color.stripe);
    limb([[16,23],[16,25],[16,26]]);
    head(-Math.round(4 * upright), -Math.round(3 * upright), upright>.2?'aim':'normal', upright);
    foreleg(false);
  }

  function drawAction(kind,frame,progress) {
    if (kind === 'carried') drawCarried(frame,progress);
    else if (kind === 'turn') drawTurn(progress);
    else if (kind === 'scared') drawScared(progress);
    else if (kind === 'falling') drawFalling(progress);
    else if (kind === 'grab') drawPlay(frame, progress);
    else if (kind === 'button-tap') drawPlay(frame, progress, true);
    else if (kind === 'portal-open') drawPortalOpen(frame, progress);
    else if (kind === 'pounce') drawPounce(progress, frame);
    else if (kind === 'tail-enjoy') drawTailEnjoy(progress);
    else if (kind === 'pet') drawPet(progress);
    else if (kind === 'play') drawPlay(frame, progress);
    else if (kind === 'belly') drawBelly(frame, progress);
    else if (kind === 'sploot') drawSploot(frame,progress);
    else if (kind === 'sprint') drawSprint(gaitDistance,gaitBlend);
    else if (kind === 'chase') drawSprint(gaitDistance,gaitBlend);
    else if (kind === 'yawn') drawYawn(progress);
    else if (kind === 'scratch') drawScratch(frame, progress);
    else if (kind === 'stretch') drawStretch(frame, progress);
    else if (kind === 'groom') drawGroom(frame, progress);
    else if (kind === 'belly-groom') drawGroom(frame, progress, true);
    else if (kind === 'idle') drawStanding();
    else if(kind==='walk')drawSprint(gaitDistance,gaitBlend);
    else drawWalk(gaitDistance);
  }
  const restingActions=new Set(['portal-open','button-tap','stretch','scratch','groom','belly-groom','sploot','belly','pet','tail-enjoy','grab','pounce','yawn','scared']);
  function drawExit(source,progress) {
    const previousGaze=[gazeX,gazeY,gazeFocus];
    if(source.gaze){const weight=1-easePose(progress);gazeX=source.gaze[0]*weight;gazeY=source.gaze[1]*weight;gazeFocus=(source.gaze[2]||0)*weight;}
    try {
    if(progress>=1){actionWeight=1;postureOverride=null;drawStanding();return;}
    actionWeight=(source.exitWeight??1)*(1-easePose(progress));
    postureOverride=(easePose(source.progress/.16)*(1-easePose((source.progress-.84)/.16)))*actionWeight;
    if(source.kind==='turn')drawTurn(source.progress+(source.progress<.5?-source.progress:1-source.progress)*easePose(progress));
    else if(['walk','chase','sprint'].includes(source.kind)) {
      drawSprint(source.distance||0,source.gaitBlend??0,easePose(progress));
    } else if(source.kind==='idle')drawStanding();
    else drawAction(source.kind,source.frame,source.progress);
    actionWeight=1;postureOverride=null;
    } finally {[gazeX,gazeY,gazeFocus]=previousGaze;}
  }
  function tickPoseHandoff(now) {
    if(!poseHandoff)return false;
    const handoff=poseHandoff,dt=Math.max(0,now-handoff.last);handoff.last=now;
    startedAt+=dt;if(playStarted!==null)playStarted+=dt;if(petStarted!==null)petStarted+=dt;if(tailStarted!==null)tailStarted+=dt;
    if(walkAway)walkAway.start+=dt;if(laneMotion)laneMotion.start+=dt;
    if(turnMotion){turnMotion.start+=dt;turnMotion.lastTick=now;}followTime=now;if(nearAttention)nearLast=now;
    const p=Math.min(1,(now-handoff.start)/220);
    ctx.clearRect(0,0,canvas.width,canvas.height);drawExit(handoff.source,p);
    lastPose={...handoff.source,gaze:handoff.source.gaze?.map(v=>v*(1-easePose(p))),exitWeight:(handoff.source.exitWeight??1)*(1-easePose(p))};
    stage.dataset.transition='settling';
    if(p>=1){poseHandoff=null;lastPose=null;gaitDistance=0;lastGaitX=currentX;gaitBlend=0;gaitPaintAt=now;delete stage.dataset.transition;lastPaint=-Infinity;}
    return true;
  }

  function paint(kind, frame, progress = 0) {
    if(poseHandoff && !transportDriver?.blocksInput())return;
    frame = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
    progress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    if (turnMotion) {
      kind = 'turn';
      progress = turnMotion.progress;
      const facing = progress < .5 ? turnMotion.from : turnMotion.to;
      canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${facing})`;
    }
    if (['walk','sprint','chase'].includes(kind)) {
      gaitDistance+=Math.abs(currentX-lastGaitX)/pixelScale;
      const now=performance.now(),step=gaitPaintAt?Math.min(1,(now-gaitPaintAt)/220):0;
      gaitPaintAt=now;const target=kind==='sprint'?1:0;
      gaitBlend+=Math.max(-step,Math.min(step,target-gaitBlend));
    }
    lastGaitX = currentX;
    const stablePlatform=!laneMotion||['raised','grooming','compact-settle'].includes(laneMotion.kind);
    if(stablePlatform && !poseHandoff && lastPose && lastPose.kind!==kind && restingActions.has(lastPose.kind) &&
      (lastPose.progress>.12||(lastPose.kind==='scared'&&lastPose.progress>.1)) && !transportDriver?.blocksInput() && !reducedMotion.matches) {
      const now=performance.now();poseHandoff={source:lastPose,start:now,last:now};
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tailRoot = { x: 11, y: 21 };
    stage.dataset.action = kind;
    updateGaze(kind);
    drawAction(kind,frame,progress);
    lastPose={kind,frame,progress,distance:gaitDistance,gaitBlend,gaze:[gazeX,gazeY,gazeFocus]};
    if (cursorPoint && active) {
      const point = pointerOnSprite(cursorPoint);
      const overControl=cursorPoint.target?.closest?.('a, button, summary, input, textarea, select, [contenteditable]');
      showCursor(point&&!overControl ? cursorZone(point) : null);
    }
  }

  function measure() {
    const width = canvas.getBoundingClientRect().width;
    pixelScale = width / 40 || 1.6;
    const previousTravel = travel;
    travel = Math.max(0, stage.getBoundingClientRect().width - width);
    if (previousTravel > 0 && travel !== previousTravel) {
      const fit = x => Math.max(0, Math.min(travel, x / previousTravel * travel));
      currentX = fit(currentX);
      lastGaitX = currentX;
      playOrigin = fit(playOrigin);
      playTarget = fit(playTarget);
      if (walkAway) { walkAway.from = fit(walkAway.from); walkAway.to = fit(walkAway.to); }
    }
  }

  function resetLane() {
    laneMotion = null;
    laneOffset = catLift = 0;
    stage.style.removeProperty('transform');
    delete stage.dataset.lane;
  }

  function raiseLane() {
    if (transportDriver?.isAway() || !desktopLane.matches || reducedMotion.matches || pet.dataset.dismissed === 'true') return;
    if (!active) activate();
    if (!active || transportDriver?.isAway()) return;
    const photo = document.querySelector('.pet-portrait').getBoundingClientRect();
    const contact = document.querySelector('.profile-contact').getBoundingClientRect();
    const floor = stage.getBoundingClientRect().bottom + laneOffset;
    const desired = Math.min(photo.top - 16, Math.max(contact.bottom + canvas.getBoundingClientRect().height + 16, photo.top - 24));
    const target = Math.max(0, floor - desired);
    playStarted = petStarted = tailStarted = null;
    pendingInput = walkAway = null;
    pounceHeld = false;
    chargePointer = null;
    stroke = null;
    clearCursor();
    featherFollowing = false;
    turnMotion = null;
    laneMotion = { kind: 'rising', start: performance.now(), from: laneOffset, catFrom: catLift, target };
    stage.dataset.lane = 'rising';
    lastPaint = -Infinity;
  }

  function lowerLane() {
    if (transportDriver?.isAway() || !desktopLane.matches) return;
    if (!laneMotion && !laneOffset && !catLift) return;
    poseHandoff = null;
    laneMotion = { kind: 'falling', start: performance.now(), from: laneOffset, catFrom: catLift };
    stage.dataset.lane = 'falling';
    lastPaint = -Infinity;
  }

  function beginBackgroundMotion(event) {
    if (transportDriver?.isAway() || desktopLane.matches || reducedMotion.matches) return;
    const {from,to,duration,expanded} = event.detail;
    if(duration===0){if(laneMotion?.kind==='background'){resetLane();pendingLandingGroom=pendingCompactTension=false;lastPaint=-Infinity;}return;}
    if (!active && pet.dataset.interacting !== 'true') return;
    // Platform motion owns its clock; a prior pose must not delay the DOM animation.
    poseHandoff = null;
    delete stage.dataset.transition;
    pendingLandingGroom = expanded;
    pendingCompactTension = !expanded;
    if (!active) return;
    const line = stage.getBoundingClientRect().bottom;
    laneMotion = { kind: 'background', start: performance.now(), duration, expanded,
      catFrom: line - catLift, toLine: line + to - from, scroll: window.scrollY || 0 };
    laneOffset = 0;
    if (!expanded) catLift = 0;
    turnMotion = null;
    playStarted = petStarted = tailStarted = null;
    pendingInput = walkAway = null;
    pounceHeld = false;
    chargePointer = null;
    featherFollowing = false;
    stroke = null;
    clearCursor();
    stage.dataset.lane = expanded ? 'falling' : 'rising';
    lastPaint = -Infinity;
  }

  function tickLane(now) {
    if (!laneMotion) return false;
    const motion = laneMotion;
    const elapsed = Math.max(0, now - motion.start);
    const clamp = t => Math.max(0, Math.min(1, t));
    const smooth = t => t * t * (3 - 2 * t);
    let pose = 'scared', progress = 1, frame = Math.floor(elapsed / 80);
    if(motion.kind==='raised' && (motion.relaxed || elapsed>=1200)) {
      if(!motion.relaxed) {
        motion.relaxed=true;
        const along=travel?(direction===1?currentX/travel:1-currentX/travel):0;
        buildSequence(Math.max(0,Math.min(.999,along)));startedAt=now;lastPaint=-Infinity;
      }
      stage.style.transform=`translate3d(0,${-laneOffset}px,0)`;
      return false;
    }
    if (motion.kind === 'background') {
      const t = clamp((elapsed - (motion.expanded ? 70 : 0)) / Math.max(1,motion.duration - (motion.expanded ? 70 : 0)));
      const descent = motion.expanded ? t * t : smooth(t);
      const scroll = (window.scrollY || 0) - motion.scroll;
      const catLine = motion.catFrom + (motion.toLine - motion.catFrom) * descent - scroll;
      // Closing lifts the cat with its platform: paws never lag below the line.
      catLift = motion.expanded ? stage.getBoundingClientRect().bottom - catLine : 0;
      pose = motion.expanded && elapsed > 70 ? 'falling' : 'scared';
      if (elapsed >= motion.duration) {
        catLift = 0;
        if (motion.expanded) {
          laneMotion = { kind: 'landing', start: now }; stage.dataset.lane = 'landing'; pose = 'scared';
        } else {
          laneMotion = {kind:'compact-settle',start:now};
          stage.dataset.lane = 'settling';
        }
      }
    } else if (motion.kind === 'compact-settle') {
      laneOffset = catLift = 0;
      pose = 'scared';
      progress = 1 - smooth(clamp((elapsed - 1700) / 300));
      if (elapsed >= 2000) {
        pendingCompactTension = false;
        resetLane();
        if (pet.dataset.interacting !== 'true') { stop(); return true; }
        beginWalkAway(now);
        return false;
      }
    } else if (motion.kind === 'rising') {
      const t = smooth(clamp(elapsed / 600));
      laneOffset = motion.from + (motion.target - motion.from) * t;
      catLift = motion.catFrom + (motion.target - motion.catFrom) * t;
      progress = clamp(elapsed / 220);
      if (elapsed >= 600) { laneMotion = { kind: 'raised', start: now }; stage.dataset.lane = 'raised'; }
    } else if (motion.kind === 'falling') {
      // The line falls first; the cat hesitates briefly, then drops under gravity.
      laneOffset = motion.from * (1 - clamp(elapsed / 430) ** 2);
      const fall = clamp((elapsed - 90) / 490);
      catLift = motion.catFrom * (1 - fall * fall);
      pose = elapsed < 90 ? 'scared' : 'falling';
      progress = fall;
      if (elapsed >= 580) {
        laneOffset = catLift = 0;
        laneMotion = { kind: 'landing', start: now }; stage.dataset.lane = 'landing';
        pose = 'scared';
      }
    } else if (motion.kind === 'landing') {
      progress = 1 - smooth(clamp(elapsed / 160));
      if (elapsed >= 160) { laneMotion = { kind: 'grooming', start: now, variant: Math.random() < .65 ? 'groom' : 'belly-groom' }; stage.dataset.lane = 'grooming'; }
    } else if (motion.kind === 'grooming') {
      pose = motion.variant || 'groom';
      progress = clamp(elapsed / 2400);
      // A few reassuring licks always precede the return to random activity.
      frame = Math.floor(elapsed / 75);
      if (elapsed >= 2400) {
        pendingLandingGroom = false;
        resetLane();
        if (pet.dataset.interacting !== 'true') { stop(); return true; }
        beginWalkAway(now);
        return false;
      }
    }
    // Position follows the DOM at display refresh rate; only pixel poses are throttled.
    stage.style.transform = `translate3d(0,${-laneOffset}px,0)`;
    canvas.style.transform = `translate3d(${currentX}px,${laneOffset - catLift}px,0) scaleX(${direction})`;
    if (now - lastPaint >= 1000 / 30) {
      lastPaint = now;
      paint(pose, frame, progress);
    }
    return true;
  }

  function stop() {
    resetGaze(true);
    nearAttention=false;
    visibilityPauseAt=null;
    featherPress=null;
    transportDriver?.cancel();
    poseHandoff=null;lastPose=null;liftOrigin=null;gaitBlend=0;gaitPaintAt=0;
    if (pet.dataset.dismissed === 'true') pendingLandingGroom = pendingCompactTension = false;
    turnMotion = null;
    resetLane();
    active = false;
    treat.hidden = true;
    playStarted = petStarted = tailStarted = null;
    pendingInput = null;
    pounceHeld = false;
    chargePointer = null;
    walkAway = null;
    cursorPoint = null;
    lastInteractionMove = -Infinity;
    featherFollowing = false;
    clearCursor();
    stroke = null;
    clearTimeout(petTimer);
    cancelAnimationFrame(frameRequest);
    clearTimeout(stillTimer);
    frameRequest = stillTimer = 0;
    stage.classList.remove('is-active');
    canvas.style.removeProperty('transform');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function tick(now) {
    frameRequest = 0;
    if (!active) return;
    if(document.hidden){suspendVisibility();return;}
    if (!stage.isConnected || !pet.isConnected) { stop(); return; }
    if (transportDriver?.tick(now)) { if (active && !frameRequest) frameRequest = requestAnimationFrame(tick); return; }
    if (reducedMotion.matches) { if (transportDriver?.isAway()) frameRequest = requestAnimationFrame(tick); return; }
    if (featherPress && !featherPress.charged) {
      if (now-featherPress.start < featherHoldDuration) {
        frameRequest=requestAnimationFrame(tick);return;
      }
      featherPress.charged=true;
      faceFeather(featherPress.event);
      const distance=Math.abs(featherTarget(featherPress.event,0)-currentX);
      if(distance>70) {
        featherPress.approaching=true;featherPress.lastTime=now;
        playStarted=petStarted=tailStarted=null;walkAway=null;pendingInput=null;
      } else startInput('pounce',featherPress.event,now);
    }
    // Reconcile after transport yields control as well as on hover events. An
    // event received during entry/drag must never leave a raised, empty lane.
    if (desktopLane.matches) {
      const raised = laneMotion && ['rising', 'raised'].includes(laneMotion.kind);
      if ((pet.dataset.lanePreview ?? pet.dataset.open) === 'true' && !raised) raiseLane();
      else if ((pet.dataset.lanePreview ?? pet.dataset.open) !== 'true' && raised) lowerLane();
    }
    if (tickPoseHandoff(now)) { frameRequest=requestAnimationFrame(tick);return; }
    if (tickLane(now)) { if (active) frameRequest = requestAnimationFrame(tick); return; }
    if (tickTurn(now)) { frameRequest = requestAnimationFrame(tick); return; }
    if (featherPress?.approaching) {
      const press=featherPress;
      faceFeather(press.event);
      if(turnMotion){press.lastTime=now;frameRequest=requestAnimationFrame(tick);return;}
      const target=featherTarget(press.event,0),delta=target-currentX;
      const dt=Math.max(0,Math.min(.05,(now-press.lastTime)/1000));press.lastTime=now;
      if(Math.abs(delta)>60) {
        currentX+=Math.sign(delta)*Math.min(Math.abs(delta)-60,30*pixelScale*dt);
        canvas.style.transform=`translate3d(${currentX}px,0,0) scaleX(${direction})`;
        paint('sprint',0);frameRequest=requestAnimationFrame(tick);return;
      }
      press.approaching=false;
      startInput('pounce',press.event,now);
    }
    if (pendingInput && !pounceHeld && playStarted !== null && playKind === 'pounce' && now - playStarted >= timing.pounce * pounceTiming.landing) {
      const input = pendingInput;
      pendingInput = null;
      currentX = playTarget;
      playStarted = null;
      canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${direction})`;
      startInput(input.kind, input.event, now);
    }
    if (tickNearAttention(now)) { frameRequest = requestAnimationFrame(tick); return; }
    if (tickFeatherFollow(now)) { frameRequest = requestAnimationFrame(tick); return; }
    if (walkAway !== null) {
      const elapsed = Math.max(0, now - walkAway.start);
      const progress = Math.min(1, elapsed / 3000);
      if (now - lastPaint >= 1000 / 60 - .5) {
        lastPaint = now;
        currentX = walkAway.from + (walkAway.to - walkAway.from) * progress;
        canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${direction})`;
        treat.hidden = true;
        paint('walk', Math.floor(elapsed / 110));
      }
      if (progress < 1) { frameRequest = requestAnimationFrame(tick); return; }
      currentX = walkAway.to;
      walkAway = null;
      if ((direction === 1 && currentX >= travel - .5) || (direction === -1 && currentX <= .5)) requestTurn(-direction, now);
      const along = travel ? (direction === 1 ? currentX / travel : 1 - currentX / travel) : 0;
      buildSequence(Math.max(0, Math.min(.999, along)));
      startedAt = now;
      lastPaint = -Infinity;
    }
    if (tailStarted !== null) {
      const elapsed = Math.max(0, now - tailStarted);
      if (elapsed < timing.tail) {
        if (now - lastPaint >= 1000 / 30) {
          lastPaint = now;
          treat.hidden = true;
          paint('tail-enjoy', 0, elapsed / timing.tail);
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
      if (elapsed < timing.pet) {
        if (now - lastPaint >= 1000 / 30) {
          lastPaint = now;
          treat.hidden = true;
          paint('pet', 0, elapsed / timing.pet);
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
      const rawElapsed = Math.max(0, now - playStarted);
      const playElapsed = pounceHeld ? Math.min(rawElapsed, timing.pounce * (pounceTiming.takeoff - .001)) : rawElapsed;
      const duration = timing[playKind];
      if (playElapsed < duration) {
        if (now - lastPaint >= 1000 / 30) {
          lastPaint = now;
          const progress = playElapsed / duration;
          const pose = pouncePose(progress);
          const forward = 1 - (1 - pose.flight) ** 2;
          const backstep = pounceBackstep;
          currentX = playKind === 'pounce'
            ? playOrigin + (playTarget - playOrigin) * forward - direction * backstep * pose.retreat : playOrigin;
          const jump = playKind === 'pounce' ? Math.sin(pose.flight * Math.PI) * 10 : 0;
          canvas.style.transform = `translate3d(${currentX}px,${-jump}px,0) scaleX(${direction})`;
          treat.hidden = true;
          paint(playKind, Math.floor(rawElapsed / 80), progress);
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
      if (pet.dataset.pinned !== 'true' && pet.dataset.interacting !== 'true') { dismiss(); return; }
      requestTurn(-direction, now);
      buildSequence();
      startedAt = now;
      elapsed = 0;
    }
    const poseRate = Math.hypot(gazeX,gazeY)>.001 || ['walk','sprint','chase','turn'].includes(lastPose?.kind) ? 60 : 30;
    if (now - lastPaint >= 1000 / poseRate - .5) {
      lastPaint = now;
      let phaseTime = elapsed;
      let phase = sequence[0];
      for (const candidate of sequence) {
        phase = candidate;
        if (phaseTime < phase.duration) break;
        phaseTime -= phase.duration;
      }
      if(phase.kind==='portal-hop') {
        phase.kind='idle'; // One attempt per stop, including when interaction blocks it.
        if(pet.dataset.pinned==='true' && transportDriver?.wander?.(now)) {
          if(!frameRequest)frameRequest=requestAnimationFrame(tick);
          return;
        }
      }
      const progress = Math.min(1, phaseTime / phase.duration);
      const moveProgress = travelProgress(progress, phase.kind === 'sprint' ? .14 : .08);
      const along = phase.from + (phase.to - phase.from) * moveProgress;
      const position = direction === 1 ? along : 1 - along;
      currentX = travel * position;
      canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${direction})`;
      paint(phase.kind, Math.floor(phaseTime / (phase.frameMs || 110)), progress);
    }
    frameRequest = requestAnimationFrame(tick);
  }

  function activate() {
    if (active) { transportDriver?.setVisible(true); return; }
    if (document.hidden || !stage.isConnected) return;
    const bounds = stage.getBoundingClientRect();
    if ((!bounds.width || !bounds.height || bounds.bottom < 0 || bounds.top > innerHeight) && pet.dataset.intro!=='pending') return;
    active = true;
    measure();
    stage.classList.add('is-active');
    direction = 1;
    currentX = lastGaitX = gaitDistance = 0;
    paint('walk', 0);
    if (pendingLandingGroom && !desktopLane.matches && !reducedMotion.matches) {
      laneMotion = {kind:'grooming',start:performance.now(),variant:Math.random()<.65?'groom':'belly-groom'};
      stage.dataset.lane = 'grooming';
    } else if (pendingCompactTension && !desktopLane.matches && !reducedMotion.matches) {
      laneMotion = {kind:'compact-settle',start:performance.now()};
      stage.dataset.lane = 'settling';
    }
    if (reducedMotion.matches) {
      canvas.style.transform = `translate3d(${Math.round(travel * .15)}px,0,0)`;
      stillTimer = setTimeout(() => { if (pet.dataset.interacting !== 'true') dismiss(); }, 1500);
      transportDriver?.appear();
      return;
    }
    direction = 1;
    buildSequence();
    startedAt = performance.now();
    lastPaint = -Infinity;
    frameRequest = requestAnimationFrame(tick);
    transportDriver?.appear();
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
      const speed = pixelScale * (kind === 'sprint' ? between(17, 20) : kind === 'chase' ? between(9, 11) : between(7, 9));
      sequence.push({
        kind, from: position, to: destination,
        duration: Math.max(250, (destination - position) * travel / speed * 1000)
      });
      position = destination;
    }
    for (let i = 0; i < stopCount; i++) {
      walkTo(startPosition + (1 - startPosition) * (i + between(.65, 1.25)) / (stopCount + 1));
      const choices = ['yawn', 'scratch', 'stretch', 'groom', 'belly-groom', 'portal-hop'].filter(kind => kind !== previousAction);
      const kind = choices[Math.floor(Math.random() * choices.length)];
      const duration = kind === 'stretch' ? between(3000, 3500) : (kind === 'groom' || kind === 'belly-groom') ? between(2400, 3000) : between(1800, 2800);
      sequence.push({ kind, duration, from: position, to: position, frameMs: between(90, 140) });
      previousAction = kind;
    }
    walkTo(1);
    sequence.push({ kind: 'idle', duration: 250, from: 1, to: 1 });
    totalDuration = sequence.reduce((sum, phase) => sum + phase.duration, 0);
  }

  function beginWalkAway(now) {
    stroke = null;
    clearCursor();
    let room = direction === 1 ? travel - currentX : currentX;
    if (room < Math.min(36, travel * .2)) { requestTurn(-direction, now); room = direction === 1 ? travel - currentX : currentX; }
    const distance = Math.min(room, 8 * pixelScale * 3);
    walkAway = { start: now, from: currentX, to: Math.max(0, Math.min(travel, currentX + direction * distance)) };
    lastPaint = -Infinity;
  }

  function clearCursor() {
    document.documentElement.classList.remove('cat-cursor-hand', 'cat-cursor-feather', 'cat-cursor-playing', 'cat-cursor-scruff');
    featherToy.hidden = true;
  }

  function onScruff(point, extra = 0) {
    return point && point.x >= headRegion.left - 4 - extra && point.x <= headRegion.left + 3 + extra &&
      point.y >= headRegion.top + 7 - extra && point.y <= headRegion.top + 15 + extra;
  }

  function cursorZone(point) {
    if (!point) return null;
    if (onScruff(point)) return 'scruff';
    if (point.x >= headRegion.left - 3 && point.x <= headRegion.right + 3 &&
        point.y >= headRegion.top - 5 && point.y <= headRegion.top + 16) return 'head';
    if (Math.abs(point.x - tailRoot.x) <= 6 && Math.abs(point.y - tailRoot.y) <= 7) return 'tail';
    if(point.x>=-5&&point.x<=45&&point.y>=-4&&point.y<=spriteHeight+4)return 'body';
    const lane=stage.getBoundingClientRect();
    const onLane=Number.isFinite(point.clientX)
      ? point.clientX>=lane.left && point.clientX<=lane.left+lane.width
      : (point.x>headRegion.right&&point.x<headRegion.right+66)||(point.x<0&&point.x>-66);
    if(onLane && point.y>=headRegion.top-12 && point.y<=headRegion.bottom+12)return 'front';
    return null;
  }

  function featherWithinReach(event) {
    const bounds = canvas.getBoundingClientRect();
    const gap = Math.max(bounds.left - event.clientX, event.clientX - (bounds.left + bounds.width), 0);
    return gap <= pixelScale * 14;
  }

  function showCursor(zone) {
    const touching=['head','tail','scruff','body'].includes(zone);
    const playing=zone==='front'&&(playStarted!==null||featherPress!==null);
    document.documentElement.classList.toggle('cat-cursor-scruff',zone==='scruff');
    document.documentElement.classList.toggle('cat-cursor-hand',touching);
    document.documentElement.classList.toggle('cat-cursor-feather',zone==='front'&&!playing);
    document.documentElement.classList.toggle('cat-cursor-playing',playing);
    featherToy.hidden=!playing;
  }

  function pointerOnSprite(event) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const x = (event.clientX - bounds.left) / bounds.width * 40;
    const facing = turnMotion && turnMotion.progress < .5 ? turnMotion.from : direction;
    return { clientX:event.clientX,x: facing === 1 ? x : 40 - x,
      y: (event.clientY - bounds.top) / bounds.height * spriteHeight };
  }

  function faceFeather(event) {
    const bounds = canvas.getBoundingClientRect();
    const nextDirection = event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
    requestTurn(nextDirection);
  }

  function featherTarget(event, gap = 8) {
    const stageLeft = stage.getBoundingClientRect().left;
    const width = canvas.getBoundingClientRect().width;
    const target = event.clientX - stageLeft - (direction === 1 ? width + gap : -gap);
    return Math.max(0, Math.min(travel, target));
  }

  function withinQuietReach(event,retain=nearAttention) {
    if(!event||event.target?.closest?.('a, button, summary, input, textarea, select, [contenteditable]'))return false;
    const r=canvas.getBoundingClientRect();
    const dx=Math.max(r.left-event.clientX,event.clientX-r.left-r.width,0);
    const dy=Math.max(r.top-event.clientY,event.clientY-r.top-r.height,0);
    return Math.hypot(dx,dy)<=pixelScale*(retain?29:20);
  }
  function tickNearAttention(now) {
    const eligible=!!gazePoint && !!cursorPoint && playStarted===null && petStarted===null && tailStarted===null &&
      !featherPress&&!pounceHeld&&(!laneMotion||laneMotion.kind==='raised')&&
      withinQuietReach(cursorPoint) && (!lastPose||['idle','walk','sprint','chase'].includes(lastPose.kind));
    if(!eligible) {
      if(nearAttention){
        nearAttention=false;
        const along=travel?(direction===1?currentX/travel:1-currentX/travel):0;
        buildSequence(Math.max(0,Math.min(.999,along)));startedAt=now;lastPaint=-Infinity;
      }
      return false;
    }
    if(!nearAttention) {
      nearAttention=true;nearLast=now;featherFollowing=false;walkAway=null;
      if(lastPose&&['walk','sprint','chase'].includes(lastPose.kind)) {
        poseHandoff={source:lastPose,start:now,last:now};stage.dataset.transition='settling';
        return true;
      }
    }
    startedAt+=Math.max(0,now-nearLast);nearLast=now;
    if(now-lastPaint>=1000/60-.5){lastPaint=now;paint('idle',0);}
    return true;
  }

  function endFeatherFollow(now) {
    if (!featherFollowing) return;
    featherFollowing = false;
    const along = travel ? (direction === 1 ? currentX / travel : 1 - currentX / travel) : 0;
    buildSequence(Math.max(0, Math.min(.999, along)));
    startedAt = now;
    lastPaint = -Infinity;
  }

  function tickFeatherFollow(now) {
    if (!featherFollowing || playStarted !== null || petStarted !== null || tailStarted !== null) return false;
    if(now-lastFeatherMotion>1100&&!featherPress&&!pounceHeld){endFeatherFollow(now);return false;}
    const point = cursorPoint && pointerOnSprite(cursorPoint);
    if (!point || cursorZone(point) !== 'front') { endFeatherFollow(now); return false; }
    faceFeather(cursorPoint);
    if (turnMotion) return true;
    const target = featherTarget(cursorPoint);
    const dt = Math.max(0, Math.min(.06, (now - followTime) / 1000));
    followTime = now;
    const delta = target - currentX;
    const speed=(8+22*easePose((Math.abs(delta)-25)/100))*pixelScale;
    const running=speed>19*pixelScale;
    const step = speed * dt;
    currentX += Math.sign(delta) * Math.min(Math.abs(delta), step);
    walkAway = null;
    if (now - lastPaint >= 1000 / 60 - .5) {
      lastPaint = now;
      canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${direction})`;
      paint(running?'sprint':'walk', 0);
    }
    return true;
  }

  function startInput(kind, event, now) {
    nearAttention=false;
    if (laneMotion && laneMotion.kind!=='raised') return;
    featherFollowing = false;
    const current = petStarted !== null ? 'pet' : tailStarted !== null ? 'tail-enjoy' : playStarted !== null ? playKind : null;
    stroke = null;
    // Continuing the same gesture never rewinds its animation.
    if (current === kind) return;
    if (!pounceHeld && playStarted !== null && playKind === 'pounce' && now - playStarted >= timing.pounce * pounceTiming.takeoff &&
        now - playStarted < timing.pounce * pounceTiming.landing) {
      // Finish the short airborne part before changing pose; keep only the latest intent.
      pendingInput = { kind, event: { clientX: event.clientX, clientY: event.clientY } };
      clearCursor();
      return;
    }
    pendingInput = null;
    pounceHeld = false;
    chargePointer = null;
    playStarted = petStarted = tailStarted = null;
    walkAway = null;
    clearTimeout(petTimer);
    clearCursor();
    canvas.style.transform = `translate3d(${currentX}px,0,0) scaleX(${direction})`;
    const point = pointerOnSprite(event);
    if (kind === 'pet' || kind === 'tail-enjoy') beginReaction(kind, now);
    else if (point) beginFeatherPlay(kind, event, point, now);
  }

  function beginReaction(kind, now) {
    stroke = null;
    if (playStarted !== null) { startedAt += now - playStarted; playStarted = null; }
    if (reducedMotion.matches) {
      paint(kind, 0, kind === 'tail-enjoy' ? .4 : 0);
      clearTimeout(petTimer);
      petTimer = setTimeout(() => {
        if (active) { paint('walk', 0); }
      }, 1800);
      return;
    }
    if (kind === 'pet') petStarted = now;
    else tailStarted = now;
    paint(kind, 0, 0);
    lastPaint = now;
  }

  function beginFeatherPlay(kind, event, point, now) {
    stroke = null;
    playKind = kind;
    pounceHeld = kind === 'pounce';
    chargePointer = pounceHeld ? event.pointerId : null;
    playOrigin = currentX;
    faceFeather(event);
    pounceBackstep = Math.min(3 * pixelScale, direction === 1 ? playOrigin : travel - playOrigin);
    const target = featherTarget(event, 0);
    playTarget = currentX + Math.sign(target - currentX) * Math.min(70, Math.abs(target - currentX));
    featherToy.style.left = `${event.clientX - 22}px`;
    featherToy.style.top = `${event.clientY - 9}px`;
    featherToy.hidden = false;
    document.documentElement.classList.add('cat-cursor-playing');
    playStarted = now;
    paint(kind, 0, 0);
    lastPaint = now;
  }

  // Human input can interrupt automatic movement, including the quiet walk-away.
  // Gestures reset at physical zone boundaries instead of retaining an old feather hit.
  document.addEventListener('pointermove', event => {
    if(event.pointerType==='mouse'||(event.pointerType==='pen'&&!event.buttons)){
      trackGazePoint(event.buttons?null:{clientX:event.clientX,clientY:event.clientY});
      if(active&&reducedMotion.matches&&!transportDriver?.blocksInput())paint('idle',0);
    }
    if (transportDriver?.blocksInput()) return;
    if (featherPress && event.pointerId===featherPress.pointerId) {
      if (!featherPress.charged && Math.hypot(event.clientX-featherPress.event.clientX,event.clientY-featherPress.event.clientY)>12) {
        featherPress=null;clearCursor();return;
      }
      if (featherPress.charged) featherPress.event={clientX:event.clientX,clientY:event.clientY,pointerId:event.pointerId};
    }
    if (!active || (event.pointerType !== 'mouse' && !((pounceHeld && event.pointerId===chargePointer)||(featherPress?.charged && event.pointerId===featherPress.pointerId)))) { clearCursor(); return; }
    const previousPoint = cursorPoint;
    cursorPoint = { clientX: event.clientX, clientY: event.clientY, target:event.target };
    if (!featherToy.hidden) {
      featherToy.style.left = `${event.clientX - 22}px`;
      featherToy.style.top = `${event.clientY - 9}px`;
    }
    const point = pointerOnSprite(event);
    if (!point) return;
    const now = performance.now();
    let zone = cursorZone(point);
    // Count nearby human movement, not an idle cursor or autonomous walking.
    if (zone && (zone !== 'front' || featherWithinReach(event)) &&
        (!previousPoint || Math.hypot(event.clientX-previousPoint.clientX,event.clientY-previousPoint.clientY)>=1)) {
      lastInteractionMove = now;
    }
    // Never carry a gesture across hand/feather boundaries. A body hit wins in
    // this same pointer event, including while an animated feather is active.
    if(event.target?.closest?.('a, button, summary, input, textarea, select, [contenteditable]'))zone=null;
    showCursor(zone);
    if (pounceHeld && zone==='front') {
      faceFeather(event);
      const target = featherTarget(event, 0);
      playTarget = playOrigin + Math.sign(target - playOrigin) * Math.min(70, Math.abs(target - playOrigin));
    } else if ((!laneMotion || laneMotion.kind==='raised') && !reducedMotion.matches && zone === 'front' && !event.buttons &&
        playStarted === null && petStarted === null && tailStarted === null && !withinQuietReach(cursorPoint)) {
      if (!featherFollowing) followTime = now;
      if(!previousPoint||Math.hypot(event.clientX-previousPoint.clientX,event.clientY-previousPoint.clientY)>=1)lastFeatherMotion=now;
      featherFollowing = true;
      faceFeather(event);
    } else if (featherFollowing && zone !== 'front') endFeatherFollow(now);
    if (event.buttons) { stroke = null; return; }
    if (zone === 'front' && !featherWithinReach(event)) { stroke = null; return; }
    if (!zone || zone === 'scruff' || zone === 'body') { stroke = null; return; }
    if (!stroke || stroke.zone !== zone || now - stroke.lastTime > 650 || now - stroke.time > 3200) {
      stroke = { zone, x: event.clientX, y: event.clientY, vector: null, turns: 0, segment: 0, travel: 0, time: now, lastTime: now };
      return;
    }
    stroke.lastTime = now;
    const dx = event.clientX - stroke.x, dy = event.clientY - stroke.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) return;
    const vector = [dx / distance, dy / distance];
    if (stroke.vector && vector[0] * stroke.vector[0] + vector[1] * stroke.vector[1] < -.35) {
      if(stroke.segment >= 4)stroke.turns++;
      stroke.segment=0;
    }
    stroke.segment+=distance;
    stroke.x = event.clientX;
    stroke.y = event.clientY;
    stroke.vector = vector;
    stroke.travel += distance;
    if (stroke.turns >= 5 && stroke.segment >= 4 && stroke.travel >= 24) {
      const kind = zone === 'head' ? 'pet' : zone === 'tail' ? 'tail-enjoy' : 'grab';
      if (!reducedMotion.matches || kind !== 'grab') startInput(kind, event, now);
    }
  }, { passive: true });

  document.addEventListener('pointerdown', event => {
    trackGazePoint(null);
    if (transportDriver?.blocksInput()) return;
    if (!active || reducedMotion.matches || !event.isPrimary || event.button !== 0) return;
    const point = pointerOnSprite(event);
    if (!point || cursorZone(point) !== 'front' || (laneMotion && laneMotion.kind!=='raised') ||
      event.target?.closest?.('a, button, summary, input, textarea, select, [contenteditable]')) return;
    event.preventDefault?.();
    endFeatherFollow(performance.now());stroke=null;
    lastInteractionMove=performance.now();
    featherPress={pointerId:event.pointerId,start:performance.now(),charged:false,
      event:{clientX:event.clientX,clientY:event.clientY,pointerId:event.pointerId}};
    cursorPoint=featherPress.event;
    featherToy.style.left=`${event.clientX-22}px`;featherToy.style.top=`${event.clientY-9}px`;
    featherToy.hidden=false;
    document.documentElement.classList.add('cat-cursor-playing');
  });
  function releaseCharge(event, cancelled = false) {
    if (featherPress && (!event || event.pointerId===featherPress.pointerId)) {
      const press=featherPress;
      featherPress=null;
      if(press.approaching){featherFollowing=false;clearCursor();beginWalkAway(performance.now());return;}
      if (!press.charged) {
        if (!cancelled && featherWithinReach(press.event)) startInput('grab',press.event,performance.now());
        else clearCursor();
        return;
      }
    }
    if (!pounceHeld || (event && event.pointerId !== chargePointer)) return;
    pounceHeld = false;
    chargePointer = null;
    const now = performance.now();
    if (cancelled) {
      playStarted = null;
      pendingInput = null;
      if (active) beginWalkAway(now);
    } else {
      // The user controls takeoff, even after a long hold or a quick tap.
      playStarted = now - timing.pounce * pounceTiming.takeoff;
      lastPaint = -Infinity;
    }
  }
  document.addEventListener('pointerup', event => releaseCharge(event));
  document.addEventListener('pointercancel', event => releaseCharge(event, true));
  document.addEventListener('contextmenu', event => {if(featherPress||pounceHeld)event.preventDefault();});
  document.addEventListener('pointerout', event => {
    if (!event.relatedTarget) { trackGazePoint(null);endFeatherFollow(performance.now()); releaseCharge(null, true); cursorPoint = null; clearCursor(); stroke = null; if(active&&reducedMotion.matches&&!transportDriver?.blocksInput())paint('idle',0); }
  });
  window.addEventListener('blur', () => { resetGaze(true);endFeatherFollow(performance.now()); releaseCharge(null, true); cursorPoint = null; clearCursor(); if(active&&reducedMotion.matches&&!transportDriver?.blocksInput())paint('idle',0); });

  stage.catTransport = {
    install(driver) { transportDriver = driver; if(active)driver.appear(); },
    hide: stop,
    presented() { if((pet.dataset.lanePreview??pet.dataset.open)==='true' && laneMotion?.kind!=='raised')raiseLane(); },
    homeLineY(baseY) {
      if(!desktopLane.matches || (pet.dataset.lanePreview??pet.dataset.open)!=='true')return baseY;
      const photo=document.querySelector('.pet-portrait').getBoundingClientRect();
      const contact=document.querySelector('.profile-contact').getBoundingClientRect();
      const desired=Math.min(photo.top-16,Math.max(contact.bottom+canvas.getBoundingClientRect().width*.7+16,photo.top-24));
      return Math.min(baseY,desired+(window.scrollY||0));
    },
    adoptHome(y) {
      if(!desktopLane.matches || (pet.dataset.lanePreview??pet.dataset.open)!=='true')return;
      laneOffset=catLift=Math.max(0,stage.getBoundingClientRect().bottom-(y-(window.scrollY||0)));
      laneMotion={kind:'raised',start:performance.now(),relaxed:true};
      stage.dataset.lane='raised';stage.style.transform=`translate3d(0,${-laneOffset}px,0)`;
    },
    active: () => active,
    backgroundCanFall(source) {
      if(!active||desktopLane.matches||reducedMotion.matches)return false;
      if(transportDriver)return transportDriver.backgroundCanFall?.(source)===true;
      const r=stage.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;
    },
    grounded: () => !laneMotion || !['rising','falling','background','landing'].includes(laneMotion.kind),
    interacting: (now = performance.now()) => active && (featherPress !== null || pounceHeld || pendingInput !== null ||
      playStarted !== null || petStarted !== null || tailStarted !== null || now-lastInteractionMove < 200),
    turnDuration: () => turnDuration,
    direction: () => turnMotion && turnMotion.progress < .5 ? turnMotion.from : direction,
    reduced: () => reducedMotion.matches,
    tapKind(event) {
      const zone=cursorZone(pointerOnSprite(event));
      return zone==='head'||zone==='scruff'?'pet':zone==='tail'?'tail-enjoy':null;
    },
    tap(kind,event) { if(kind)startInput(kind,event,performance.now()); },
    hitScruff(event) {
      return active && onScruff(pointerOnSprite(event),event.pointerType==='touch'?1.5:0);
    },
    canLift(event) {
      if(!active)return false;
      const point=pointerOnSprite(event);if(!point)return false;
      const radius=event.pointerType==='touch'?3:1;
      if(point.x < -radius || point.x > 40+radius || point.y < -radius || point.y > spriteHeight+radius)return false;
      if(!ctx.getImageData)return point.x>=3&&point.x<=40&&point.y>=2&&point.y<=spriteHeight;
      const x=Math.max(0,Math.floor(point.x)-radius),y=Math.max(0,Math.floor(point.y)-radius);
      const w=Math.min(40-x,radius*2+1),h=Math.min(spriteHeight-y,radius*2+1);
      if(w<=0||h<=0)return false;
      const data=ctx.getImageData(x*rasterScale,y*rasterScale,w*rasterScale,h*rasterScale).data;
      for(let i=3;i<data.length;i+=4)if(data[i]>40)return true;
      return false;
    },
    scruffPoint() {
      const r=canvas.getBoundingClientRect(),x=headRegion.left-.5,y=headRegion.top+10;
      const facing=turnMotion && turnMotion.progress<.5 ? turnMotion.from : direction;
      return {x:r.left+(facing===1?x:40-x)*r.width/40,y:r.top+y*r.height/spriteHeight};
    },
    platformLanded(expanded) {
      poseHandoff=null;lastPose=null;catLift=laneOffset=0;
      laneMotion={kind:expanded?'landing':'compact-settle',start:performance.now()};
      pendingLandingGroom=expanded;pendingCompactTension=!expanded;
      stage.dataset.lane=expanded?'landing':'settling';lastPaint=-Infinity;
    },
    prepareLift() { liftOrigin=lastPose?{...lastPose}:{kind:'idle',frame:0,progress:0,distance:0}; },
    lift(progress,frame=0) {
      if(spriteHeight!==40)setSpriteHeight(40);
      canvas.style.height=`${canvas.getBoundingClientRect().width}px`;
      ctx.clearRect(0,0,40,40);
      if(progress<.35)drawExit(liftOrigin||{kind:'idle',frame:0,progress:0,distance:0},progress/.35);
      else drawCarried(frame,(progress-.35)/.65);
      stage.dataset.action='carried';stage.dataset.transition=progress<1?'lifting':'held';
      lastPose={kind:'carried',frame,progress:Math.max(0,(progress-.35)/.65),distance:0};
    },
    settle(progress) {
      ctx.clearRect(0,0,canvas.width,canvas.height);drawExit(liftOrigin||{kind:'idle',frame:0,progress:0,distance:0},progress);
      stage.dataset.action='idle';stage.dataset.transition='settling';
    },
    lower(progress,amount=1,frame=0) {
      if(spriteHeight!==40)setSpriteHeight(40);
      canvas.style.height=`${canvas.getBoundingClientRect().width}px`;
      ctx.clearRect(0,0,canvas.width,canvas.height);drawCarried(frame,amount*(1-easePose(progress)));
      stage.dataset.action='falling';stage.dataset.transition='lowering';
      if(progress>=1)lastPose=null;
    },
    pause() {
      nearAttention=false;
      resetGaze();
      featherPress=null;
      poseHandoff=null;
      resetLane();turnMotion=null;playStarted=petStarted=tailStarted=null;
      pendingInput=walkAway=null;pounceHeld=false;chargePointer=null;
      featherFollowing=false;cursorPoint=null;stroke=null;clearCursor();treat.hidden=true;
      lastInteractionMove=-Infinity;
      if (active && !frameRequest) frameRequest=requestAnimationFrame(tick);
    },
    portalGesture,
    render(kind,frame=0,progress=0,distance=0,facing=direction) {
      const height = kind === 'carried' || kind === 'portal-open' ? 40 : 28;
      if (spriteHeight !== height) setSpriteHeight(height);
      if (height === 40) canvas.style.height=`${canvas.getBoundingClientRect().width}px`;
      else canvas.style.removeProperty('height');
      // Transport supplies travelled sprite pixels. Do not add the home lane's stale delta.
      direction=facing;gaitDistance=distance;lastGaitX=currentX;
      if(kind==='walk'||kind==='sprint')gaitBlend=kind==='sprint'?1:0;
      paint(kind,frame,progress);
    },
    resume(x, facing=direction) {
      if (spriteHeight !== 28) setSpriteHeight(28);
      canvas.style.removeProperty('height');delete stage.dataset.transition;
      measure();currentX=lastGaitX=Math.max(0,Math.min(travel,x));direction=facing;
      const along=travel?(direction===1?currentX/travel:1-currentX/travel):0;
      buildSequence(Math.max(0,Math.min(.999,along)));startedAt=performance.now();lastPaint=-Infinity;
      canvas.style.transform=`translate3d(${currentX}px,0,0) scaleX(${direction})`;
      paint('idle',0);
    }
  };

  document.querySelector('.background-details')?.addEventListener('backgroundmotionstart', beginBackgroundMotion);
  pet.addEventListener('catpreviewstart', activate);
  function dismiss() {
    if(active && transportDriver)transportDriver.setVisible(false);
    else stop();
  }
  pet.addEventListener('catpreviewend', dismiss);
  pet.addEventListener('catlaneraise', raiseLane);
  pet.addEventListener('catlanelower', lowerLane);
  window.addEventListener('resize', () => {
    if (laneMotion && ['rising', 'raised'].includes(laneMotion.kind)) raiseLane();
  });
  desktopLane.addEventListener('change', () => {
    if (laneMotion) { resetLane(); if (active) beginWalkAway(performance.now()); }
  });
  if (pet.dataset.interacting === 'true') activate();
  function suspendVisibility() {
    if(!active||visibilityPauseAt!==null)return;
    visibilityPauseAt=performance.now();
    cancelAnimationFrame(frameRequest);frameRequest=0;
    resetGaze(true);cursorPoint=null;stroke=null;clearCursor();
    transportDriver?.suspend?.();
  }
  function resumeVisibility() {
    if(visibilityPauseAt===null){if(pet.dataset.interacting==='true')activate();return;}
    const now=performance.now(),delta=now-visibilityPauseAt;
    const shift=t=>t===null?t:t+delta;
    startedAt+=delta;lastPaint+=delta;gaitPaintAt+=delta;followTime=now;
    playStarted=shift(playStarted);petStarted=shift(petStarted);tailStarted=shift(tailStarted);
    for(const motion of [laneMotion,walkAway,turnMotion,poseHandoff,featherPress])if(motion){
      for(const key of ['start','last','lastTick','lastTime'])if(Number.isFinite(motion[key]))motion[key]+=delta;
    }
    lastInteractionMove=-Infinity;visibilityPauseAt=null;
    transportDriver?.resumeVisibility?.(delta);
    if(active&&!frameRequest)frameRequest=requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendVisibility();else resumeVisibility();});
  window.addEventListener('pagehide',event=>{if(event.persisted)suspendVisibility();else stop();});
  window.addEventListener('pageshow',event=>{if(event.persisted)resumeVisibility();});
  reducedMotion.addEventListener('change', () => {
    stop();
    if (pet.dataset.interacting === 'true') activate();
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!active) return;
      if (!stage.getBoundingClientRect().width) stop();
      else if (!transportDriver?.blocksInput()) measure();
    }).observe(stage);
  } else {
    window.addEventListener('resize', () => { if (active) measure(); });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting && active && transportDriver) transportDriver.viewportChanged();
      else if (pet.dataset.interacting === 'true') activate();
    }).observe(stage);
  }
})();

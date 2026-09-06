(() => {
  const stage = document.querySelector('.cat-walk');
  const canvas = stage?.querySelector('canvas');
  const api = stage?.catTransport;
  if (!api) return;
  function decoration(className, parent=document.body) {
    const node=document.createElement('span');node.className=className;node.ariaHidden='true';parent.append(node);return node;
  }
  const about=stage.parentElement;
  let occupiedLine=null;
  function reserveLine(item) {
    const next=item&&item.id!=='home'?item.element:null;
    if(occupiedLine===next)return;
    if(occupiedLine)delete occupiedLine.dataset.catOccupied;
    occupiedLine=next;
    if(occupiedLine)occupiedLine.dataset.catOccupied='true';
  }
  function homeVacant(value) { about.dataset.catVacant=String(value); }
  const home=decoration('cat-home-anchor',stage.parentElement);
  const guide=decoration('cat-drop-guide');guide.hidden=true;
  const hint=decoration('cat-scruff-hint');hint.hidden=true;
  const hole=decoration('cat-return-hole');hole.hidden=true;
  const portalCanvas=document.createElement('canvas');
  portalCanvas.className='cat-portal-sparks';portalCanvas.width=portalCanvas.height=200;
  portalCanvas.ariaHidden='true';portalCanvas.hidden=true;document.body.append(portalCanvas);
  const portalInk=portalCanvas.getContext?.('2d');
  const portalBack=document.createElement('canvas');
  portalBack.className='cat-portal-sparks cat-portal-sparks-back';
  portalBack.width=portalBack.height=200;portalBack.ariaHidden='true';portalBack.hidden=true;
  document.body.append(portalBack);
  const portalBackInk=portalBack.getContext?.('2d');
  const portalTiming={settle:180,trace:1250,walk:5600,close:320,open:550};
  const portalExit=portalTiming.settle+portalTiming.trace+portalTiming.walk+portalTiming.close;
  const desktop=matchMedia('(min-width: 1100px)');
  const sx=()=>window.scrollX||0, sy=()=>window.scrollY||0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=p=>p*p*(3-2*p);
  const width=()=>canvas.offsetWidth || canvas.getBoundingClientRect().width;
  const holdDuration=180;
  const introCard=document.querySelector('.pet-card');
  const introButton=introCard?.querySelector?.('.pet-toggle');
  let introStarted=null;
  let portalWanted=true;
  const wanderCooldown=20000;
  let nextWanderAt=performance.now()+wanderCooldown;
  let homeRule=null;
  let state=null,holdTimer=0,lastTick=0,releasingCapture=false,lastHover=null;
  let viewportDirty=false,layoutFollowUntil=0,scrollResumeAt=0;
  const sectionIds=['projects','publications','news'];
  let selectedSection=sectionIds.find(id=>window.location?.hash===`#${id}`&&document.getElementById(id)?.open)||null;
  let fallbackAt=0,selectionReadyAt=0,selectionVersion=0,hoverProtectedUntil=0;
  let stageScroll={x:sx(),y:sy()},portalScroll={x:sx(),y:sy()};
  function lineRect(element,edge='top') {
    if(!element?.isConnected)return null;
    const r=element.getBoundingClientRect();
    return r.width<56?null:{left:r.left+sx(),y:(edge==='bottom'?r.bottom:r.top)+sy(),width:r.width};
  }
  const homeRect=()=>{
    const r=lineRect(home);if(!r)return null;
    const desired=(api.homeLineY?.(r.y)??r.y)-r.y,now=performance.now();
    if(!state||!desktop.matches||!homeRule)homeRule={offset:desired,target:desired};
    else {
      if(Math.abs(desired-homeRule.target)>.1)homeRule={offset:homeRule.offset,from:homeRule.offset,target:desired,start:now,duration:desired>homeRule.offset?430:300};
      if(homeRule.start!==undefined){
        const p=clamp((now-homeRule.start)/homeRule.duration,0,1);
        homeRule.offset=homeRule.from+(homeRule.target-homeRule.from)*(homeRule.target>homeRule.from?p*p:smooth(p));
      }
    }
    home.style.setProperty?.('--cat-home-rule-offset',`${homeRule.offset}px`);
    return {...r,y:r.y+homeRule.offset};
  };
  function targets() {
    const items=[{id:'home',element:home},
      {id:'background',element:document.getElementById('projects')},
      {id:'projects',element:document.getElementById('publications')},
      {id:'publications',element:document.getElementById('news')},
      {id:'news',element:document.querySelector('footer')},
      {id:'header',element:document.querySelector('.topbar'),edge:'bottom'}];
    if(!desktop.matches)items.push({id:'profile',element:document.querySelector('.sidebar'),edge:'bottom'});
    const result=[];
    for(const item of items){
      const rect=lineRect(item.element,item.edge);
      if(!rect)continue; // Keep semantic identities even while two animated borders overlap.
      result.push({...item,rect});
    }
    return result;
  }
  const currentLine=item=>item.id==='home'?homeRect():lineRect(item.element,item.edge);
  function visibleLine(r) {
    const nav=document.querySelector('.topbar')?.getBoundingClientRect();
    const top=Math.max(0,nav?.bottom||0)+width()*.7;
    return !!r && r.y-sy()>=top && r.y-sy()<=innerHeight-8;
  }
  const standingTarget=()=>state?.mode==='parked'?state.target:!state?{id:'home',element:home}:null;
  function residentVisible(r) {
    const nav=document.querySelector('.topbar')?.getBoundingClientRect();
    return !!r&&r.y-sy()>Math.max(0,nav?.bottom||0)&&r.y-sy()-width()<innerHeight;
  }
  function viewportTarget() {
    const current=standingTarget();
    if(selectedSection) {
      const target=targets().find(item=>item.id===selectedSection);
      // Residence survives visibility changes. Only a different, usable destination moves it.
      if(target&&(current?.element===target.element||visibleLine(currentLine(target))))return target;
      return current;
    }
    if(performance.now()<fallbackAt)return current;
    if((current?.id==='home'&&residentVisible(homeRect()))||visibleLine(homeRect()))return {id:'home',element:home};
    if(current&&residentVisible(currentLine(current)))return current;
    return targets().filter(item=>!['header','profile'].includes(item.id)&&(!desktop.matches||item.id!=='home'))
      .map(item=>({...item,rect:currentLine(item)})).filter(item=>visibleLine(item.rect))
      .sort((a,b)=>b.rect.y-a.rect.y)[0]||current;
  }
  function protectInteraction(now) { return now<hoverProtectedUntil||api.interacting?.(now); }
  function waitForViewport() {
    clearDecorations();reserveLine(null);homeVacant(true);api.pause();
    state={mode:'viewport-wait'};
    canvas.style.opacity='0';canvas.style.pointerEvents='none';
  }
  function resident(target) {
    return target.id==='home'?null:{mode:'parked',target,deadline:Infinity,viewportFollow:true};
  }
  function enterViewport(target,now) {
    clearDecorations();reserveLine(null);api.pause();
    state={mode:'entering',start:now,viewportTransfer:true,selectionVersion,entryFraction:Math.random(),
      excursion:{target,parked:resident(target)}};
    canvas.style.opacity='0';canvas.style.pointerEvents='none';
  }
  function portalTo(target,now,follow=false) {
    const origin=currentLine(state?.target||{id:'home',element:home});
    if(follow&&!residentVisible(origin)){enterViewport(target,now);return;}
    returnHome(now);
    // A transported sprite may still have its previous frame's screen position
    // immediately after scrolling. Anchor departure to the real document line.
    if(origin)state.from.y=origin.y+width()*.025;
    state.excursion={target,parked:resident(target),fraction:.2+Math.random()*.6};
    if(follow){state.viewportTransfer=true;state.selectionVersion=selectionVersion;}
  }
  function rebaseLayers() {
    if(state&&['arming','dragging','intro','prank'].includes(state.mode))return;
    if(state?.mode==='parked') {
      const r=currentLine(state.target);if(r)setLine(r);
    } else if(state&&stage.dataset.transported==='true') {
      for(const [key,delta] of [['left',stageScroll.x-sx()],['top',stageScroll.y-sy()]]){
        const value=parseFloat(stage.style[key]);if(Number.isFinite(value))stage.style[key]=`${value+delta}px`;
      }
      stageScroll={x:sx(),y:sy()};
    }
    for(const node of [hole,portalCanvas,portalBack])for(const [key,delta] of [['left',portalScroll.x-sx()],['top',portalScroll.y-sy()]]){
      const value=parseFloat(node.style[key]);if(Number.isFinite(value))node.style[key]=`${value+delta}px`;
    }
    portalScroll={x:sx(),y:sy()};
  }
  function viewportChanged() {
    viewportDirty=true;
    // Reposition existing pixels with their document anchors, without destroying residence.
    rebaseLayers();
  }
  function followViewport(now) {
    if(!portalWanted||!api.active()||state?.platformMotion||!viewportDirty)return;
    const transferring=state&&['entering','returning'].includes(state.mode);
    if(state&&state.mode!=='parked'&&state.mode!=='viewport-wait'&&!transferring)return;
    if(protectInteraction(now))return;
    if(transferring) {
      // Once paws have emerged, finish landing before handling another selection.
      // The portal renderer can update a stale destination only while fully inside.
      if(state.selectionVersion!==selectionVersion)viewportDirty=true;
      return;
    }
    const target=viewportTarget(),current=standingTarget();
    if(current&&current.element===target?.element){
      viewportDirty=now<selectionReadyAt||now<fallbackAt;
      return;
    }
    if(now<Math.max(selectionReadyAt,scrollResumeAt)){viewportDirty=true;return;}
    // A manual placement owns its existing grace period, even if layout changes.
    if(state?.mode==='parked'&&!state.viewportFollow&&now<state.deadline)return;
    if(!target||!visibleLine(currentLine(target))) {viewportDirty=false;return;}
    viewportDirty=false;
    if(current)portalTo(target,now,true);else enterViewport(target,now);
  }

  function nearbyControl(point) {
    const buttons=['theme-toggle','language-toggle'].map(id=>document.getElementById(id)).filter(Boolean);
    const nearest=buttons.map(control=>{const r=control.getBoundingClientRect();return {control,r,
      distance:Math.hypot(point.x-r.left-r.width/2,point.y-r.top-r.height/2)};})
      .filter(item=>item.r.width>0&&item.r.bottom>0&&item.r.top<innerHeight&&item.distance<=100)
      .sort((a,b)=>a.distance-b.distance)[0];
    if(!nearest)return null;
    const element=document.querySelector('.topbar');
    return {id:'header',element,edge:'bottom',control:nearest.control};
  }
  function nearest(point) {
    const control=nearbyControl(point);if(control)return control;
    const feet=point.y+width()*.8+sy(),x=point.x+sx();
    return targets().filter(item=>x>=item.rect.left-30&&x<=item.rect.left+item.rect.width+30&&item.rect.y>=feet-4)
      .sort((a,b)=>a.rect.y-b.rect.y)[0]||null;
  }
  function showGuide(item) {
    const r=item&&currentLine(item);guide.hidden=!r;if(!r)return;
    Object.assign(guide.style,{left:`${r.left-sx()}px`,top:`${r.y-sy()-1}px`,width:`${r.width}px`});
  }
  function showHint(point,progress=0) {
    hint.hidden=false;
    Object.assign(hint.style,{left:`${point.x}px`,top:`${point.y}px`,background:`conic-gradient(#dda16d ${progress*360}deg,transparent 0)`});
  }
  function externalBox(left,top,w,h) {
    stageScroll={x:sx(),y:sy()};stage.style.removeProperty('clip-path');
    Object.assign(stage.style,{position:'fixed',insetInline:'auto',right:'auto',bottom:'auto',left:`${left-sx()}px`,top:`${top-sy()}px`,width:`${w}px`,height:`${h}px`,transform:'none'});
    stage.dataset.transported='true';home.dataset.away='true';
  }
  function setLine(r) {
    const w=width();externalBox(r.left,r.y-w*.7,r.width,w*.7);canvas.style.removeProperty('bottom');
    canvas.style.opacity=residentVisible(r)?'1':'0';
    const nav=document.querySelector('.topbar')?.getBoundingClientRect();
    const crop=Math.max(0,(nav?.bottom||0)-(r.y-sy()-w*.7));
    stage.style.clipPath=`inset(${crop}px -120px -120px -120px)`;
  }
  function floatCat(left,bottom,kind,frame=0,progress=0,distance=0,facing=1) {
    const w=width(),h=kind==='carried'||kind==='portal-open'?w:w*.7;
    externalBox(left,bottom-h,w,h);canvas.style.bottom='0';canvas.style.transform=`scaleX(${facing})`;
    api.render(kind,frame,progress,distance,facing);
  }
  function clearDecorations() {
    guide.hidden=hint.hidden=hole.hidden=portalCanvas.hidden=portalBack.hidden=true;
    stage.style.removeProperty('clip-path');
    canvas.style.pointerEvents='auto';
    document.documentElement.classList.remove('cat-carrying','cat-handling');
    canvas.style.removeProperty('clip-path');canvas.style.removeProperty('opacity');
    canvas.style.removeProperty('transform-origin');
  }
  function restoreHome(x=null,facing=api.direction()) {
    clearDecorations();reserveLine(null);homeVacant(false);
    for(const p of ['position','inset-inline','right','bottom','left','top','width','height','transform'])stage.style.removeProperty(p);
    delete stage.dataset.transported;delete home.dataset.away;
    canvas.style.removeProperty('bottom');canvas.style.removeProperty('height');
    const r=homeRect();api.resume(x===null?Math.max(0,(r?.width||width())/2-width()/2):x,facing);
    if(r)api.adoptHome?.(r.y);
  }
  function releaseCapture(id) {
    releasingCapture=true;
    if(id!==undefined&&canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
    releasingCapture=false;
  }
  function cancel() {
    const wasIntro=state?.mode==='intro';
    clearTimeout(holdTimer);holdTimer=0;
    if(!state){clearDecorations();return;}
    restorePrank(state);
    const id=state.pointerId;state=null;releaseCapture(id);restoreHome();
    if(wasIntro){introCard.dispatchEvent(new Event('catintrocancel'));if(introCard.dataset.pinned!=='true')api.hide();}
    if(!portalWanted)api.hide();
  }
  function restoreOrigin(held) {
    clearDecorations();
    const previous=held.previous;
    if(previous?.mode==='parked') {
      const r=currentLine(previous.target);
      if(r){reserveLine(previous.target);homeVacant(true);state={...previous,interacting:false,returnDelay:5000,deadline:previous.viewportFollow?Infinity:performance.now()+5000};setLine(r);api.resume(clamp(held.from.left-r.left,0,r.width-width()),held.facing);return;}
    }
    state=null;const r=homeRect();restoreHome(r?held.from.left-r.left:null,held.facing);
  }
  function returnHome(now,mode='returning') {
    const r=canvas.getBoundingClientRect(),facing=api.direction();
    api.prepareLift();api.pause();clearDecorations();
    state={mode,start:now,from:{x:r.left+sx(),y:r.bottom+sy()},facing};
    canvas.style.pointerEvents='none';
  }
  function wander(now=performance.now()) {
    if(now<nextWanderAt||!portalWanted||api.reduced()||api.interacting?.(now)||
      (state&&state.mode!=='parked')||state?.platformMotion)return false;
    const parked=state?{...state}:null,target=parked?.target||{id:'home',element:home};
    const r=currentLine(target),w=width();if(!visibleLine(r)||r.width<w*1.6||protectInteraction(now)||viewportDirty)return false;
    const here=canvas.getBoundingClientRect().left+sx()-r.left;
    const fraction=here>(r.width-w)/2?.12+Math.random()*.18:.7+Math.random()*.18;
    returnHome(now);
    state.excursion={target,parked,fraction,sameLine:true};
    nextWanderAt=now+wanderCooldown;
    return true;
  }
  function finishArrival(r,goalX,now) {
    const excursion=state?.excursion,elapsed=now-(state?.start||now);
    viewportDirty=true;
    nextWanderAt=Math.max(nextWanderAt,now+wanderCooldown);
    if(excursion?.parked) {
      clearDecorations();reserveLine(excursion.target);homeVacant(true);
      state={...excursion.parked,deadline:excursion.parked.deadline+elapsed};
      setLine(r);api.resume(goalX-r.left,1);
    } else {state=null;restoreHome(goalX-r.left,1);}
  }
  function finishDrop(now) {
    viewportDirty=false;
    const item=state.target,r=currentLine(item),facing=state.facing,returnTarget=state.returnTarget||{id:'home',element:home};
    if(!r){returnHome(now);return;}
    const x=clamp(state.dropX-r.left,0,Math.max(0,r.width-width()));
    clearDecorations();
    if(item.id==='home'&&returnTarget.id==='home'){state=null;restoreHome(x,facing);if(!portalWanted)returnHome(now,'exiting');return;}
    // Restore the lane and sprite transform in the same frame: no left-edge flash.
    const sameOrigin=item.element===returnTarget.element;
    state={mode:'parked',target:item,returnTarget,viewportFollow:sameOrigin,deadline:sameOrigin?Infinity:now+10000};setLine(r);api.resume(x,facing);
    if(!portalWanted)returnHome(now,'exiting');
    else if(item.control)beginPrank(item,now);
  }
  function release(event,cancelled=false) {
    if(!state||state.pointerId!==event.pointerId||!['arming','dragging'].includes(state.mode))return;
    clearTimeout(holdTimer);holdTimer=0;releaseCapture(event.pointerId);hint.hidden=true;
    if(state.mode==='arming'){
      const held=state;restoreOrigin(held);
      if(!cancelled&&held.tapKind)api.tap?.(held.tapKind,held.point);
      return;
    }
    const held=state;
    const target=(!cancelled&&nearest(held.point))||held.previous?.target||{id:'home',element:home};
    const r=currentLine(target);if(!r){returnHome(performance.now());return;}
    const sprite=canvas.getBoundingClientRect();
    clearDecorations();
    reserveLine(target);homeVacant(target.id!=='home');
    state={mode:'landing',duration:clamp(Math.sqrt(Math.max(0,r.y-sprite.bottom-sy())*1000),320,600),target,returnTarget:held.previous?.target||{id:'home',element:home},dropX:clamp(sprite.left+sx(),r.left,r.left+r.width-width()),
      from:{x:sprite.left+sx(),y:sprite.bottom+sy(),top:sprite.top+sy()},amount:Math.max(0,((held.liftProgress||0)-.35)/.65),start:performance.now(),facing:held.facing};
    api.pause();
    // Moving the cat never opens or closes the content belonging to a separator.
  }
  const controlValue=control=>control.id==='theme-toggle'?document.documentElement.dataset.theme:document.documentElement.lang;
  function restorePrank(prank) {
    if(prank?.mode!=='prank')return;
    delete prank.target.control.dataset.catPoked;
    if(prank.pressed && !prank.restored && prank.restoreAllowed && controlValue(prank.target.control)===prank.changed) {
      prank.restored=true;prank.target.control.click();
    }
  }
  function beginPrank(target,now) {
    const returnTarget=state?.returnTarget;
    const cat=canvas.getBoundingClientRect(),button=target.control.getBoundingClientRect(),w=width();
    const center=button.left+button.width/2+sx(),fromX=cat.left+sx();
    const facing=center>=fromX+w/2?1:-1,goal=center-w*(facing===1?.73:.27);
    const walkFacing=Math.sign(goal-fromX)||facing,oldFacing=api.direction();
    api.pause();
    state={mode:'prank',target,returnTarget,start:now,fromX,goal,facing,walkFacing,oldFacing,
      turnIn:api.reduced()||oldFacing===walkFacing?0:(api.turnDuration?.()||720),turnOut:api.reduced()||walkFacing===facing?0:(api.turnDuration?.()||720),
      walkDuration:api.reduced()?0:Math.max(120,Math.abs(goal-fromX)/40*1000),restoreAllowed:true};
    canvas.style.pointerEvents='none';
  }
  function tickPrank(now) {
    const prank=state,r=currentLine(prank.target);if(!r){restorePrank(prank);returnHome(now);return;}
    const w=width(),elapsed=Math.max(0,now-prank.start),floor=r.y+w*.025;
    if(elapsed<prank.turnIn){
      const p=elapsed/prank.turnIn;
      floatCat(prank.fromX,floor,'turn',0,p,0,p<.5?prank.oldFacing:prank.walkFacing);return;
    }
    const walking=elapsed-prank.turnIn;
    if(walking<prank.walkDuration){
      const p=smooth(walking/prank.walkDuration),x=prank.fromX+(prank.goal-prank.fromX)*p;
      floatCat(x,floor,'walk',0,0,Math.abs(x-prank.fromX)/(w/40),prank.walkFacing);return;
    }
    const turning=walking-prank.walkDuration;
    if(turning<prank.turnOut){
      const p=turning/prank.turnOut;
      floatCat(prank.goal,floor,'turn',0,p,0,p<.5?prank.walkFacing:prank.facing);return;
    }
    const action=turning-prank.turnOut,control=prank.target.control;
    const tap=action<700?action:action>=2500&&action<3200?action-2500:null;
    floatCat(prank.goal,floor,tap===null?'idle':'button-tap',0,tap===null?0:api.reduced()?.5:tap/700,0,prank.facing);
    if(tap!==null&&tap>=280&&tap<=480)control.dataset.catPoked='true';else delete control.dataset.catPoked;
    if(action>=350&&!prank.pressed){
      prank.original=controlValue(control);prank.pressed=true;control.click();prank.changed=controlValue(control);
    }
    if(action>=2850)restorePrank(prank);
    if(action>=3200){
      clearDecorations();state={mode:'parked',target:prank.target,returnTarget:prank.returnTarget,deadline:now+10000};
      setLine(r);api.resume(clamp(prank.goal-r.left,0,r.width-w),prank.facing);
    }
  }
  // A reader's explicit choice takes precedence over the cat's temporary joke.
  document.addEventListener('click',event=>{
    if(state?.mode==='prank'&&event.isTrusted&&event.target.closest?.('button')===state.target.control)state.restoreAllowed=false;
  },true);
  // Deterministic, bounded particles: motion comes from tangential velocity,
  // cooling and gravity. Batched strokes keep the dense spark shower inexpensive.
  const portalNoise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  const portalSparks=Array.from({length:760},(_,i)=>({
    theta:portalNoise(i+1)*Math.PI*2,offset:portalNoise(i+1001),
    life:.18+portalNoise(i+2001)*.35,speed:40+portalNoise(i+3001)*85,
    outward:5+portalNoise(i+4001)*32,radius:47.5+portalNoise(i+5001)*4,
    trail:.018+portalNoise(i+6001)*.045+(i%13===0?.045:0),tint:i%3
  }));
  function paintPortal(progress,seconds,fade=1,startAngle=-Math.PI/2,traceFacing=1) {
    const ink=portalInk;if(!ink?.arc)return;
    ink.clearRect(0,0,200,200);if(progress<=0||fade<=0)return;
    const full=Math.PI*2,angle=startAngle,end=angle+full*progress,spin=seconds*3.8;
    const groups=Array.from({length:12},()=>[]);
    ink.save();if(traceFacing<0){ink.translate(200,0);ink.scale(-1,1);}ink.lineCap='round';
    if(ink.createRadialGradient) {
      const aura=ink.createRadialGradient(100,100,39,100,100,76);
      aura.addColorStop(0,'#ff9b2000');aura.addColorStop(.33,'#ff8a231c');aura.addColorStop(1,'#ff6c1400');
      ink.fillStyle=aura;ink.globalAlpha=fade*progress;
      ink.fillRect(20,20,160,160);
    }
    // Hundreds of short, irregular filaments form the rim. There is no solid
    // neon outline underneath them; the luminous contour is made of moving sparks.
    ink.globalCompositeOperation='lighter';ink.shadowColor='#ffad47';ink.shadowBlur=2.5;
    for(let layer=0;layer<3;layer++) {
      ink.beginPath();
      for(let i=0;i<100;i++) {
        const seed=i+layer*101,a=((i/100*full+spin+portalNoise(seed)*.065)%full+full)%full;
        if(a>full*progress)continue;
        const r=47.5+portalNoise(seed+701)*6+Math.sin(a*3-spin)*.75;
        const length=.04+portalNoise(seed+902)*.25;
        ink.moveTo(100+Math.cos(a+angle)*r,100+Math.sin(a+angle)*r);
        ink.arc(100,100,r,a+angle,angle+Math.min(full*progress,a+length));
      }
      ink.strokeStyle=['#ff8225','#ffd077','#fff2c2'][layer];
      ink.globalAlpha=[.28,.55,.7][layer]*fade;
      ink.lineWidth=[2.7,1.15,.65][layer];ink.stroke();
    }
    ink.shadowBlur=0;
    for(let i=0;i<portalSparks.length;i++) {
      const spark=portalSparks[i],age=(seconds+spark.offset*spark.life)%spark.life,born=seconds-age;
      if(born<0)continue;
      // The tracing tip throws sparks until the circle closes. Afterwards the
      // entire rim continuously emits, with three broad rotating concentrations.
      const a=progress<.999?end-age*6:angle+spark.theta+born*3.8;
      if(progress<.999&&a<angle)continue;
      const heat=.45+.55*((Math.cos((a-angle-spin)*3)+1)/2)**3;
      const velocity=spark.speed*(.7+heat*.45);
      const dx=-Math.sin(a)*velocity+Math.cos(a)*spark.outward;
      const dy=Math.cos(a)*velocity+Math.sin(a)*spark.outward;
      const at=t=>[100+Math.cos(a)*spark.radius+dx*t,100+Math.sin(a)*spark.radius+dy*t+38*t*t];
      const head=at(age),tail=at(Math.max(0,age-spark.trail));
      const alpha=(1-age/spark.life)**.6*heat;
      const band=Math.min(3,Math.floor(alpha*4));
      groups[band*3+spark.tint].push([tail[0],tail[1],head[0],head[1]]);
    }
    for(let g=0;g<groups.length;g++) {
      ink.beginPath();for(const [x,y,tx,ty] of groups[g]){ink.moveTo(x,y);ink.lineTo(tx,ty);}
      ink.strokeStyle=['#ff8729','#ffd58b','#fff4ce'][g%3];
      ink.globalAlpha=(.16+Math.floor(g/3)*.21)*fade;
      ink.lineWidth=g%3===2?.7:1.05;ink.stroke();
    }
    if(progress<1) {
      ink.globalAlpha=fade;ink.fillStyle='#fff5c9';
      ink.beginPath();ink.arc(100+49*Math.cos(end),100+49*Math.sin(end),2,0,full);ink.fill();
    }
    ink.restore();
  }
  function showHole(x,y,progress,seconds=0,fade=1,frontRight=true,startAngle=-Math.PI/2,traceFacing=1,size=1) {
    portalScroll={x:sx(),y:sy()};
    const w=width()*size;hole.hidden=false;
    Object.assign(hole.style,{left:`${x-sx()}px`,top:`${y-sy()}px`,width:`${w*.5}px`,height:`${w*.92}px`,transform:'translate(-50%,-100%)'});
    hole.style.setProperty?.('--cat-portal-aperture',String(smooth(clamp((progress-.35)/.65,0,1))*fade));
    portalCanvas.hidden=false;
    Object.assign(portalCanvas.style,{left:`${x-sx()-w*.5}px`,top:`${y-sy()-w*1.38}px`,width:`${w}px`,height:`${w*1.84}px`});
    paintPortal(progress,seconds,fade,startAngle,traceFacing);
    // Split one rendered ring into complementary near/far halves. The cat
    // crosses BETWEEN them: never behind the entire halo on its way out.
    portalBack.hidden=false;
    Object.assign(portalBack.style,{left:portalCanvas.style.left,top:portalCanvas.style.top,
      width:portalCanvas.style.width,height:portalCanvas.style.height});
    portalCanvas.style.clipPath=frontRight?'inset(0 0 0 50%)':'inset(0 50% 0 0)';
    portalBack.style.clipPath=frontRight?'inset(0 50% 0 0)':'inset(0 0 0 50%)';
    if(portalBackInk?.drawImage) {
      portalBackInk.clearRect(0,0,200,200);
      portalBackInk.drawImage(portalCanvas,0,0);
    }
  }
  function portalOcclusion(left,feet,holeX,holeY,facing,emerging=false) {
    const w=width(),cx=(facing===1?(holeX-left)/w:1-(holeX-left)/w)*40;
    const cy=((holeY-feet)/w+.24)*40,rx=10,ry=18.4;
    // Follow the curved rear lip of the aperture, not a vertical clipping plane.
    // Body size and stride stay unchanged throughout the crossing.
    const points=[];
    for(let y=0;y<=28;y++) {
      const arc=rx*Math.sqrt(Math.max(0,1-((y-cy)/ry)**2));
      const edge=cx+(emerging?-arc:arc);
      points.push(`${edge/40*100}% ${y/28*100}%`);
    }
    canvas.style.clipPath=emerging
      ?`polygon(100% 0,${points.join(',')},100% 100%)`
      :`polygon(0 0,${points.join(',')},0 100%)`;
    canvas.style.opacity='1';
  }
  function finishHidden() {
    state=null;restoreHome();homeVacant(true);api.hide();
  }
  function appear() {
    portalWanted=true;viewportDirty=false;layoutFollowUntil=0;scrollResumeAt=0;
    restoreHome();homeVacant(true);api.pause();
    if(introCard?.dataset.intro==='pending' && introStarted!==introCard.dataset.introSequence && introButton) {
      introStarted=introCard.dataset.introSequence;
      if(!api.reduced()) {
        state={mode:'intro',start:performance.now()};
        canvas.style.pointerEvents='none';tickIntro(state.start);return;
      }
      introCard.dispatchEvent(new Event('catintroenable'));
    }
    state={mode:'entering',start:performance.now(),entryFraction:Math.random()};
    const target=selectedSection?viewportTarget():visibleLine(homeRect())?{id:'home',element:home}:viewportTarget();
    if(!target){waitForViewport();return;}
    if(target.id!=='home'){state.excursion={target,parked:resident(target)};state.viewportTransfer=true;}
    canvas.style.pointerEvents='none';
    // Establish the clipped first frame before the browser can paint the sprite.
    tickPortal(state.start);
  }
  function setVisible(wanted) {
    portalWanted=wanted;
    if(wanted) {
      // If a hover preview is still active at the restart deadline, leave through
      // its portal before beginning the new header entrance.
      if(introCard?.dataset.intro==='pending' && introStarted!==introCard.dataset.introSequence &&
        (!state || state.mode==='parked')) returnHome(performance.now(),'exiting');
      return;
    } // An exit already underway finishes before the latest reopening.
    if(state?.mode==='viewport-wait'){finishHidden();return;}
    if(state&&['intro','entering','exiting','returning','landing'].includes(state.mode))return;
    if(state?.mode==='dragging'){release({pointerId:state.pointerId},true);return;}
    if(state?.mode==='arming') {
      const held=state;clearTimeout(holdTimer);holdTimer=0;
      releaseCapture(held.pointerId);restoreOrigin(held);
    }
    if(api.grounded?.()===false||state?.platformMotion)return;
    restorePrank(state);
    returnHome(performance.now(),'exiting');
  }
  function tickIntro(now) {
    const intro=state,w=width(),button=introButton.getBoundingClientRect();
    const goal=button.left+button.width/2+sx()-w*.9;
    const floor=Math.max(button.bottom+w*.22,w*.96)+sy();
    const holeX=goal-w*.45,holeY=floor-w*.025;
    const elapsed=Math.max(0,now-intro.start);
    const open=550,out=2400,tap=700,turn=api.turnDuration?.()||720,back=2400,close=320;
    const tapAt=open+out,turnAt=tapAt+tap,backAt=turnAt+turn,end=backAt+back;
    const fade=1-clamp((elapsed-end)/close,0,1);
    // Right-facing emergence and left-facing retreat share the same near lip.
    // Turning the cat must not swap the physical front/back halves of the door.
    showHole(holeX,holeY,clamp(elapsed/open,0,1),elapsed/1000,fade,false);
    canvas.style.removeProperty('clip-path');canvas.style.opacity='1';
    if(elapsed<tapAt) {
      const p=smooth(clamp((elapsed-open)/out,0,1)),x=goal-w*1.4*(1-p);
      floatCat(x,floor,'sprint',0,0,56*p,1);
      portalOcclusion(x,floor,holeX,holeY,1,true);
      if(p===0)canvas.style.opacity='0';
    } else if(elapsed<turnAt) {
      const action=(elapsed-tapAt)/tap;
      floatCat(goal,floor,'button-tap',0,action,0,1);
    } else if(elapsed<backAt) {
      const p=(elapsed-turnAt)/turn;
      floatCat(goal,floor,'turn',0,p,0,p<.5?1:-1);
    } else {
      const p=smooth(clamp((elapsed-backAt)/back,0,1)),x=goal-w*1.4*p;
      floatCat(x,floor,'sprint',0,0,56*p,-1);
      portalOcclusion(x,floor,holeX,holeY,-1);
      if(p===1)canvas.style.opacity='0';
    }
    // This event only enables a pending intro; it never toggles a human choice.
    if(elapsed>=tapAt+350&&!intro.pressed) {
      intro.pressed=true;
      introCard.dispatchEvent(new Event('catintroenable'));
    }
    if(elapsed>=end+close) {
      clearDecorations();
      if(portalWanted)appear();else finishHidden();
    }
  }
  function tickPortal(now) {
    const elapsed=Math.max(0,now-state.start)+(state.mode==='entering'?portalExit:0);
    // Selection changes may replace an exit only after the cat is fully inside.
    if(state.viewportTransfer&&elapsed>=portalExit&&!state.arrivalVisible&&state.selectionVersion!==selectionVersion) {
      const target=viewportTarget();
      if(!target||now<Math.max(selectionReadyAt,scrollResumeAt)){waitForViewport();viewportDirty=true;return;}
      enterViewport(target,now);tickPortal(now);return;
    }
    let r=state.excursion?currentLine(state.excursion.target):homeRect();
    if(!r&&state.excursion){delete state.excursion;r=homeRect();}
    if(!r){cancel();return;}
    if(state.mode!=='exiting'&&elapsed>=portalExit&&!state.arrivalVisible) {
      const homeTarget=!state.excursion||state.excursion.target.id==='home';
      const waitingPhoto=homeTarget&&desktop.matches&&introCard?.dataset.lanePreview==='true'&&introCard.dataset.open==='false';
      const movingHome=homeTarget&&desktop.matches&&homeRule&&Math.abs(homeRule.target-homeRule.offset)>.1;
      if(!state.destinationSample)state.destinationSample={y:r.y,time:now-100};
      else if(Math.abs(r.y-state.destinationSample.y)>.1)state.destinationSample={y:r.y,time:now};
      const movingLine=now-state.destinationSample.time<100;
      if(waitingPhoto||movingHome||movingLine){
        setLine(r);canvas.style.opacity='0';
        if(waitingPhoto||movingHome) {
          state.start=now-(state.mode==='entering'?0:portalExit);
          delete state.gateWaitStart;hole.hidden=portalCanvas.hidden=portalBack.hidden=true;
        } else {
          state.gateWaitStart??=state.start+(state.mode==='entering'?0:portalExit);
          const age=Math.min(portalTiming.open,Math.max(0,now-state.gateWaitStart));
          const w=width(),available=Math.max(0,r.width-w),lm=Math.min(w*.62,available/2),rm=Math.min(w*.12,available/4);
          const offset=state.entryFraction===undefined?available*(state.excursion?.fraction??.5):lm+(available-lm-rm)*state.entryFraction;
          showHole(r.left+offset-w*.12,r.y,age/portalTiming.open,age/1000,1,false);
          state.start=now-(state.mode==='entering'?age:portalExit+age);
        }
        return;
      }
    }
    if(state.mode!=='exiting' && elapsed>=portalExit && (portalWanted||state.homeReserved)) {
      const target=state.excursion?.target||{id:'home',element:home};
      if(state.reservedTarget!==target.element) {
        reserveLine(target);homeVacant(target.id!=='home');
        state.homeReserved=true;state.reservedTarget=target.element;
        r=currentLine(target)||r;
      }
    }
    const w=width(),available=Math.max(0,r.width-w);
    // Keep a sampled entry location stable throughout the animation and resizing.
    // The portal sits to the left of the arriving cat, so it needs more room there.
    const leftMargin=Math.min(w*.62,available/2),rightMargin=Math.min(w*.12,available/4);
    const offset=state.entryFraction===undefined
      ?available*(state.excursion?.fraction??.5)
      :leftMargin+(available-leftMargin-rightMargin)*state.entryFraction;
    const goalX=r.left+offset,goalY=r.y+w*.025;
    if(api.reduced()){if(!portalWanted){finishHidden();return;}finishArrival(r,goalX,now);api.presented();return;}
    // Settle, trace a circle with one paw, then walk through the completed ring.
    if(elapsed<portalExit) {
      const trace=clamp((elapsed-portalTiming.settle)/portalTiming.trace,0,1);
      const walking=elapsed-portalTiming.settle-portalTiming.trace;
      const p=clamp(walking/portalTiming.walk,0,1),f=state.facing;
      const gesture=api.portalGesture?.(trace)||{circle:clamp((trace-.24)/.54,0,1),size:1,centerX:39.2,bottom:-1};
      const holeX=state.from.x+w*(f===1?.98:.02);
      const left=state.from.x+f*w*1.4*smooth(p),feet=state.from.y;
      const fade=1-clamp((walking-portalTiming.walk)/portalTiming.close,0,1);
      const drawingX=state.from.x+w*(f===1?gesture.centerX/40:1-gesture.centerX/40);
      showHole(drawingX,state.from.y+w*gesture.bottom/40,gesture.circle,Math.max(0,elapsed-portalTiming.settle)/1000,fade,f===1,Math.PI/2,f,gesture.size);
      if(elapsed<portalTiming.settle){
        externalBox(left,state.from.y-w*.7,w,w*.7);canvas.style.bottom='0';canvas.style.transform=`scaleX(${f})`;api.settle(elapsed/portalTiming.settle);
      }else if(walking<0)floatCat(left,state.from.y,'portal-open',0,trace,0,f);
      else floatCat(left,feet,p>0?'walk':'idle',0,0,56*smooth(p),f);
      if(walking<0){canvas.style.removeProperty('clip-path');portalBack.hidden=true;portalCanvas.style.clipPath='none';}
      else portalOcclusion(left,feet,holeX,state.from.y-w*.025,f);
      canvas.style.opacity=p>=1?'0':'1';
      if(p>=1&&!state.departureReleased) {
        // Once the cat is fully inside, release its old line during gate closure.
        if(!state.excursion?.sameLine||!portalWanted){reserveLine(null);homeVacant(true);}
        state.departureReleased=true;
      }
      return;
    }
    if(state.mode==='exiting'){
      if(portalWanted)appear();else finishHidden();
      return;
    }
    if(state.mode==='returning' && !portalWanted && !state.homeReserved){finishHidden();return;}
    const enter=elapsed-portalExit,holeX=goalX-w*.12;
    // Sample once per arrival. Neither a new frame nor a resize changes its mood.
    if(!state.arrival)state.arrival=state.viewportTransfer?{walk:2000,pause:0}:
      {walk:5600+Math.random()*400,pause:Math.random()<.45?1500+Math.random()*500:0};
    if(state.arrival.segmented===undefined)state.arrival.segmented=state.arrival.pause>0;
    const arrival=state.arrival,approach=arrival.walk*.62,afterOpen=Math.max(0,enter-portalTiming.open);
    // Closing cancels optional dawdling, while preserving the travelled distance.
    if(!portalWanted)arrival.pause=Math.min(arrival.pause,Math.max(0,afterOpen-approach));
    const grooming=arrival.pause>0&&afterOpen>=approach&&afterOpen<approach+arrival.pause;
    let along;
    if(!arrival.segmented)along=smooth(clamp(afterOpen/arrival.walk,0,1));
    else if(afterOpen<approach)along=.62*smooth(clamp(afterOpen/approach,0,1));
    else if(grooming)along=.62;
    else along=.62+.38*smooth(clamp((afterOpen-approach-arrival.pause)/(arrival.walk-approach),0,1));
    if(along>0)state.arrivalVisible=true;
    const left=goalX-w*1.4*(1-along),finished=portalTiming.open+arrival.walk+arrival.pause;
    const opening=clamp(enter/portalTiming.open,0,1),fade=1-clamp((enter-finished)/portalTiming.close,0,1);
    showHole(holeX,r.y,opening,enter/1000,fade,false);
    const lickTime=grooming?afterOpen-approach:0;
    floatCat(left,goalY,grooming?'groom':along<1?(state.viewportTransfer?'sprint':'walk'):'idle',Math.floor(lickTime/75),
      grooming?lickTime/arrival.pause:0,56*along,1);
    portalOcclusion(left,goalY,holeX,r.y,1,true);
    if(along===0)canvas.style.opacity='0';
    if(enter>=finished+portalTiming.close){
      finishArrival(r,goalX,now);
      if(!portalWanted)returnHome(now,'exiting');else api.presented();
    }
  }
  function tick(now) {
    const dt=Math.min(.05,Math.max(0,(now-lastTick)/1000));lastTick=now;
    // The portrait owns its separator even while the cat is opening the header switch.
    if(state && desktop.matches)homeRect();
    if(now<=layoutFollowUntil||now<=fallbackAt+32)viewportDirty=true;
    if(!portalWanted&&api.active()&&(!state||state.mode==='parked')&&!state?.platformMotion&&api.grounded?.()!==false){
      returnHome(now,'exiting');
    }
    followViewport(now);
    if(!state){
      if(!hint.hidden&&lastHover){if(api.hitScruff(lastHover))showHint(api.scruffPoint());else hint.hidden=true;}
      return false;
    }
    if(state.mode==='viewport-wait')return true;
    if(state.mode==='arming') {
      showHint(state.origin,clamp((now-state.pressStart)/holdDuration,0,1));return true;
    }
    if(state.mode==='dragging') {
      const point=state.point,w=width(),f=state.facing;
      const edge=54,scroll=point.y<edge?-(edge-point.y)/edge:point.y>innerHeight-edge?(point.y-innerHeight+edge)/edge:0;
      if(scroll)window.scrollBy(0,clamp(scroll,-1,1)*240*dt);
      const progress=api.reduced()?1:clamp((now-state.start)/260,0,1);
      state.liftProgress=progress;
      const lift=smooth(clamp((progress-.35)/.65,0,1));
      const targetX=point.x+sx()-w*(f===1?18:22)/40,targetTop=point.y+sy()-w*6/40;
      externalBox(state.from.left+(targetX-state.from.left)*lift,state.from.top+(targetTop-state.from.top)*lift,w,w);
      canvas.style.bottom='0';canvas.style.transform=`scaleX(${f})`;
      api.lift(progress,Math.floor((now-state.start)/80));
      showGuide(nearest(point));return true;
    }
    if(state.mode==='landing') {
      const r=currentLine(state.target);if(!r){returnHome(now);return true;}
      const p=api.reduced()?1:clamp((now-state.start)/(state.duration||320),0,1);
      const left=clamp(state.dropX,r.left,r.left+Math.max(0,r.width-width()));
      const w=width(),top=state.from.top+(r.y-w*.675-state.from.top)*p*p;
      externalBox(state.from.x+(left-state.from.x)*smooth(p),top,w,w);
      canvas.style.bottom='0';canvas.style.height=`${w}px`;canvas.style.transform=`scaleX(${state.facing})`;
      api.lower(p,state.amount);
      if(p===1)finishDrop(now);return true;
    }
    if(state.mode==='parked') {
      const r=currentLine(state.target);
      if(!r){returnHome(now);return true;}
      // Human interaction takes precedence, even on the frame the old timer expires.
      if(protectInteraction(now)) {
        state.interacting=true;
        state.returnDelay=5000;
        state.deadline=Infinity;
      } else if(state.interacting) {
        state.interacting=false;
        state.deadline=state.viewportFollow?Infinity:now+5000;
      }
      const returnTarget=(selectedSection&&targets().find(item=>item.id===selectedSection))||state.returnTarget||{id:'home',element:home};
      if(!state.viewportFollow&&now>=state.deadline&&returnTarget.element===state.target.element){state.viewportFollow=true;state.deadline=Infinity;}
      if(!state.viewportFollow&&now>=state.deadline&&visibleLine(r)&&visibleLine(currentLine(returnTarget))){
        if(returnTarget.id==='home')returnHome(now);else portalTo(returnTarget,now);
        return true;
      }
      setLine(r);
      if(state.platformMotion) {
        const motion=state.platformMotion,elapsed=now-motion.start;
        if(elapsed < motion.duration) {
          if(Math.abs(r.y-motion.fromY)>1)motion.moved=true;
          if(motion.moved)api.render(motion.expanded?'falling':'scared',Math.floor(elapsed/80),1,0,state.platformFacing);
          return true;
        }
        delete state.platformMotion;
        state.deadline=state.interacting||state.viewportFollow?Infinity:now+(state.returnDelay||10000);
        if(motion.moved)api.platformLanded(motion.expanded);
      }
      return false;
    }
    if(state.mode==='intro'){tickIntro(now);return true;}
    if(state.mode==='prank'){tickPrank(now);return true;}
    if(['returning','entering','exiting'].includes(state.mode)){tickPortal(now);return true;}
    return false;
  }
  function suspend() {
    hoverProtectedUntil=0;lastHover=null;
    if(state&&['arming','dragging'].includes(state.mode))release({pointerId:state.pointerId},true);
    if(state?.mode==='prank')restorePrank(state);
  }
  function resumeVisibility(delta) {
    nextWanderAt+=delta;lastTick=performance.now();
    for(const item of [state,state?.platformMotion,state?.destinationSample,state?.excursion?.parked,homeRule])if(item){
      for(const key of ['start','deadline','time','gateWaitStart'])if(Number.isFinite(item[key]))item[key]+=delta;
    }
    if(fallbackAt)fallbackAt+=delta;if(selectionReadyAt)selectionReadyAt+=delta;
    if(layoutFollowUntil)layoutFollowUntil+=delta;scrollResumeAt=0;
    viewportChanged();
  }
  function backgroundCanFall(source) {
    if(!api.active()||desktop.matches||api.reduced()||protectInteraction(performance.now()))return false;
    const target=standingTarget();if(!target)return false;
    const r=currentLine(target),before=source.getBoundingClientRect();
    return residentVisible(r)&&r.y>=before.bottom+sy()-1;
  }
  api.install({tick,cancel,appear,setVisible,wander,viewportChanged,suspend,resumeVisibility,backgroundCanFall,isAway:()=>!!state,blocksInput:()=>!!state&&(state.mode!=='parked'||!!state.platformMotion)});
  function followSectionMotion(event) {
    const now=performance.now();
    const id=sectionIds.find(id=>document.getElementById(id)===event.target);
    if(id){
      selectionVersion++;
      if(event.detail.expanded){selectedSection=id;fallbackAt=0;}
      else if(selectedSection===id){selectedSection=null;fallbackAt=now+event.detail.duration+2000;}
      selectionReadyAt=now+event.detail.duration+100;
    }
    layoutFollowUntil=now+event.detail.duration+150;viewportChanged();
    if(state?.mode!=='parked'||protectInteraction(now))return;
    const source=event.target;
    if(event.detail.duration===0){const r=currentLine(state.target);if(r)setLine(r);delete state.platformMotion;return;}
    // A section's lower separators move; its own top border stays in place.
    const before=source.getBoundingClientRect(),r=currentLine(state.target);
    if(!r || r.y < before.bottom+sy()-1)return;
    const existing=state.platformMotion;
    state.platformFacing=api.direction();api.pause();
    state.platformMotion={start:performance.now(),duration:event.detail.duration,
      expanded:event.detail.expanded,fromY:r.y,moved:existing?.moved||false};
    state.deadline=performance.now()+event.detail.duration+(state.returnDelay||10000);
  }
  document.addEventListener('sectionmotionstart',followSectionMotion);
  document.querySelector('.background-details')?.addEventListener('backgroundmotionstart',followSectionMotion);
  canvas.style.pointerEvents=state?'none':'auto';canvas.style.touchAction='none';canvas.draggable=false;
  document.addEventListener('selectstart',event=>{if(state&&['arming','dragging'].includes(state.mode))event.preventDefault();},true);
  document.addEventListener('dragstart',event=>{if(state&&['arming','dragging'].includes(state.mode))event.preventDefault();},true);
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||state&&state.mode!=='parked'||!api.canLift(event))return;
    event.preventDefault();event.stopPropagation();
    window.getSelection()?.removeAllRanges();document.documentElement.classList.add('cat-handling');
    const r=canvas.getBoundingClientRect(),previous=state;
    state={mode:'arming',tapKind:api.tapKind?.(event),pointerId:event.pointerId,point:{x:event.clientX,y:event.clientY},origin:{x:event.clientX,y:event.clientY},
      pressStart:performance.now(),from:{left:r.left+sx(),top:r.top+sy(),bottom:r.bottom+sy(),height:r.height},previous,facing:api.direction(),touch:event.pointerType==='touch'};
    api.prepareLift();api.pause();canvas.setPointerCapture(event.pointerId);
    externalBox(state.from.left,state.from.top,r.width,r.height);canvas.style.bottom='0';canvas.style.transform=`scaleX(${state.facing})`;showHint(state.origin);
    holdTimer=setTimeout(()=>{
      if(state?.mode!=='arming')return;
      state.mode='dragging';state.start=performance.now();hint.hidden=true;reserveLine(null);homeVacant(true);
      document.documentElement.classList.add('cat-carrying');
    },holdDuration);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!state||event.pointerId!==state.pointerId)return;
    if(state.mode==='arming'&&Math.hypot(event.clientX-state.origin.x,event.clientY-state.origin.y)>(state.touch?16:10)){
      event.stopPropagation();release(event,true);return;
    }
    if(['arming','dragging'].includes(state.mode)){state.point={x:event.clientX,y:event.clientY};event.preventDefault();event.stopPropagation();}
  });
  canvas.addEventListener('pointerup',event=>release(event));
  document.addEventListener('pointerup',event=>release(event));
  canvas.addEventListener('pointercancel',event=>release(event,true));
  canvas.addEventListener('lostpointercapture',event=>{if(!releasingCapture)release(event,true);});
  canvas.addEventListener('contextmenu',event=>{if(state&&['arming','dragging'].includes(state.mode))event.preventDefault();});
  document.addEventListener('pointermove',event=>{
    if(event.pointerType==='mouse'&&(!lastHover||event.clientX!==lastHover.clientX||event.clientY!==lastHover.clientY)&&api.canLift?.(event))hoverProtectedUntil=performance.now()+400;
    lastHover=event;
    if(state&&state.mode!=='parked')return;
    if(event.pointerType==='mouse'&&!event.buttons&&api.hitScruff(event))showHint(api.scruffPoint());else hint.hidden=true;
  },{passive:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state){event.preventDefault();event.stopImmediatePropagation();cancel();}},true);
  window.addEventListener('scroll',()=>{scrollResumeAt=performance.now()+1050;viewportChanged();},{passive:true});
  window.addEventListener('blur',()=>{hoverProtectedUntil=0;lastHover=null;if(state&&['arming','dragging','prank'].includes(state.mode))cancel();});
  desktop.addEventListener('change',()=>{if(state&&['arming','dragging'].includes(state.mode))release({pointerId:state.pointerId},true);viewportChanged();});
})();

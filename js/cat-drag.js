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
    if(occupiedLine)delete occupiedLine.dataset.catOccupied;
    occupiedLine=item&&item.id!=='home'?item.element:null;
    if(occupiedLine)occupiedLine.dataset.catOccupied='true';
  }
  function homeVacant(value) { about.dataset.catVacant=String(value); }
  const home=decoration('cat-home-anchor',stage.parentElement);
  const guide=decoration('cat-drop-guide');guide.hidden=true;
  const hint=decoration('cat-scruff-hint');hint.hidden=true;
  const hole=decoration('cat-return-hole');hole.hidden=true;
  const desktop=matchMedia('(min-width: 1100px)');
  const sx=()=>window.scrollX||0, sy=()=>window.scrollY||0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=p=>p*p*(3-2*p);
  const width=()=>canvas.getBoundingClientRect().width;
  const holdDuration=180;
  let state=null,holdTimer=0,lastTick=0,releasingCapture=false,lastHover=null;
  function lineRect(element,edge='top') {
    if(!element?.isConnected)return null;
    const r=element.getBoundingClientRect();
    return r.width<56?null:{left:r.left+sx(),y:(edge==='bottom'?r.bottom:r.top)+sy(),width:r.width};
  }
  const homeRect=()=>lineRect(home);
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
      if(!rect||result.some(other=>Math.abs(other.rect.y-rect.y)<2&&Math.abs(other.rect.left-rect.left)<2))continue;
      result.push({...item,rect});
    }
    return result;
  }
  const currentLine=item=>item.id==='home'?homeRect():lineRect(item.element,item.edge);
  function nearest(point) {
    const feet=point.y+width()*.8+sy(),x=point.x+sx();
    return targets().filter(item=>x>=item.rect.left-30&&x<=item.rect.left+item.rect.width+30&&Math.abs(item.rect.y-feet)<38)
      .sort((a,b)=>Math.abs(a.rect.y-feet)-Math.abs(b.rect.y-feet))[0]||null;
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
    Object.assign(stage.style,{position:'fixed',insetInline:'auto',right:'auto',bottom:'auto',left:`${left-sx()}px`,top:`${top-sy()}px`,width:`${w}px`,height:`${h}px`,transform:'none'});
    stage.dataset.transported='true';home.dataset.away='true';
  }
  function setLine(r) {
    const w=width();externalBox(r.left,r.y-w*.7,r.width,w*.7);canvas.style.removeProperty('bottom');
  }
  function floatCat(left,bottom,kind,frame=0,progress=0,distance=0,facing=1) {
    const w=width(),h=kind==='carried'?w:w*.7;
    externalBox(left,bottom-h,w,h);canvas.style.bottom='0';canvas.style.transform=`scaleX(${facing})`;
    api.render(kind,frame,progress,distance,facing);
  }
  function clearDecorations() {
    guide.hidden=hint.hidden=hole.hidden=true;
    document.documentElement.classList.remove('cat-carrying','cat-handling');
    canvas.style.removeProperty('clip-path');canvas.style.removeProperty('opacity');
  }
  function restoreHome(x=null,facing=api.direction()) {
    clearDecorations();reserveLine(null);homeVacant(false);
    for(const p of ['position','inset-inline','right','bottom','left','top','width','height','transform'])stage.style.removeProperty(p);
    delete stage.dataset.transported;delete home.dataset.away;
    canvas.style.removeProperty('bottom');canvas.style.removeProperty('height');
    const r=homeRect();api.resume(x===null?Math.max(0,(r?.width||width())/2-width()/2):x,facing);
  }
  function releaseCapture(id) {
    releasingCapture=true;
    if(id!==undefined&&canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
    releasingCapture=false;
  }
  function cancel() {
    clearTimeout(holdTimer);holdTimer=0;
    if(!state){clearDecorations();return;}
    const id=state.pointerId;state=null;releaseCapture(id);restoreHome();
  }
  function restoreOrigin(held) {
    clearDecorations();
    const previous=held.previous;
    if(previous?.mode==='parked') {
      const r=currentLine(previous.target);
      if(r){reserveLine(previous.target);homeVacant(true);state={...previous,deadline:performance.now()+10000};setLine(r);api.resume(clamp(held.from.left-r.left,0,r.width-width()),held.facing);return;}
    }
    state=null;const r=homeRect();restoreHome(r?held.from.left-r.left:null,held.facing);
  }
  function returnHome(now) {
    const r=canvas.getBoundingClientRect(),facing=api.direction();
    api.prepareLift();api.pause();clearDecorations();
    state={mode:'returning',start:now,from:{x:r.left+sx(),y:r.bottom+sy()},facing};
  }
  function finishDrop(now) {
    const item=state.target,r=currentLine(item),facing=state.facing;
    if(!r){returnHome(now);return;}
    const x=clamp(state.dropX-r.left,0,Math.max(0,r.width-width()));
    clearDecorations();
    if(item.id==='home'){state=null;restoreHome(x,facing);return;}
    // Restore the lane and sprite transform in the same frame: no left-edge flash.
    state={mode:'parked',target:item,deadline:now+10000};setLine(r);api.resume(x,facing);
  }
  function release(event,cancelled=false) {
    if(!state||state.pointerId!==event.pointerId||!['arming','dragging'].includes(state.mode))return;
    clearTimeout(holdTimer);holdTimer=0;releaseCapture(event.pointerId);hint.hidden=true;
    if(state.mode==='arming'){restoreOrigin(state);return;}
    const held=state;
    const target=(!cancelled&&nearest(held.point))||held.previous?.target||{id:'home',element:home};
    const r=currentLine(target);if(!r){returnHome(performance.now());return;}
    const sprite=canvas.getBoundingClientRect();
    clearDecorations();
    reserveLine(target);homeVacant(target.id!=='home');
    state={mode:'landing',target,dropX:clamp(sprite.left+sx(),r.left,r.left+r.width-width()),
      from:{x:sprite.left+sx(),y:sprite.bottom+sy(),top:sprite.top+sy()},amount:Math.max(0,((held.liftProgress||0)-.35)/.65),start:performance.now(),facing:held.facing};
    api.pause();
    // Moving the cat never opens or closes the content belonging to a separator.
  }
  function showHole(x,y,openness) {
    const w=width();hole.hidden=false;
    Object.assign(hole.style,{left:`${x-sx()}px`,top:`${y-sy()}px`,width:`${w*.4}px`,height:`${w*.74}px`,transform:`translate(-50%,-100%) scaleX(${Math.max(.001,openness)})`});
  }
  function tickPortal(now) {
    const r=homeRect();if(!r){cancel();return;}
    const w=width(),goalX=r.left+Math.max(0,(r.width-w)/2),goalY=r.y+w*.025;
    if(api.reduced()){state=null;restoreHome(goalX-r.left,1);return;}
    const elapsed=now-state.start;
    // The full cat enters a hole at its nose before changing locations out of sight.
    if(elapsed<1000) {
      const p=clamp((elapsed-180)/650,0,1),f=state.facing;
      const holeX=state.from.x+w*(f===1?.98:.02);
      const left=state.from.x+f*w*smooth(p);
      const opening=Math.min(clamp(elapsed/180,0,1),1-clamp((elapsed-830)/170,0,1));
      showHole(holeX,state.from.y-w*.025,smooth(opening));
      if(elapsed<180){
        externalBox(left,state.from.y-w*.7,w,w*.7);canvas.style.bottom='0';canvas.style.transform=`scaleX(${f})`;api.settle(elapsed/180);
      }else floatCat(left,state.from.y,p>0?'sprint':'idle',0,0,40*smooth(p),f);
      const hidden=clamp(f===1?1-(holeX-left)/w:(holeX-left)/w,0,1)*100;
      // Clip paths follow canvas coordinates, which are mirrored for left-facing cats.
      canvas.style.clipPath=`inset(0 ${hidden}% 0 0)`;
      canvas.style.opacity=elapsed>=830?'0':'1';
      return;
    }
    if(!state.homeReserved){reserveLine(null);homeVacant(false);state.homeReserved=true;}
    const enter=elapsed-1000,p=clamp((enter-180)/650,0,1),holeX=goalX;
    const left=holeX-w+w*smooth(p);
    const opening=Math.min(clamp(enter/180,0,1),1-clamp((enter-830)/170,0,1));
    showHole(holeX,r.y,smooth(opening));
    floatCat(left,goalY,p<1?'sprint':'idle',0,0,40*smooth(p),1);
    canvas.style.clipPath=`inset(0 0 0 ${clamp((holeX-left)/w,0,1)*100}%)`;
    canvas.style.opacity='1';
    if(enter>=1000){state=null;restoreHome(goalX-r.left,1);}
  }
  function tick(now) {
    const dt=Math.min(.05,Math.max(0,(now-lastTick)/1000));lastTick=now;
    if(!state){
      if(!hint.hidden&&lastHover){if(api.hitScruff(lastHover))showHint(api.scruffPoint());else hint.hidden=true;}
      return false;
    }
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
      const p=api.reduced()?1:clamp((now-state.start)/320,0,1);
      const left=clamp(state.dropX,r.left,r.left+Math.max(0,r.width-width()));
      const w=width(),top=state.from.top+(r.y-w*.675-state.from.top)*p*p;
      externalBox(state.from.x+(left-state.from.x)*smooth(p),top,w,w);
      canvas.style.bottom='0';canvas.style.height=`${w}px`;canvas.style.transform=`scaleX(${state.facing})`;
      api.lower(p,state.amount);
      if(p===1)finishDrop(now);return true;
    }
    if(state.mode==='parked') {
      const r=currentLine(state.target);
      if(!r||now>=state.deadline){returnHome(now);return true;}
      setLine(r);
      if(state.platformMotion) {
        const motion=state.platformMotion,elapsed=now-motion.start;
        if(elapsed < motion.duration) {
          if(Math.abs(r.y-motion.fromY)>1)motion.moved=true;
          if(motion.moved)api.render(motion.expanded?'falling':'scared',Math.floor(elapsed/80),1,0,state.platformFacing);
          return true;
        }
        delete state.platformMotion;
        state.deadline=now+10000;
        if(motion.moved)api.platformLanded(motion.expanded);
      }
      return false;
    }
    if(state.mode==='returning'){tickPortal(now);return true;}
    return false;
  }
  api.install({tick,cancel,isAway:()=>!!state,blocksInput:()=>!!state&&(state.mode!=='parked'||!!state.platformMotion)});
  function followSectionMotion(event) {
    if(state?.mode!=='parked')return;
    const source=event.target;
    // A section's lower separators move; its own top border stays in place.
    const before=source.getBoundingClientRect(),r=currentLine(state.target);
    if(!r || r.y < before.bottom+sy()-1)return;
    const existing=state.platformMotion;
    state.platformFacing=api.direction();api.pause();
    state.platformMotion={start:performance.now(),duration:event.detail.duration,
      expanded:event.detail.expanded,fromY:r.y,moved:existing?.moved||false};
    state.deadline=performance.now()+event.detail.duration+10000;
  }
  document.addEventListener('sectionmotionstart',followSectionMotion);
  document.querySelector('.background-details')?.addEventListener('backgroundmotionstart',followSectionMotion);
  canvas.style.pointerEvents='auto';canvas.style.touchAction='none';canvas.draggable=false;
  document.addEventListener('selectstart',event=>{if(state&&['arming','dragging'].includes(state.mode))event.preventDefault();},true);
  document.addEventListener('dragstart',event=>{if(state&&['arming','dragging'].includes(state.mode))event.preventDefault();},true);
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||state&&state.mode!=='parked'||!api.canLift(event))return;
    event.preventDefault();event.stopPropagation();
    window.getSelection()?.removeAllRanges();document.documentElement.classList.add('cat-handling');
    const r=canvas.getBoundingClientRect(),previous=state;
    state={mode:'arming',pointerId:event.pointerId,point:{x:event.clientX,y:event.clientY},origin:{x:event.clientX,y:event.clientY},
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
    lastHover=event;
    if(state&&state.mode!=='parked')return;
    if(event.pointerType==='mouse'&&!event.buttons&&api.hitScruff(event))showHint(api.scruffPoint());else hint.hidden=true;
  },{passive:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state){event.preventDefault();event.stopImmediatePropagation();cancel();}},true);
  window.addEventListener('blur',cancel);
  desktop.addEventListener('change',cancel);
})();

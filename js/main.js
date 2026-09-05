const toggle = document.getElementById('theme-toggle');
function updateThemeLabel() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  const label = document.documentElement.lang === 'zh-CN'
    ? `切换到${next === 'light' ? '浅色' : '深色'}主题`
    : `Switch to ${next} theme`;
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
}
updateThemeLabel();
document.addEventListener('languagechange', updateThemeLabel);
toggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
  updateThemeLabel();
});

const navLinks = [...document.querySelectorAll('nav a')];
const disclosures = [...document.querySelectorAll('.section-disclosure')];
const phoneLayout = window.matchMedia('(max-width: 600px)');
let showingHomeDefaults = true;
function updateNavigation() {
  const active = disclosures.find(section => section.open)?.id || 'about';
  for (const link of navLinks) {
    if (link.getAttribute('href') === `#${active}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
function openSection(target, fromHome = false) {
  showingHomeDefaults = fromHome;
  for (const section of disclosures) if (section !== target) section.open = false;
  if (target) target.open = true;
  updateNavigation();
}
function followHash(hash, scroll = true) {
  const target = document.getElementById(hash.slice(1) || 'top');
  const defaultSection = phoneLayout.matches ? null : document.getElementById('news');
  if (!target) {
    openSection(defaultSection, true);
    return;
  }
  const section = target.closest('.section-disclosure');
  openSection(section || defaultSection, !section);
  if (scroll) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}
for (const section of disclosures) {
  section.addEventListener('toggle', () => {
    if (section.open) {
      // Also supports browsers without native exclusive <details> groups.
      for (const other of disclosures) if (other !== section) other.open = false;
    }
    updateNavigation();
  });
  section.querySelector('summary').addEventListener('click', event => {
    event.preventDefault();
    openSection(section.open ? null : section);
  });
}
for (const link of [...navLinks, ...document.querySelectorAll('a[href="#top"], .skip-link')]) {
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const hash = link.getAttribute('href');
    if (location.hash !== hash) history.pushState(null, '', hash);
    followHash(hash);
  });
}
window.addEventListener('hashchange', () => followHash(location.hash));
phoneLayout.addEventListener('change', () => {
  if (showingHomeDefaults) followHash(location.hash, false);
});
followHash(location.hash, Boolean(location.hash));

const previewClosers = [];
function createHoverPreview(root, trigger, media) {
  let pinned = false;
  let hovered = false;
  let focused = false;
  let dismissed = false;

  function updatePreview() {
    const open = media.matches && (pinned || (!dismissed && (hovered || focused)));
    if (open && root.dataset.open !== 'true') {
      for (const close of previewClosers) if (close !== closePreview) close();
    }
    root.dataset.open = String(open);
    trigger.setAttribute('aria-expanded', String(open));
  }
  function closePreview() {
    pinned = hovered = focused = false;
    dismissed = true;
    updatePreview();
  }
  root.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' || !media.matches) return;
    hovered = true;
    dismissed = false;
    updatePreview();
  });
  root.addEventListener('pointerleave', () => {
    hovered = false;
    updatePreview();
  });
  trigger.addEventListener('focus', () => {
    focused = trigger.matches(':focus-visible');
    if (focused) dismissed = false;
    updatePreview();
  });
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) closePreview();
  });
  trigger.addEventListener('click', () => {
    if (!media.matches) return;
    pinned = !pinned;
    dismissed = !pinned;
    updatePreview();
  });
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target)) closePreview();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.dataset.open === 'true') {
      event.preventDefault();
      closePreview();
    }
  });
  media.addEventListener('change', closePreview);
  previewClosers.push(closePreview);
  updatePreview();
}
const petCard = document.querySelector('.pet-card');
const compactProfile = window.matchMedia('(width < 1100px)');
const petButton = petCard.querySelector('.pet-toggle');
let catPinned = true;
let catHovered = false;
let catPreviewSuppressed = false;
let catHandledPointerClick = false;
let catFocused = false;
let catPointer = null;
let catInteracting = false;
let previousCatPreview = false;
let activeCatControl = null;
const isCatControl = control => control === petButton;
const catControl = () => activeCatControl || petButton;
function updateCatInteraction() {
  const preview = !catPreviewSuppressed && (catHovered || catPointer !== null || (compactProfile.matches && catFocused));
  const active = preview || catPinned;
  petCard.dataset.open = String(preview);
  petCard.dataset.pinned = String(catPinned);
  petButton.setAttribute('aria-pressed', String(catPinned));
  petButton.setAttribute('data-pressing', String(catPointer !== null));
  petButton.setAttribute('aria-expanded', String(preview));
  petCard.dataset.interacting = String(active);
  petCard.dataset.dismissed = String(catPreviewSuppressed && !catPinned);
  if (preview !== previousCatPreview) {
    previousCatPreview = preview;
    petCard.dispatchEvent(new Event(preview ? 'catlaneraise' : 'catlanelower'));
  }
  if (active === catInteracting) return;
  catInteracting = active;
  if (active) {
    for (const close of previewClosers) if (close !== closeCatInteraction) close();
  }
  petCard.dispatchEvent(new Event(active ? 'catpreviewstart' : 'catpreviewend'));
}
function closeCatInteraction() {
  catHovered = catFocused = false;
  catPointer = null;
  activeCatControl = null;
  updateCatInteraction();
}
petButton.addEventListener('click', event => {
  if (catHandledPointerClick) { catHandledPointerClick = false; if (event.detail !== 0) return; }
  catPinned = !catPinned;
  catPreviewSuppressed = true;
  updateCatInteraction();
  if (catPinned) petCard.dispatchEvent(new Event('catpreviewstart'));
});
for (const control of [petButton]) {
  control.addEventListener('pointerenter', event => {
    if (!isCatControl(control) || event.pointerType !== 'mouse') return;
    activeCatControl = control;
    catHovered = true;
    catPreviewSuppressed = false;
    updateCatInteraction();
  });
  control.addEventListener('pointerleave', () => {
    catPreviewSuppressed = false;
    if (control === catControl()) closeCatInteraction();
  });
  control.addEventListener('pointerdown', event => {
    if (!isCatControl(control) || event.button !== 0) return;
    activeCatControl = control;
    catPointer = event.pointerId;
    catFocused = false;
    // Pressing previews and highlights; only release commits the toggle.
    catHandledPointerClick = false;
    catPreviewSuppressed = false;
    updateCatInteraction();
  });
  control.addEventListener('focus', () => {
    if (!isCatControl(control)) return;
    activeCatControl = control;
    catFocused = catPointer === null && !catHovered && control.matches(':focus-visible');
    updateCatInteraction();
  });
  control.addEventListener('blur', closeCatInteraction);
}
document.addEventListener('pointerup', event => {
  if (event.pointerId !== catPointer) return;
  catPinned = !catPinned;
  catHandledPointerClick = true;
  catPreviewSuppressed = true;
  catPointer = null;
  catFocused = false;
  if (event.pointerType !== 'mouse') catHovered = false;
  updateCatInteraction();
}, true);
document.addEventListener('pointercancel', event => {
  catHandledPointerClick = false;
  if (event.pointerId === catPointer) closeCatInteraction();
}, true);
document.addEventListener('pointermove', event => {
  if (event.pointerId !== catPointer) return;
  const bounds = catControl().getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) closeCatInteraction();
}, { passive: true });
document.addEventListener('pointerdown', event => {
  if (!petCard.contains(event.target) && !petButton.contains(event.target)) closeCatInteraction();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { catPinned = false; closeCatInteraction(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) closeCatInteraction();
});
window.addEventListener('blur', closeCatInteraction);
compactProfile.addEventListener('change', closeCatInteraction);
previewClosers.push(closeCatInteraction);
updateCatInteraction();
createHoverPreview(
  document.querySelector('.location'),
  document.querySelector('.location-toggle'),
  window.matchMedia('(max-width: 600px)')
);
const backgroundDetails = document.querySelector('.background-details');
const backgroundSummary = backgroundDetails.querySelector('summary');
const backgroundText = backgroundDetails.querySelector('p');
const backgroundReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let backgroundAnimation = null;
let backgroundTextAnimation = null;
let backgroundExpanded = !compactProfile.matches;
function clearBackgroundTextReveal(preserve = false) {
  const visibleSize = preserve ? getComputedStyle(backgroundText).maskSize : null;
  if (backgroundTextAnimation) { backgroundTextAnimation.cancel(); backgroundTextAnimation = null; }
  if (preserve && visibleSize && visibleSize !== 'auto') {
    backgroundText.style.maskSize = visibleSize;
    backgroundText.style.webkitMaskSize = visibleSize;
    return;
  }
  for (const property of ['mask-image','mask-size','mask-repeat','-webkit-mask-image','-webkit-mask-size','-webkit-mask-repeat']) {
    backgroundText.style.removeProperty(property);
  }
}
function revealBackgroundText(duration, fromHeight) {
  const lineHeight = parseFloat(getComputedStyle(backgroundText).lineHeight) || 27;
  const height = backgroundText.getBoundingClientRect().height;
  const fade = Math.min(14, lineHeight * .5);
  const alreadyVisible = Math.max(lineHeight, fromHeight - backgroundSummary.getBoundingClientRect().height - 12);
  const previousMask = /([\d.]+)px$/.exec(backgroundText.style.maskSize || '');
  const preserved = previousMask ? Math.max(lineHeight, Number(previousMask[1]) - fade) : height;
  const first = Math.min(height, alreadyVisible, preserved);
  const mask = `linear-gradient(to bottom, #000 calc(100% - ${fade}px), transparent 100%)`;
  backgroundText.style.maskImage = backgroundText.style.webkitMaskImage = mask;
  backgroundText.style.maskRepeat = backgroundText.style.webkitMaskRepeat = 'no-repeat';
  // Match the cat's 70 ms hesitation and gravity curve; the first line is visible immediately.
  const frames = Array.from({length:25}, (_,i) => {
    const offset = i / 24;
    const fall = Math.max(0, Math.min(1, (offset * duration - 70) / (duration - 70)));
    const visible = first + (height - first) * fall * fall + fade;
    return {offset, maskSize:`100% ${visible}px`, webkitMaskSize:`100% ${visible}px`};
  });
  backgroundTextAnimation = backgroundText.animate(frames, {duration,easing:'linear',fill:'forwards'});
}
function updateBackgroundVisibility() {
  clearBackgroundTextReveal();
  if (backgroundAnimation) { backgroundAnimation.onfinish = null; backgroundAnimation.cancel(); backgroundAnimation = null; }
  backgroundExpanded = !compactProfile.matches;
  backgroundDetails.open = backgroundExpanded;
  backgroundDetails.dataset.expanded = String(backgroundExpanded);
  backgroundDetails.style.removeProperty('height');
  backgroundDetails.style.removeProperty('overflow');
}
function animateBackground(expanded) {
  clearBackgroundTextReveal(true);
  const from = backgroundDetails.getBoundingClientRect().height;
  if (backgroundAnimation) { backgroundAnimation.onfinish = null; backgroundAnimation.cancel(); }
  backgroundExpanded = expanded;
  backgroundDetails.dataset.expanded = String(expanded);
  backgroundDetails.style.removeProperty('height');
  backgroundDetails.open = expanded;
  const to = backgroundDetails.getBoundingClientRect().height;
  if (backgroundReducedMotion.matches || Math.abs(from - to) < 1) {
    clearBackgroundTextReveal();
    backgroundDetails.style.removeProperty('overflow');
    backgroundAnimation = null;
    return;
  }
  // Keep the content available while height animates, including during collapse.
  backgroundDetails.open = true;
  backgroundDetails.style.height = `${from}px`;
  backgroundDetails.style.overflow = 'hidden';
  const duration = expanded ? 620 : 420;
  if (expanded) revealBackgroundText(duration, from);
  backgroundDetails.dispatchEvent(new CustomEvent('backgroundmotionstart', {detail:{from,to,duration,expanded}}));
  const animation = backgroundDetails.animate([{height:`${from}px`},{height:`${to}px`}], {
    duration, easing:'cubic-bezier(.22,.7,.2,1)', fill:'forwards'
  });
  backgroundAnimation = animation;
  animation.onfinish = () => {
    if (backgroundAnimation !== animation) return;
    backgroundDetails.open = expanded;
    backgroundDetails.style.removeProperty('height');
    backgroundDetails.style.removeProperty('overflow');
    backgroundAnimation = null;
    animation.cancel();
    clearBackgroundTextReveal();
  };
}
backgroundSummary.addEventListener('click', event => {
  if (!compactProfile.matches) return;
  event.preventDefault();
  animateBackground(!backgroundExpanded);
});
compactProfile.addEventListener('change', updateBackgroundVisibility);
updateBackgroundVisibility();

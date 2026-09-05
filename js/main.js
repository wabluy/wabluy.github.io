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
let catClosedOnPress = false;
let catFocused = false;
let catPointer = null;
let catInteracting = false;
let activeCatControl = null;
const isCatControl = control => control === petButton;
const catControl = () => activeCatControl || petButton;
function updateCatInteraction() {
  const preview = !catPreviewSuppressed && (compactProfile.matches ? catHovered || catFocused || catPointer !== null : catHovered);
  const active = preview || catPinned;
  petCard.dataset.open = String(preview);
  petCard.dataset.pinned = String(catPinned);
  petButton.setAttribute('aria-pressed', String(catPinned));
  petButton.setAttribute('aria-expanded', String(preview));
  petCard.dataset.interacting = String(active);
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
  if (catClosedOnPress) { catClosedOnPress = false; if (event.detail !== 0) return; }
  catPinned = !catPinned;
  catPreviewSuppressed = !catPinned;
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
    catClosedOnPress = catPinned;
    if (catPinned) {
      // Close on press, and ignore hover until the pointer leaves or the user reopens.
      catPinned = false;
      catPreviewSuppressed = true;
    }
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
  catPointer = null;
  catFocused = false;
  if (event.pointerType !== 'mouse') catHovered = false;
  updateCatInteraction();
}, true);
document.addEventListener('pointercancel', event => {
  catClosedOnPress = false;
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
function updateBackgroundVisibility() {
  backgroundDetails.open = !phoneLayout.matches;
}
phoneLayout.addEventListener('change', updateBackgroundVisibility);
updateBackgroundVisibility();

const ENTER_MS = 440;
const EXIT_MS = 230;
const EXPAND_MS = 360;

const timers = new WeakMap();

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function clearTimer(element) {
  const timer = timers.get(element);
  if (timer) window.clearTimeout(timer);
  timers.delete(element);
}

function schedule(element, delay, callback) {
  clearTimer(element);
  const timer = window.setTimeout(() => {
    timers.delete(element);
    callback();
  }, delay);
  timers.set(element, timer);
}

function resetInlineMotion(element) {
  element.style.removeProperty('height');
  element.style.removeProperty('opacity');
  element.style.removeProperty('transform');
}

/** Fade/slide a region in or out without changing its existing layout contract. */
export function setVisible(element, visible) {
  if (!element) return;
  const wasHidden = element.classList.contains('hidden');
  const wasLeaving = element.classList.contains('motion-exit');
  clearTimer(element);
  element.classList.remove('motion-enter', 'motion-exit', 'motion-expand');

  if (visible) {
    element.classList.remove('hidden');
    if (!wasHidden && !wasLeaving) return;
    if (reducedMotion()) return;
    void element.offsetWidth;
    element.classList.add('motion-enter');
    schedule(element, ENTER_MS, () => element.classList.remove('motion-enter'));
    return;
  }

  if (wasHidden) return;
  if (reducedMotion()) {
    element.classList.add('hidden');
    return;
  }
  element.classList.add('motion-exit');
  schedule(element, EXIT_MS, () => {
    element.classList.add('hidden');
    element.classList.remove('motion-exit');
  });
}

/** Expand panels that reveal controls, preserving a continuous height transition. */
export function setExpanded(element, visible, { onHidden } = {}) {
  if (!element) return;
  const wasHidden = element.classList.contains('hidden');
  clearTimer(element);
  element.classList.remove('motion-enter', 'motion-exit', 'motion-expand');
  resetInlineMotion(element);

  if (reducedMotion()) {
    element.classList.toggle('hidden', !visible);
    element.classList.remove('motion-expand');
    resetInlineMotion(element);
    if (!visible) onHidden?.();
    return;
  }

  if (visible) {
    element.classList.remove('hidden');
    if (!wasHidden) {
      pulse(element);
      return;
    }
    element.classList.add('motion-expand');
    element.style.height = '0px';
    element.style.opacity = '0';
    element.style.transform = 'translateY(-7px) scale(.985)';
    const targetHeight = element.scrollHeight;
    window.requestAnimationFrame(() => {
      element.style.height = `${targetHeight}px`;
      element.style.opacity = '1';
      element.style.transform = 'translateY(0) scale(1)';
    });
    schedule(element, EXPAND_MS, () => {
      element.classList.remove('motion-expand');
      resetInlineMotion(element);
    });
    return;
  }

  if (wasHidden) return;
  element.classList.add('motion-expand');
  element.style.height = `${element.scrollHeight}px`;
  element.style.opacity = '1';
  element.style.transform = 'translateY(0) scale(1)';
  void element.offsetHeight;
  window.requestAnimationFrame(() => {
    element.style.height = '0px';
    element.style.opacity = '0';
    element.style.transform = 'translateY(-7px) scale(.985)';
  });
  schedule(element, EXPAND_MS, () => {
    element.classList.add('hidden');
    element.classList.remove('motion-expand');
    resetInlineMotion(element);
    onHidden?.();
  });
}

/** Replay a small content-replacement motion for a panel that remains visible. */
export function pulse(element) {
  if (!element || reducedMotion()) return;
  element.classList.remove('motion-refresh');
  void element.offsetWidth;
  element.classList.add('motion-refresh');
  schedule(element, 330, () => element.classList.remove('motion-refresh'));
}

/** Give native disclosure sections the same continuous open and close motion. */
export function setupDetailsMotion(details) {
  const summary = details?.querySelector(':scope > summary');
  if (!details || !summary) return;
  summary.addEventListener('click', (event) => {
    if (reducedMotion()) return;
    event.preventDefault();
    clearTimer(details);
    details.classList.add('motion-expand');

    if (details.open) {
      details.style.height = `${details.offsetHeight}px`;
      details.style.overflow = 'hidden';
      void details.offsetHeight;
      window.requestAnimationFrame(() => {
        details.style.height = `${summary.offsetHeight}px`;
        details.style.opacity = '.84';
      });
      schedule(details, EXPAND_MS, () => {
        details.open = false;
        details.classList.remove('motion-expand');
        resetInlineMotion(details);
        details.style.removeProperty('overflow');
      });
      return;
    }

    details.open = true;
    const targetHeight = details.offsetHeight;
    details.style.height = `${summary.offsetHeight}px`;
    details.style.opacity = '.72';
    details.style.overflow = 'hidden';
    void details.offsetHeight;
    window.requestAnimationFrame(() => {
      details.style.height = `${targetHeight}px`;
      details.style.opacity = '1';
    });
    schedule(details, EXPAND_MS, () => {
      details.classList.remove('motion-expand');
      resetInlineMotion(details);
      details.style.removeProperty('overflow');
    });
  });
}

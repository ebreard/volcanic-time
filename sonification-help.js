export function installSonificationHelp(button, tooltip, { pinOnClick = true } = {}) {
  let pinned = false, timer;
  function position() {
    const anchor = button.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(anchor.right - box.width, innerWidth - box.width - 12))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, innerHeight - box.height - 12))}px`;
  }
  function show() {
    clearTimeout(timer);
    tooltip.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    position();
  }
  function hide() {
    clearTimeout(timer);
    pinned = false;
    tooltip.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }
  function leave() {
    if (!pinned) timer = setTimeout(() => {
      if (document.activeElement !== button) hide();
    }, 160);
  }
  button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(); });
  button.addEventListener('pointerleave', leave);
  button.addEventListener('focus', show);
  button.addEventListener('blur', leave);
  if (pinOnClick) button.addEventListener('click', () => { if (pinned) hide(); else { pinned = true; show(); } });
  tooltip.addEventListener('pointerenter', () => clearTimeout(timer));
  tooltip.addEventListener('pointerleave', leave);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('pointerdown', event => {
    if (!button.contains(event.target) && !tooltip.contains(event.target)) hide();
  });
  window.addEventListener('resize', () => { if (!tooltip.hidden) position(); });
}

// Click/tap-to-trigger one-shot animations for the interactive doodles
// (dino print stomp, bone shake). Shared by both pages; each selector is a
// no-op where that doodle doesn't exist on the page.

import { playBoing, playPoof } from './sfx.js';

function triggerOnClick(selector, animationClass, sound) {
  const el = document.querySelector(selector);
  if (!el) return;

  const trigger = () => {
    el.classList.remove(animationClass);
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(animationClass);
    if (sound) sound();
  };

  el.addEventListener('click', trigger);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      trigger();
    }
  });
  el.addEventListener('animationend', () => el.classList.remove(animationClass));
}

export function initDoodleInteractions() {
  triggerOnClick('.doodle--print', 'is-stomping', playPoof);
  triggerOnClick('.doodle--bone', 'is-shaking', playBoing);
}

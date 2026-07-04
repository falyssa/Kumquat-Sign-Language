// Click/tap-to-stomp interaction for the dino print doodle. Shared by both pages.
export function initDoodleInteractions() {
  const print = document.querySelector('.doodle--print');
  if (!print) return;

  const stomp = () => {
    print.classList.remove('is-stomping');
    void print.offsetWidth; // restart the CSS animation
    print.classList.add('is-stomping');
  };

  print.addEventListener('click', stomp);
  print.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      stomp();
    }
  });
}

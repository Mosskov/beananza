// Beananza share site: loads the game on request, switches scenes, filters decisions.
// The page reads fine without this script; it only adds these three behaviours.
(() => {
  const frame = document.querySelector('.game-frame');
  const iframe = document.getElementById('game');
  const play = document.getElementById('play');
  const openFull = document.getElementById('open-full');
  const sceneButtons = [...document.querySelectorAll('.scene')];
  let scene = 'hub';

  const sceneUrl = (name) => `play/?scene=${encodeURIComponent(name)}`;

  // The game (about 1.7 MB) loads only when someone asks for it.
  function start() {
    iframe.src = sceneUrl(scene);
    frame.classList.add('playing');
    iframe.addEventListener('load', () => iframe.focus(), { once: true });
  }
  play.addEventListener('click', start);

  for (const button of sceneButtons) {
    button.addEventListener('click', () => {
      scene = button.dataset.scene;
      for (const b of sceneButtons) b.setAttribute('aria-pressed', String(b === button));
      openFull.href = sceneUrl(scene);
      start();
    });
  }

  const filters = [...document.querySelectorAll('.filter')];
  const decisions = [...document.querySelectorAll('.decision')];
  for (const button of filters) {
    button.addEventListener('click', () => {
      const f = button.dataset.filter;
      for (const b of filters) b.setAttribute('aria-pressed', String(b === button));
      for (const d of decisions) d.hidden = f !== 'all' && d.dataset.status !== f;
    });
  }

  // A link to #D7 opens that decision.
  function openFromHash() {
    const target = location.hash && document.getElementById(location.hash.slice(1));
    const details = target && target.classList.contains('decision') && target.querySelector('details');
    if (details) details.open = true;
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();

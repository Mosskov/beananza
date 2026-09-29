// Beananza share site: loads the game on request, switches scenes, filters decisions.
// The page reads fine without this script; it only adds these three behaviours.
(() => {
  const frame = document.querySelector('.game-frame');
  const iframe = document.getElementById('game');
  const play = document.getElementById('play');
  const openFull = document.getElementById('open-full');
  const sceneButtons = [...document.querySelectorAll('.scene')];
  let scene = 'hub';
  // A hub test yard (`?layout=`), or null for the plaza.
  let layout = null;

  const sceneUrl = (name, yard) => `play/?scene=${encodeURIComponent(name)}${yard ? `&layout=${encodeURIComponent(yard)}` : ''}`;

  // The game (about 1.7 MB) loads only when someone asks for it.
  function start() {
    iframe.src = sceneUrl(scene, layout);
    frame.classList.add('playing');
    iframe.addEventListener('load', () => iframe.focus(), { once: true });
  }
  play.addEventListener('click', start);

  for (const button of sceneButtons) {
    button.addEventListener('click', () => {
      scene = button.dataset.scene;
      layout = button.dataset.layout ?? null;
      for (const b of sceneButtons) b.setAttribute('aria-pressed', String(b === button));
      openFull.href = sceneUrl(scene, layout);
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

  // Comments on decisions, from the Worker's /api/comments. Without it (a local preview), the
  // comment sections stay hidden.
  const sections = new Map([...document.querySelectorAll('.comments')].map((s) => [s.dataset.decision, s]));
  const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const NAME_KEY = 'beananza-comment-name';

  function renderComment(c) {
    const li = document.createElement('li');
    const head = document.createElement('p');
    head.className = 'comment-head';
    const name = document.createElement('strong');
    name.textContent = c.name;
    const time = document.createElement('time');
    time.dateTime = c.createdAt;
    time.textContent = dateFormat.format(new Date(c.createdAt));
    head.append(name, ' ', time);
    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = c.body;
    li.append(head, body);
    return li;
  }

  function updateCount(section) {
    const n = section.querySelectorAll('.comment-list > li').length;
    section.querySelector('.comment-empty').hidden = n > 0;
    const count = section.closest('.decision').querySelector('.decision-count');
    count.textContent = n === 1 ? '1 comment' : `${n} comments`;
    count.hidden = n === 0;
    section.hidden = n === 0 && section.dataset.open !== 'true';
  }

  function rememberedName() {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch {
      return '';
    }
  }

  function rememberName(name) {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // Private windows may refuse storage; the name is only a convenience.
    }
  }

  async function postComment(form, section) {
    const status = form.querySelector('.comment-status');
    const button = form.querySelector('button[type="submit"]');
    const name = form.elements.name.value.trim();
    const body = form.elements.body.value.trim();
    if (!name) return showStatus(status, 'Add your name, so others know who wrote the comment.', true, form.elements.name);
    if (!body) return showStatus(status, 'Write a comment before posting.', true, form.elements.body);
    button.disabled = true;
    showStatus(status, 'Posting…', false);
    try {
      const res = await fetch('api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: section.dataset.decision, name, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The comment could not be posted (error ${res.status}). Try again.`);
      section.querySelector('.comment-list').append(renderComment(data.comment));
      updateCount(section);
      rememberName(name);
      for (const other of document.querySelectorAll('.comment-form')) {
        if (!other.elements.name.value.trim()) other.elements.name.value = name;
      }
      form.elements.body.value = '';
      showStatus(status, 'Posted.', false);
    } catch (err) {
      const offline = err instanceof TypeError;
      showStatus(status, offline ? 'The comment could not be posted: check your connection and try again.' : err.message, true);
    } finally {
      button.disabled = false;
    }
  }

  function showStatus(el, text, isError, focus) {
    el.textContent = text;
    el.classList.toggle('error', isError);
    if (focus) focus.focus();
  }

  async function loadComments() {
    if (sections.size === 0) return;
    let comments;
    try {
      const res = await fetch('api/comments', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      comments = (await res.json()).comments;
    } catch {
      return;
    }
    if (!Array.isArray(comments)) return;
    for (const c of comments) sections.get(c.decision)?.querySelector('.comment-list').append(renderComment(c));
    const name = rememberedName();
    for (const section of sections.values()) {
      updateCount(section);
      const form = section.querySelector('.comment-form');
      if (!form) continue;
      form.elements.name.value = name;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        postComment(form, section);
      });
    }
  }
  loadComments();

  // A link to #D7 opens that decision.
  function openFromHash() {
    const target = location.hash && document.getElementById(location.hash.slice(1));
    const details = target && target.classList.contains('decision') && target.querySelector('details');
    if (details) details.open = true;
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();

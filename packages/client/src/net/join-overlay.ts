import { CLASS_CODE_PATTERN, nameChoices } from '@beananza/shared';
import { PALETTE, UI_FONT, cssColor } from '../config';

/**
 * Joining a class's hub (M2), before the game starts: the class code (from the teacher's link,
 * or typed) and a name picked from preset names (D26), never typed. Plain HTML over the page, so
 * game scenes keep their no-text rule. PLACEHOLDER style until the UI has one.
 */

export interface JoinChoice {
  classCode: string;
  name: string;
}

/** Names offered at a time; "Other names" draws new ones. */
const OFFERED = 3;

const STYLE = `
.bz-join { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(59, 47, 42, 0.35); font-family: ${UI_FONT}; z-index: 10; }
.bz-join form { background: ${cssColor(PALETTE.panel)}; color: ${cssColor(PALETTE.ink)}; border-radius: 16px; padding: 24px 28px; width: min(420px, calc(100vw - 32px)); box-shadow: 0 8px 0 ${cssColor(PALETTE.cardShadow)}; }
.bz-join h1 { margin: 0 0 16px; font-size: 24px; }
.bz-join label, .bz-join legend { display: block; font-weight: 600; margin: 12px 0 6px; }
.bz-join input[type=text] { font: inherit; font-size: 20px; letter-spacing: 0.1em; text-transform: uppercase; width: 100%; box-sizing: border-box; padding: 8px 10px; border: 2px solid ${cssColor(PALETTE.cardShadow)}; border-radius: 8px; }
.bz-join fieldset { border: 0; padding: 0; margin: 0; }
.bz-join .names { display: grid; gap: 6px; }
.bz-join .names label { font-weight: 400; margin: 0; padding: 8px 10px; border: 2px solid ${cssColor(PALETTE.cardShadow)}; border-radius: 8px; cursor: pointer; }
.bz-join .names label:has(input:checked) { border-color: ${cssColor(PALETTE.primary)}; }
.bz-join button { font: inherit; font-size: 18px; border-radius: 8px; padding: 8px 14px; cursor: pointer; border: 2px solid ${cssColor(PALETTE.cardShadow)}; background: white; margin-top: 10px; }
.bz-join button[type=submit] { background: ${cssColor(PALETTE.primary)}; color: white; border-color: ${cssColor(PALETTE.primary)}; width: 100%; margin-top: 18px; }
.bz-join .status { min-height: 1.4em; margin: 10px 0 0; color: ${cssColor(PALETTE.primary)}; }
`;

/**
 * Show the join form; resolves with the class code and the name once the player joins. `attempt`
 * tries to join and returns an error message to show, or null when it worked.
 */
export function showJoinOverlay(initialCode: string, attempt: (choice: JoinChoice) => Promise<string | null>): Promise<JoinChoice> {
  const style = document.createElement('style');
  style.textContent = STYLE;
  const root = document.createElement('div');
  root.className = 'bz-join';
  root.innerHTML = `
    <form novalidate>
      <h1>Join your class</h1>
      <label for="bz-class">Class code</label>
      <input id="bz-class" type="text" autocomplete="off" spellcheck="false" maxlength="8" inputmode="text" />
      <fieldset>
        <legend>Your name</legend>
        <div class="names"></div>
        <button type="button" class="more">Other names</button>
      </fieldset>
      <button type="submit">Join</button>
      <p class="status" role="status" aria-live="polite"></p>
    </form>`;
  document.head.append(style);
  document.body.append(root);
  const form = root.querySelector('form') as HTMLFormElement;
  const code = root.querySelector('#bz-class') as HTMLInputElement;
  const names = root.querySelector('.names') as HTMLDivElement;
  const status = root.querySelector('.status') as HTMLParagraphElement;
  const submit = root.querySelector('button[type=submit]') as HTMLButtonElement;
  code.value = initialCode.toUpperCase();

  const offer = () => {
    names.replaceChildren(
      ...nameChoices(OFFERED, Math.random).map((name, i) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'bz-name';
        input.value = name;
        input.checked = i === 0;
        label.append(input, ` ${name}`);
        return label;
      }),
    );
  };
  offer();
  (root.querySelector('.more') as HTMLButtonElement).addEventListener('click', offer);
  // Letters and digits only, in capitals: a class code is not free text.
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  (code.value ? submit : code).focus();

  return new Promise((resolve) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const choice: JoinChoice = { classCode: code.value, name: (form.querySelector('input[name=bz-name]:checked') as HTMLInputElement | null)?.value ?? '' };
      if (!CLASS_CODE_PATTERN.test(choice.classCode)) {
        status.textContent = 'A class code is 4 to 8 letters and digits.';
        code.focus();
        return;
      }
      submit.disabled = true;
      status.textContent = 'Joining…';
      void attempt(choice).then((error) => {
        submit.disabled = false;
        if (error !== null) {
          status.textContent = error;
          return;
        }
        root.remove();
        style.remove();
        resolve(choice);
      });
    });
  });
}

/** A message over the game when the connection to the hub is gone, with a way back in. */
export function showDisconnected(): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  const root = document.createElement('div');
  root.className = 'bz-join';
  root.innerHTML = `<form><h1>Lost the connection</h1><p>Your class's hub could not be reached.</p><button type="submit">Join again</button></form>`;
  document.head.append(style);
  document.body.append(root);
  root.querySelector('form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    window.location.reload();
  });
  (root.querySelector('button') as HTMLButtonElement).focus();
}

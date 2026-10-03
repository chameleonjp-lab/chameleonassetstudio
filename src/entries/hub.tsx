import './hub.css';

const link = document.getElementById('three-entry') as HTMLAnchorElement;
const url = document.getElementById('three-url') as HTMLInputElement;
url.value = link.href;
url.addEventListener('focus', () => url.select());
// Native links preserve keyboard, touch, context menus and noopener semantics.
// Ignore an accidental double activation without relying on window.open's return value.
let previousActivation = -Infinity;
link.addEventListener('click', (event) => {
  const now = performance.now();
  if (now - previousActivation < 600) event.preventDefault();
  else previousActivation = now;
});
document.getElementById('build-version')!.textContent =
  `開発版・${__APP_REVISION__.slice(0, 8)}${__APP_DIRTY__ ? '（ローカル変更あり）' : ''}`;

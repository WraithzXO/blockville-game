// Page hygiene for touch devices: stop double-tap zoom, pinch zoom, pull-to-refresh
// and overscroll bounce from fighting the game. Runs only when the device is touch /
// coarse-pointer (same check as the joystick), so desktop pages are not changed.
import { isTouchDevice } from './touchJoystick';

const STYLE_ID = 'bv-touch-page-style';

const CSS = `
html, body {
  overscroll-behavior: none;
  overscroll-behavior-y: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}
canvas { touch-action: none; }
`;

export function installTouchPageGuards(): void {
  if (typeof document === 'undefined' || !isTouchDevice()) return;

  // Viewport: no user scaling, cover the notch and safe-area insets.
  let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content =
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // iOS Safari pinch gesture ignores user-scalable, so cancel it explicitly.
  const cancel = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', cancel, { passive: false });
  document.addEventListener('gesturechange', cancel, { passive: false });
  document.addEventListener('gestureend', cancel, { passive: false });
}

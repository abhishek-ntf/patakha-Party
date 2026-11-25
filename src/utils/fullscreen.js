const root = () => document.documentElement;

export const fullscreenSupported = () =>
  !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      const el = root();
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch (e) {
    console.warn('Fullscreen request was rejected', e);
  }
}

export function onFullscreenChange(cb) {
  document.addEventListener('fullscreenchange', cb);
  document.addEventListener('webkitfullscreenchange', cb);
}

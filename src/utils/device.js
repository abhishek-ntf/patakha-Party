export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '');
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS;
}

/** Picks a sensible default quality tier for the current device. */
export function detectDefaultTier() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (isMobileDevice()) return memory >= 6 && cores >= 8 ? 'medium' : 'low';
  if (memory < 4 || cores < 4) return 'medium';
  return 'high';
}

export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

export function vibrate(ms) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(ms);
    } catch (e) {
      /* ignored */
    }
  }
}

export const canVibrate = () => typeof navigator.vibrate === 'function';

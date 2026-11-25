/** Minimal DOM builder: h('div', { class: 'x', onClick }, child, ...). */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `ico ${cls}`.trim();
  span.innerHTML = ICONS[name] || '';
  return span;
}

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
export const ICONS = {
  home: `<svg viewBox="0 0 24 24" ${S}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" ${S}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${S}><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  speaker: `<svg viewBox="0 0 24 24" ${S}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`,
  speakerOff: `<svg viewBox="0 0 24 24" ${S}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${S}><path d="m7 10 5 5 5-5"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 2s.6 3-1.7 5.3C8.6 9.5 7 11.1 7 14a5 5 0 0 0 10 0c0-2.1-1-3.5-2-4.8-.3 1.1-.9 1.8-1.6 2.1C13.6 8.5 14 5 12.5 2z"/></svg>`,
  fountain: `<svg viewBox="0 0 32 32" ${S}><path d="M11 28h10l-1.5-9h-7z"/><path d="M16 17V8M16 17 11 9M16 17l5-8M16 17 8 13M16 17l8-4"/><circle cx="16" cy="5" r=".8" fill="currentColor"/></svg>`,
  rocket: `<svg viewBox="0 0 32 32" ${S}><path d="M16 3c4 3 5.5 8 5 13l-5 4-5-4c-.5-5 1-10 5-13z"/><circle cx="16" cy="11" r="1.8"/><path d="M11 16l-3 4 4-.6M21 16l3 4-4-.6M16 22v6"/></svg>`,
  burst: `<svg viewBox="0 0 32 32" ${S}><path d="M16 4v6M16 22v6M4 16h6M22 16h6M7.5 7.5l4.2 4.2M20.3 20.3l4.2 4.2M24.5 7.5l-4.2 4.2M11.7 20.3l-4.2 4.2"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/></svg>`,
};

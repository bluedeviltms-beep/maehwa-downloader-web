const { contextBridge, ipcRenderer } = require('electron');

try { ipcRenderer.send('preload:log', `preload loaded ${new Date().toISOString()}`); } catch (_) {}

contextBridge.exposeInMainWorld('desktopAPI', {
  searchYouTube: (query) => ipcRenderer.invoke('youtube:search', query),
  getVideo: (videoId) => ipcRenderer.invoke('youtube:getVideo', videoId),
  startDownload: async (payload) => {
    try {
      const key = payload && (payload.id || payload.videoId) ? (payload.id || payload.videoId) : `dl_${(payload && payload.url) || Math.random()}`;
      try { if (globalThis.__maehwa_toast_api && typeof globalThis.__maehwa_toast_api.makeToastImmediate === 'function') globalThis.__maehwa_toast_api.makeToastImmediate(key, { title: payload && (payload.id || payload.videoId) ? (payload.id || payload.videoId) : '다운로드', sub: payload && payload.url ? payload.url : '', url: payload && payload.url ? payload.url : null }); } catch (e) {}
    } catch (e) {}
    try {
      const res = await ipcRenderer.invoke('download:start', payload);
      try {
        // if download succeeded and toast API available, mark finished locally to avoid missed IPC races
        if (res && res.ok) {
          try {
            const finishPayload = {
              videoId: res.videoId || payload.videoId || null,
              id: res.id || payload.id || null,
              path: res.path || null,
              url: res.url || payload.url || null,
              title: res.title || payload.title || null,
              uploader: res.uploader || null,
              qualityLabel: res.qualityLabel || null,
              container: res.container || null
            };
            if (globalThis.__maehwa_toast_api && typeof globalThis.__maehwa_toast_api.markFinished === 'function') {
              try { globalThis.__maehwa_toast_api.markFinished(finishPayload); } catch (e) {}
            }
          } catch (e) {}
        }
      } catch (e) {}
      return res;
    } catch (e) {
      try {
        if (globalThis.__maehwa_toast_api && typeof globalThis.__maehwa_toast_api.markError === 'function') {
          try { globalThis.__maehwa_toast_api.markError({ id: key, error: String(e) }); } catch (e2) {}
        }
      } catch (e2) {}
      throw e;
    }
  },
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  maximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  getAppVersion: () => ipcRenderer.invoke('app:version')
  ,
  pickOutputFolder: () => ipcRenderer.invoke('dialog:pick-output'),
  getDefaultDownloadsPath: () => ipcRenderer.invoke('path:get-default-downloads'),
  onDownloadProgress: (cb) => {
    const listener = (_e, progress) => cb(progress);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.removeListener('download:progress', listener);
  }
  ,
  onDownloadFinished: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('download:finished', listener);
    return () => ipcRenderer.removeListener('download:finished', listener);
  }
  ,
  onDownloadError: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('download:error', listener);
    return () => ipcRenderer.removeListener('download:error', listener);
  }
  ,
  logClick: (info) => {
    try {
      ipcRenderer.send('renderer:click', info || {});
    } catch (e) {
      // no-op
    }
  }
});

// Emit a minimal preload-ready diagnostic so main can record that preload ran
try { ipcRenderer.send('preload:log', `preload exposed desktopAPI ${new Date().toISOString()}`); } catch (_) {}

// Preload injection of DOM window-controls removed — using static public assets instead.

// Fallback: inject minimal window-control buttons when renderer doesn't include
// the custom window-controls (covers dev mode and missing static assets).
(function injectWindowControls(){
  try {
    const create = () => {
      try {
        if (document.getElementById('maehwa-window-controls')) return;
        const region = document.querySelector('.chrome-drag-region') || document.body;
        if (!region) return;
        const container = document.createElement('div');
        container.id = 'maehwa-window-controls';
        const useFixed = (region === document.body);
        container.style.position = useFixed ? 'fixed' : 'absolute';
        container.style.right = '8px';
        container.style.top = '6px';
        container.style.display = 'flex';
        container.style.gap = '8px';
        container.style.zIndex = '100000';
        container.style.pointerEvents = 'auto';

        const btnStyle = 'background:transparent;border:0;color:#cde8f8;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:13px';
        const btnMin = document.createElement('button'); btnMin.innerText = '—'; btnMin.id = 'maehwa-win-min'; btnMin.style.cssText = btnStyle;
        const btnMax = document.createElement('button'); btnMax.innerText = '▢'; btnMax.id = 'maehwa-win-max'; btnMax.style.cssText = btnStyle;
        const btnClose = document.createElement('button'); btnClose.innerText = '✕'; btnClose.id = 'maehwa-win-close'; btnClose.style.cssText = btnStyle + ';color:#ff9b9b';

        container.appendChild(btnMin);
        container.appendChild(btnMax);
        container.appendChild(btnClose);

        if (!useFixed && region !== document.body) region.style.position = region.style.position || 'relative';
        region.appendChild(container);

        btnMin.addEventListener('click', () => { try { ipcRenderer.invoke('window:minimize'); } catch (e) {} });
        btnMax.addEventListener('click', () => { try { ipcRenderer.invoke('window:toggle-maximize'); } catch (e) {} });
        btnClose.addEventListener('click', () => { try { ipcRenderer.invoke('window:close'); } catch (e) {} });
      } catch (e) {
        // ignore
      }
    };

    const ensure = () => { try { if (!document.getElementById('maehwa-window-controls')) create(); } catch (e) {} };

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => {
        ensure();
        try {
          const mo = new MutationObserver(() => ensure());
          mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
        } catch (e) {}
      }, { once: true });
    } else {
      ensure();
      try {
        const mo = new MutationObserver(() => ensure());
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      } catch (e) {}
    }

    try { setInterval(ensure, 2500); } catch (e) {}
  } catch (e) {}
})();

// Download toasts: show stacked progress toasts at top-center
(function downloadToasts(){
  try {
    const css = `
      #maehwa-toasts { position: fixed; left: 50%; transform: translateX(-50%); top: 12px; z-index: 100001; display: flex; flex-direction: column; gap: 8px; width: 420px; pointer-events: none; }
      .maehwa-toast { pointer-events: auto; background: rgba(16,24,32,0.92); color: #e6f6ff; padding: 10px 12px; border-radius: 8px; box-shadow: 0 6px 18px rgba(2,6,23,0.6); font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
      .maehwa-toast .title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .maehwa-toast .sub { font-size: 12px; color: #9fb7c8; }
      .maehwa-progress { height: 8px; background: rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden; }
      .maehwa-progress > i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg,#4fd1c5,#60a5fa); transition: width 700ms linear; }
      .maehwa-toast.success { background: rgba(8,48,16,0.95); }
      .maehwa-toast.error { background: rgba(48,8,8,0.95); }
      .maehwa-toast .actions { display:flex; gap:8px; justify-content: flex-end; }
      .maehwa-toast button { background: transparent; border: 1px solid rgba(255,255,255,0.06); color: #cfeffb; padding: 6px 8px; border-radius:6px; cursor: pointer; }
    `;

    const addStyles = () => {
      if (document.getElementById('maehwa-toasts-styles')) return;
      const s = document.createElement('style'); s.id = 'maehwa-toasts-styles'; s.innerHTML = css; document.head.appendChild(s);
    };

    const ensureContainer = () => {
      if (document.getElementById('maehwa-toasts')) return document.getElementById('maehwa-toasts');
      const c = document.createElement('div'); c.id = 'maehwa-toasts'; document.body.appendChild(c); return c;
    };

    const toasts = new Map();

    const logPreload = (msg, obj) => {
      try { ipcRenderer.send('preload:log', typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (e) {}
      try { if (obj !== false) console.log('preload-log:', msg, obj || ''); } catch (e) {}
    };

    const makeToast = (key, opts={}) => {
      addStyles();
      const container = ensureContainer();
      let box = document.createElement('div'); box.className = 'maehwa-toast'; box.dataset.key = key;
      const title = document.createElement('div'); title.className = 'title'; title.textContent = opts.title || '다운로드';
      const meta = document.createElement('div'); meta.className = 'sub'; meta.style.fontWeight = '600'; meta.style.marginTop = '2px'; meta.textContent = opts.meta || '';
      const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = opts.sub || '';
      const progWrap = document.createElement('div'); progWrap.className = 'maehwa-progress'; const progBar = document.createElement('i'); progWrap.appendChild(progBar);
      const actions = document.createElement('div'); actions.className = 'actions';
      const btnOpen = document.createElement('button'); btnOpen.textContent = '폴더 열기'; btnOpen.addEventListener('click', () => {
        try { ipcRenderer.invoke('dialog:pick-output') } catch (e) {}
      });
      actions.appendChild(btnOpen);
      box.appendChild(title); box.appendChild(meta); box.appendChild(sub); box.appendChild(progWrap); box.appendChild(actions);
      container.appendChild(box);
      // store optional url and parsed videoId for cross-removal
      const stored = { box, title, meta, sub, progBar, timeout: null, lastPercent: 0, pulseInterval: null };
      try {
        if (opts && opts.url) {
          stored.url = opts.url;
          try {
            const u = new URL(opts.url);
            const host = u.hostname.replace(/^www\./, '');
            let vid = null;
            if (host === 'youtu.be') vid = u.pathname.slice(1);
            else if (u.searchParams && u.searchParams.get('v')) vid = u.searchParams.get('v');
            if (vid) stored.videoId = vid;
          } catch (e) {}
        }
      } catch (e) {}
      toasts.set(key, stored);
      return toasts.get(key);
    };

    // expose a minimal API so other parts of preload can create an immediate toast
    try {
      globalThis.__maehwa_toast_api = globalThis.__maehwa_toast_api || {};
      globalThis.__maehwa_toast_api.makeToastImmediate = (key, opts) => {
        try {
          if (!key) key = `dl_${Math.random()}`;
          if (!toasts.get(key)) {
            makeToast(key, opts || {});
            const t = toasts.get(key);
            try {
              t.progBar.style.width = '2%'; t.lastPercent = 2;
              // start a light pulse to show activity until we get real progress
              if (!t.pulseInterval) {
                t.pulseInterval = setInterval(() => {
                  try {
                    const cur = Number((t.lastPercent || 2));
                    const next = Math.min(8, cur + 1);
                    t.progBar.style.width = next + '%';
                    t.lastPercent = next;
                  } catch (e) {}
                }, 900);
              }
            } catch (e) {}
          }
        } catch (e) {}
        return key;
      };
      // expose markFinished/markError so callers (preload wrappers) can finish toasts reliably
      globalThis.__maehwa_toast_api.markFinished = (payload) => {
        try { markFinished(payload); } catch (e) {}
      };
      globalThis.__maehwa_toast_api.markError = (payload) => {
        try { markError(payload); } catch (e) {}
      };
    } catch (e) {}

    const removeToast = (key) => {
      const t = toasts.get(key); if (!t) return; try { t.box.remove(); } catch (e) {} toasts.delete(key);
    };

    const findToastKey = (payload) => {
      try {
        if (!payload) return null;
        // direct id match
        if (payload.id && toasts.has(payload.id)) return payload.id;
        if (payload.videoId) {
          for (const [k, v] of toasts.entries()) {
            try { if (v && v.videoId && v.videoId === payload.videoId) return k; } catch (e) {}
          }
        }
        if (payload.url) {
          // exact url match
          for (const [k, v] of toasts.entries()) {
            try { if (v && v.url && v.url === payload.url) return k; } catch (e) {}
          }
          // partial contains/normalized matches
          const norm = (u) => { try { return (new URL(u)).toString().replace(/\/$/, ''); } catch (e) { return String(u||''); } };
          const pnorm = norm(payload.url);
          for (const [k,v] of toasts.entries()) {
            try { if (v && v.url && (norm(v.url) === pnorm || norm(v.url).includes(pnorm) || pnorm.includes(norm(v.url)))) return k; } catch (e) {}
          }
          // match by subtext containing url
          for (const [k, v] of toasts.entries()) {
            try { if (v && v.sub && v.sub.textContent && v.sub.textContent.includes(payload.url)) return k; } catch (e) {}
          }
        }
        // fallback: prefer most recently created toast (last entry)
        let lastKey = null;
        for (const k of toasts.keys()) lastKey = k;
        return lastKey;
      } catch (e) { return null; }
    };

    const updateProgress = (payload) => {
      try {
        try { logPreload('download:progress recv', payload); } catch (e) {}
        // find or create matching toast using robust heuristics
        let key = findToastKey(payload);
        if (!key) key = payload.id || payload.videoId || `dl_${(payload && payload.url) || Math.random()}`;
        let t = toasts.get(key);
        if (!t) t = makeToast(key, { title: payload.title || payload.id || payload.videoId || '다운로드', sub: payload.url || '' , meta: (payload.uploader ? payload.uploader + ' · ' : '') + (payload.qualityLabel ? payload.qualityLabel + ' · ' : '') + (payload.container || ''), url: payload.url || null });
        // ensure the toast stores identifying info for later matching/removal
        try { if (payload && payload.url) t.url = payload.url; } catch (e) {}
        try { if (payload && payload.videoId) t.videoId = payload.videoId; } catch (e) {}
        // always apply metadata if present
        try { if (payload && payload.title) t.title.textContent = payload.title; else t.title.textContent = payload.id || payload.videoId || '다운로드 중'; } catch (e) {}
        try { t.meta.textContent = (payload.uploader ? payload.uploader + ' · ' : '') + (payload.qualityLabel ? payload.qualityLabel + ' · ' : '') + (payload.container || ''); } catch (e) {}
        // compute percent from provided fields or fallback to downloaded/total
        let pct = 0;
        if (typeof payload.percent === 'number') pct = payload.percent;
        else if (payload.total && payload.downloaded) pct = Math.round((payload.downloaded / payload.total) * 100);
        else pct = (t && t.lastPercent) || 0;
        // treat this as a 'real' progress update -> stop pulse
        try { if (t.pulseInterval) { clearInterval(t.pulseInterval); t.pulseInterval = null; } } catch (e) {}
        // prevent sudden jump to 100% before finished event; cap at 98
        if (pct >= 100) pct = 98;
        // smooth regressions and interpolate faster when needed
        const last = (t && t.lastPercent) || 0;
        if (pct <= last) {
          const incr = Math.max(2, Math.round((98 - last) / 6));
          pct = Math.min(98, last + incr);
        }
        // apply with transition; force reflow to ensure animation
        try { t.progBar.style.width = (pct) + '%'; t.lastPercent = pct; t.progBar.getBoundingClientRect(); } catch (e) {}
        // display percent based on our computed value (avoid showing raw 100% from payload)
        const displayPct = pct;
        // Prefer showing percent when available. If percent is not provided but downloaded/total exist, show MB. Otherwise show a generic 진행중.
        if (typeof payload.percent === 'number' && payload.percent >= 0) {
          t.sub.textContent = `${payload.percent}%`;
        } else if (payload.downloaded && payload.total) {
          t.sub.textContent = `${Math.round((payload.downloaded||0)/(1024*1024))}MB / ${payload.total?Math.round(payload.total/(1024*1024))+'MB':'?'} `;
        } else if (displayPct) {
          t.sub.textContent = `${displayPct}%`;
        } else {
          t.sub.textContent = '진행중';
        }
        if (t.timeout) { clearTimeout(t.timeout); t.timeout = null; }
        try { logPreload('toast updated', { key, percent: pct, title: payload.title }); } catch (e) {}
      } catch (e) {}
    };

    const markFinished = (payload) => {
      try {
        try { logPreload('download:finished recv', payload); } catch (e) {}
        // determine key: prefer explicit id/videoId, else try to find an existing toast by url or videoId
        let key = payload.id || payload.videoId;
        if (!key && payload && payload.url) {
          for (const [k, v] of toasts.entries()) {
            try { if (v && v.url && v.url === payload.url) { key = k; break; } } catch (e) {}
          }
        }
        if (!key && payload && payload.videoId) {
          for (const [k, v] of toasts.entries()) {
            try { if (v && v.videoId && v.videoId === payload.videoId) { key = k; break; } } catch (e) {}
          }
        }
        // fallback to generate a key so we can show a finished toast if nothing matched
        if (!key) key = payload.id || payload.videoId || `dl_${(payload && payload.url) || Date.now()}`;

        let t = toasts.get(key);
        if (!t) t = makeToast(key, { title: payload.title || payload.id || key, meta: (payload.uploader?payload.uploader+' · ':'') + (payload.qualityLabel?payload.qualityLabel+' · ':'') + (payload.container||''), sub: payload.path || payload.url || '' });
        // ensure identifying info is stored
        try { if (payload && payload.url) t.url = payload.url; } catch (e) {}
        try { if (payload && payload.videoId) t.videoId = payload.videoId; } catch (e) {}

        t.title.textContent = payload.title || payload.id || key;
        t.meta.textContent = (payload.uploader?payload.uploader+' · ':'') + (payload.qualityLabel?payload.qualityLabel+' · ':'') + (payload.container||'');
        t.box.classList.add('success');
        // stop pulse interval if any
        try { if (t.pulseInterval) { clearInterval(t.pulseInterval); t.pulseInterval = null; } } catch (e) {}
        // force to 100% and show path
        try { t.progBar.style.width = '100%'; t.lastPercent = 100; } catch (e) {}
        try { logPreload('toast finished applied', { key, path: payload.path }); } catch (e) {}
        t.sub.textContent = payload.path ? payload.path : (payload.url ? payload.url : '완료');
        if (t.timeout) clearTimeout(t.timeout);
        t.timeout = setTimeout(() => removeToast(key), 4500);
        // remove any other toasts that were created for the same video/url
        try {
          toasts.forEach((v, k) => {
            try {
              if (k === key) return;
              if (payload.videoId && v && v.videoId && v.videoId === payload.videoId) { removeToast(k); }
              else if (payload.url && v && v.url && v.url === payload.url) { removeToast(k); }
            } catch (e) {}
          });
        } catch (e) {}
      } catch (e) {}
    };

    const markError = (payload) => {
      try {
        try { logPreload('download:error recv', payload); } catch (e) {}
        const key = payload.id || payload.videoId || `err_${Date.now()}`;
        let t = toasts.get(key) || makeToast(key, { title: payload.title || '다운로드 오류', meta: payload.uploader || '', sub: payload && payload.error ? String(payload.error) : '' });
        t.title.textContent = payload.title || '다운로드 오류';
        t.meta.textContent = payload.uploader || '';
        t.box.classList.add('error');
        try { if (t.pulseInterval) { clearInterval(t.pulseInterval); t.pulseInterval = null; } } catch (e) {}
        t.progBar.style.width = '100%';
        t.sub.textContent = payload && payload.error ? String(payload.error) : '오류 발생';
        if (t.timeout) clearTimeout(t.timeout);
        t.timeout = setTimeout(() => removeToast(key), 6000);
        try { logPreload('toast error applied', { key, error: payload.error }); } catch (e) {}
        // remove any URL-only toasts for this videoId
        try {
          toasts.forEach((v, k) => {
            try {
              if (k === key) return;
              if (payload.videoId && v && v.videoId && v.videoId === payload.videoId) removeToast(k);
              else if (payload.url && v && v.url && v.url === payload.url) removeToast(k);
            } catch (e) {}
          });
        } catch (e) {}
      } catch (e) {}
    };

    try {
      ipcRenderer.on('download:progress', (_e, p) => updateProgress(p));
      ipcRenderer.on('download:finished', (_e, p) => markFinished(p));
      ipcRenderer.on('download:error', (_e, p) => markError(p));
    } catch (e) {}

  } catch (e) {}
})();

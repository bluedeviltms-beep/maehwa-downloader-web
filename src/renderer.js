document.addEventListener('DOMContentLoaded', () => {
  const qInput = document.getElementById('q');
  const searchBtn = document.getElementById('searchBtn');
  const results = document.getElementById('results');

  async function renderResults(items) {
    results.innerHTML = '';
    if (!items || items.length === 0) {
      results.innerHTML = '<p>검색 결과가 없습니다.</p>';
      return;
    }

    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'result';
      el.innerHTML = `
        <img src="${item.thumbnail || ''}" alt="thumb" />
        <div class="meta">
          <div class="title">${item.title || 'No title'}</div>
          <div class="actions">
            <button class="download-audio">오디오</button>
            <button class="download-video">비디오</button>
          </div>
        </div>
      `;

      el.querySelector('.download-audio').addEventListener('click', async () => {
        await window.desktopAPI.startDownload({ url: item.url, kind: 'audio' });
        alert('다운로드 작업이 시작되었습니다.');
      });

      el.querySelector('.download-video').addEventListener('click', async () => {
        await window.desktopAPI.startDownload({ url: item.url, kind: 'video' });
        alert('다운로드 작업이 시작되었습니다.');
      });

      results.appendChild(el);
    });
  }

  async function searchAdapter(q) {
    if (typeof window.desktopAPI !== 'undefined' && typeof window.desktopAPI.searchYouTube === 'function') {
      return await window.desktopAPI.searchYouTube(q);
    }
    const params = new URLSearchParams({ q: q, maxResults: 12 });
    const url = `http://localhost:3001/api/search?${params.toString()}`;
    const r = await fetch(url);
    const j = await r.json();
    // normalize to {ok, items}
    const items = (j.items || []).map((it) => ({
      title: it.snippet?.title || '',
      thumbnail: it.snippet?.thumbnails?.default?.url || '',
      videoId: it.id?.videoId || null,
      url: it.id?.videoId ? `https://www.youtube.com/watch?v=${it.id.videoId}` : '',
      channelTitle: it.snippet?.channelTitle || ''
    }));
    return { ok: true, items };
  }

  searchBtn.addEventListener('click', async () => {
    const q = qInput.value.trim();
    if (!q) return;
    searchBtn.disabled = true;
    try {
      const res = await searchAdapter(q);
      await renderResults(res.items);
    } finally {
      searchBtn.disabled = false;
    }
  });
});

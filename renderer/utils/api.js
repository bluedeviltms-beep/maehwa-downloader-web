export const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || 'AIzaSyDEOy0q4fuzgaB0Zsu4bcdfgqluOMwgUhE';

export function getApiUrl(path = '') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  
  if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}${cleanPath}`
  }

  return `http://localhost:3001${cleanPath}`
}

export function decodeHTMLEntities(text) {
  if (!text || typeof text !== 'string') return text || ''
  return text
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

export async function fetchYouTubeSearchDirect({ q, duration, order, maxResults = 12 }) {
  // If q is a full YouTube URL, extract videoId directly
  if (q && typeof q === 'string') {
    const urlMatch = q.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
    if (urlMatch && urlMatch[1]) {
      const videoId = urlMatch[1]
      try {
        const singleRes = await fetchYouTubeVideoDirect(videoId)
        if (singleRes.ok && singleRes.details) {
          return {
            ok: true,
            isDirectUrl: true,
            videoId,
            items: [{
              videoId,
              title: singleRes.details.title,
              thumbnail: singleRes.details.thumbnails?.high?.url || singleRes.details.thumbnails?.medium?.url || singleRes.details.thumbnails?.default?.url || '',
              url: `https://www.youtube.com/watch?v=${videoId}`,
              channelTitle: singleRes.details.channelTitle || '',
              viewCount: singleRes.details.viewCount
            }]
          }
        }
      } catch (e) {
        console.warn('Direct video URL resolution failed', e)
      }
    }
  }

  const params = new URLSearchParams({
    part: 'snippet',
    q: String(q || ''),
    type: 'video',
    maxResults: String(maxResults),
    key: YOUTUBE_API_KEY
  })

  if (duration && duration !== 'any') params.set('videoDuration', duration)
  if (order && order !== 'relevance') params.set('order', order)

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`)
  const json = await res.json()

  if (!res.ok) {
    throw new Error(json?.error?.message || '유튜브 검색에 실패했습니다.')
  }

  const items = (json.items || [])
    .map((it) => {
      const videoId = it.id?.videoId || (typeof it.id === 'string' ? it.id : null)
      return {
        title: decodeHTMLEntities(it.snippet?.title || ''),
        thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || '',
        videoId,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
        channelTitle: decodeHTMLEntities(it.snippet?.channelTitle || ''),
        viewCount: null
      }
    })
    .filter((it) => !!it.videoId)

  const ids = items.map((it) => it.videoId).filter(Boolean)
  if (ids.length > 0) {
    try {
      const statsParams = new URLSearchParams({
        part: 'statistics',
        id: ids.join(','),
        key: YOUTUBE_API_KEY
      })
      const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${statsParams.toString()}`)
      const statsJson = await statsRes.json()
      if (statsJson.items) {
        const map = Object.fromEntries(statsJson.items.map(item => [item.id, item.statistics?.viewCount]))
        items.forEach(it => {
          if (map[it.videoId] != null) it.viewCount = map[it.videoId]
        })
      }
    } catch (e) {
      console.warn('Failed to fetch video statistics', e)
    }
  }

  return { ok: true, items }
}

export async function fetchYouTubeVideoDirect(videoId) {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    id: String(videoId),
    key: YOUTUBE_API_KEY
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`)
  const json = await res.json()
  const it = (json.items || [])[0]
  if (!it) {
    return { ok: false, error: '영상을 찾을 수 없습니다.' }
  }

  return {
    ok: true,
    details: {
      videoId: it.id,
      title: decodeHTMLEntities(it.snippet?.title || ''),
      description: decodeHTMLEntities(it.snippet?.description || ''),
      thumbnails: it.snippet?.thumbnails || {},
      publishedAt: it.snippet?.publishedAt || null,
      duration: it.contentDetails?.duration || null,
      viewCount: it.statistics?.viewCount || null,
      likeCount: it.statistics?.likeCount || null,
      channelTitle: decodeHTMLEntities(it.snippet?.channelTitle || '')
    }
  }
}

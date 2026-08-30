import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Footer from '../components/Footer'
import { getApiUrl, fetchYouTubeSearchDirect, decodeHTMLEntities } from '../utils/api'
import { downloadClientSideDirect } from '../utils/clientDownload'

export default function Home() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [outputDir, setOutputDir] = useState('')
  const [progress, setProgress] = useState(null)
  const [downloads, setDownloads] = useState([]) // { videoId, title, kind, status, percent, path }
  const [downloadsCollapsed, setDownloadsCollapsed] = useState(false)
  const [lastRequest, setLastRequest] = useState(null)
  const [lastResponse, setLastResponse] = useState(null)
  const [showDebug, setShowDebug] = useState(false)
  const [duration, setDuration] = useState('any')
  const [order, setOrder] = useState('relevance')
  const [durationOpen, setDurationOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const durationRef = useRef(null)
  const orderRef = useRef(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({ audioFormat: 'webm', audioQuality: 'high', videoQuality: 'highest' })

  const decodeHTMLEntities = (text) => {
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

  const formatViewCount = (value) => {
    if (value === null || value === undefined || value === '') return '알 수 없음'
    const num = Number(value)
    if (Number.isNaN(num)) return '알 수 없음'
    return num.toLocaleString()
  }

  async function doSearchQuery(targetQ) {
    const queryToUse = targetQ !== undefined ? targetQ : q
    if (!queryToUse) return
    setLoading(true)
    setError(null)
    try {
      const payload = { q: queryToUse, duration, order }
      console.log('renderer: search payload', payload)
      setLastRequest(payload)
      const searchAdapter = async (p) => {
        if (typeof window !== 'undefined' && window.desktopAPI && typeof window.desktopAPI.searchYouTube === 'function') {
          return await window.desktopAPI.searchYouTube(p)
        }
        try {
          return await fetchYouTubeSearchDirect(p)
        } catch (directErr) {
          console.warn('Direct YouTube search failed, attempting fallback', directErr)
          try {
            const params = new URLSearchParams({ q: p.q || p, maxResults: p.maxResults || 12 })
            if (p.duration) params.set('videoDuration', p.duration)
            if (p.order) params.set('order', p.order)
            const url = getApiUrl(`/api/search?${params.toString()}`)
            const r = await fetch(url)
            const j = await r.json()
            const items = (j.items || []).map((it) => {
              const videoId = it.videoId || it.id?.videoId || (typeof it.id === 'string' ? it.id : null)
              return {
                title: decodeHTMLEntities(it.title || it.snippet?.title || ''),
                thumbnail: it.thumbnail || it.snippet?.thumbnails?.high?.url || '',
                videoId,
                url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
                channelTitle: decodeHTMLEntities(it.channelTitle || it.snippet?.channelTitle || ''),
                viewCount: it.viewCount ?? null
              }
            }).filter(it => !!it.videoId)
            return { ok: true, items }
          } catch (e) {
            return { ok: false, error: '검색 결과를 가져올 수 없습니다. 인터넷 연결을 확인해주세요.' }
          }
        }
      }

      const res = await searchAdapter(payload)
      if (!res.ok) {
        setError(res.error || '검색 실패')
        setItems([])
      } else {
        setItems(res.items || [])
        // Scroll results into view after search completes
        try {
          setTimeout(() => {
            const el = document.getElementById('results')
            if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth' })
          }, 50)
        } catch (e) { console.warn('scroll to results failed', e) }
        setLastResponse(res)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function doSearch() {
    return doSearchQuery()
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const searchParams = new URLSearchParams(window.location.search)
      const qParam = searchParams.get('q')
      if (qParam && qParam.trim()) {
        const queryText = qParam.trim()
        setQ(queryText)
        doSearchQuery(queryText)
      }
    } catch (e) {
      // ignore
    }
  }, [router.query?.q])

  async function chooseOutput() {
    const selected = await window.desktopAPI.pickOutputFolder()
    if (selected) setOutputDir(selected)
  }

  async function loadDefaultOutput() {
    try {
      const p = await window.desktopAPI.getDefaultDownloadsPath()
      setOutputDir(p)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadDefaultOutput()
    let off = () => {}
    try {
      if (window.desktopAPI && typeof window.desktopAPI.onDownloadProgress === 'function') {
        off = window.desktopAPI.onDownloadProgress((p) => {
          // update downloads by videoId if present, otherwise by id
          setDownloads((prev) => {
            const idx = p.videoId ? prev.findIndex(d => d.videoId === p.videoId) : prev.findIndex(d => d.id === p.id)
            if (idx === -1) return prev
            const copy = [...prev]
            copy[idx] = { ...copy[idx], percent: p.percent, status: 'downloading' }
            return copy
          })
          setProgress(p)
        })
      } else {
        console.warn('desktopAPI.onDownloadProgress not available')
      }
    } catch (e) {
      off = () => {}
      console.warn('failed to attach onDownloadProgress', e)
    }
    // Restore last search state from sessionStorage if present
    try {
      const saved = sessionStorage.getItem('maehwa_search_state')
      if (saved) {
        const st = JSON.parse(saved)
        if (st.q) setQ(st.q)
        if (st.duration) setDuration(st.duration)
        if (st.order) setOrder(st.order)
        if (st.items) setItems(st.items)
      }
    } catch (e) {
      console.warn('Failed to restore search state', e)
    }
    // load settings from localStorage
    try {
      const s = localStorage.getItem('maehwa_download_settings')
      if (s) setSettings(JSON.parse(s))
    } catch (e) {
      // ignore
    }
    // download finished handler (guard against missing preload API)
    let offFinished = null
    try {
      if (window.desktopAPI && typeof window.desktopAPI.onDownloadFinished === 'function') {
        offFinished = window.desktopAPI.onDownloadFinished((p) => {
          setDownloads((prev) => {
            const idx = p.videoId ? prev.findIndex(d => d.videoId === p.videoId) : prev.findIndex(d => d.id === p.id)
            if (idx === -1) return prev
            const copy = [...prev]
            copy[idx] = { ...copy[idx], status: 'done', percent: 100, path: p.path }
            return copy
          })
        })
      } else {
        // fallback no-op remover
        offFinished = () => {}
        console.warn('desktopAPI.onDownloadFinished not available')
      }
    } catch (e) {
      offFinished = () => {}
      console.warn('failed to attach onDownloadFinished', e)
    }
    // download error handler
    try {
      if (window.desktopAPI && typeof window.desktopAPI.onDownloadError === 'function') {
        const offErr = window.desktopAPI.onDownloadError((p) => {
          // mark matching queue item as error and include message
          setDownloads((prev) => {
            const idx = p.videoId ? prev.findIndex(d => d.videoId === p.videoId) : -1
            if (idx === -1) return prev
            const copy = [...prev]
            copy[idx] = { ...copy[idx], status: 'error', error: p.error }
            return copy
          })
          try { alert(`다운로드 오류: ${p.error}`) } catch (e) { console.warn('alert failed', e) }
        })
        // chain cleanup: wrap previous offFinished remover to also remove offErr
        const origOffFinished = offFinished
        offFinished = () => { try { origOffFinished && origOffinished() } catch (e) {} ; try { offErr && offErr() } catch (e) {} }
      }
    } catch (e) {
      console.warn('failed to attach onDownloadError', e)
    }
    // click outside handler to close custom selects
    function onDocClick(e) {
      if (durationRef.current && !durationRef.current.contains(e.target)) setDurationOpen(false)
      if (orderRef.current && !orderRef.current.contains(e.target)) setOrderOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => { off(); offFinished(); document.removeEventListener('click', onDocClick) }
  }, [])

  // queue a download and start it
  async function handleDownload(item, kind) {
    const videoId = item.videoId
    const title = item.title
    setDownloads((d) => [{ videoId, title, kind, status: 'queued', percent: 0, path: null }, ...d])
    try {
      const payload = { url: item.url, kind, outputDir, quality: kind === 'audio' ? settings.audioQuality : settings.videoQuality, format: settings.audioFormat }
      if (typeof window !== 'undefined' && window.desktopAPI && typeof window.desktopAPI.startDownload === 'function') {
        const res = await window.desktopAPI.startDownload(payload)
        setDownloads((prev) => prev.map(x => x.videoId === videoId ? { ...x, status: res.ok ? 'done' : 'error', path: res.path || null } : x))
      } else {
        await downloadClientSideDirect({
          url: payload.url,
          title,
          kind,
          format: payload.format,
          onProgress: (percent) => {
            setDownloads((prev) => prev.map(x => x.videoId === videoId ? { ...x, percent, status: 'downloading' } : x))
          }
        })
        setDownloads((prev) => prev.map(x => x.videoId === videoId ? { ...x, status: 'done', percent: 100 } : x))
      }
    } catch (e) {
      setDownloads((prev) => prev.map(x => x.videoId === videoId ? { ...x, status: 'error' } : x))
    }
  }

  function removeDownload(videoId) {
    setDownloads((prev) => prev.filter(d => d.videoId !== videoId));
  }

  function toggleDownloads() {
    setDownloadsCollapsed(s => !s)
  }

  function resetToInitial() {
    setQ('')
    setItems([])
    setError(null)
    setLastRequest(null)
    setLastResponse(null)
    setDuration('any')
    setOrder('relevance')
    try {
      sessionStorage.removeItem('maehwa_search_state')
      if (router.query?.q) {
        router.push('/', undefined, { shallow: true })
      }
    } catch (e) {}
  }

  // Persist search state so returning from detail restores results
  useEffect(() => {
    try {
      const state = { q, duration, order, items }
      sessionStorage.setItem('maehwa_search_state', JSON.stringify(state))
    } catch (e) {
      // ignore
    }
  }, [q, duration, order, items])

  const hasContent = items.length > 0 || downloads.length > 0 || loading || lastRequest

  return (
    <div className="page-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', flex: 1 }}>
        <div className="app-chrome">
          <div className="chrome-drag-region">
            <div onClick={resetToInitial} style={{paddingLeft:8,fontSize:14,fontWeight:600,cursor:'pointer',userSelect:'none'}}>매화 다운로더</div>
          </div>

          {/* window controls removed per request */}
        </div>

        <div className="container" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 'calc(100vh - 60px)', width: '100%', maxWidth: 1100, margin: '0 auto', padding: 18 }}>
          <div className="hero" style={{ margin: hasContent ? '0 0 16px 0' : 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.3s ease', width: '100%' }}>
            <h1 onClick={resetToInitial} style={{ margin: '0 0 20px 0', textAlign: 'center', fontSize: '2.5rem', fontWeight: 800, cursor: 'pointer', userSelect: 'none' }}>MaeHwa Downloader</h1>
            <div style={{ width: '100%', maxWidth: 880 }}>
              <div className="search" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색어 또는 유튜브 링크" onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }} style={{ flex: '1 1 240px', minWidth: 0, height: 44, padding: '0 14px', boxSizing: 'border-box' }} />
                <div ref={durationRef} className="custom-select" style={{ flex: '0 0 auto' }}>
                  <button className="custom-select-toggle" onClick={() => setDurationOpen((s) => !s)} style={{ whiteSpace: 'nowrap', height: 44, padding: '0 14px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center' }}>{duration === 'any' ? '전체 길이' : duration === 'short' ? '짧음 (<4분)' : duration === 'medium' ? '중간 (4-20분)' : '김 (>20분)'}</button>
                  {durationOpen && (
                    <div className="custom-select-menu">
                      <div className={`custom-select-item ${duration==='any'?'active':''}`} onClick={() => { setDuration('any'); setDurationOpen(false) }}>전체 길이</div>
                      <div className={`custom-select-item ${duration==='short'?'active':''}`} onClick={() => { setDuration('short'); setDurationOpen(false) }}>짧음 (&lt;4분)</div>
                      <div className={`custom-select-item ${duration==='medium'?'active':''}`} onClick={() => { setDuration('medium'); setDurationOpen(false) }}>중간 (4-20분)</div>
                      <div className={`custom-select-item ${duration==='long'?'active':''}`} onClick={() => { setDuration('long'); setDurationOpen(false) }}>김 (&gt;20분)</div>
                    </div>
                  )}
                </div>

                <div ref={orderRef} className="custom-select" style={{ flex: '0 0 auto' }}>
                  <button className="custom-select-toggle" onClick={() => setOrderOpen((s) => !s)} style={{ whiteSpace: 'nowrap', height: 44, padding: '0 14px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center' }}>{order === 'relevance' ? '관련도' : order === 'date' ? '최신' : order === 'viewCount' ? '조회수' : '평점'}</button>
                  {orderOpen && (
                    <div className="custom-select-menu">
                      <div className={`custom-select-item ${order==='relevance'?'active':''}`} onClick={() => { setOrder('relevance'); setOrderOpen(false) }}>관련도</div>
                      <div className={`custom-select-item ${order==='date'?'active':''}`} onClick={() => { setOrder('date'); setOrderOpen(false) }}>최신</div>
                      <div className={`custom-select-item ${order==='viewCount'?'active':''}`} onClick={() => { setOrder('viewCount'); setOrderOpen(false) }}>조회수</div>
                      <div className={`custom-select-item ${order==='rating'?'active':''}`} onClick={() => { setOrder('rating'); setOrderOpen(false) }}>평점</div>
                    </div>
                  )}
                </div>
                <button className="btn btn-primary" onClick={doSearch} disabled={loading} style={{ whiteSpace: 'nowrap', height: 44, padding: '0 18px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center' }}>{loading ? '검색중...' : '검색'}</button>
                <button className="btn btn-ghost" onClick={() => { setDuration('any'); setOrder('relevance'); }} style={{ whiteSpace: 'nowrap', height: 44, padding: '0 14px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center' }}>필터 초기화</button>
              </div>
              {progress && <div style={{ marginTop: 8, textAlign: 'center' }}>진행: {progress.percent}%</div>}
            </div>
          </div>

          {error && <div className="error">{error}</div>}

            <div style={{marginTop:12,display:'flex',gap:8,alignItems:'center'}}>
              <label style={{color:'#99adc0'}}>디버그</label>
              <button className="btn btn-ghost" onClick={() => setShowDebug((s) => !s)}>{showDebug ? '숨기기' : '보기'}</button>
            </div>
            {showDebug && (
              <div style={{marginTop:10,background:'rgba(255,255,255,0.02)',padding:12,borderRadius:8,maxHeight:220,overflow:'auto',fontSize:12}}>
                <div style={{marginBottom:8}}><strong>요청(payload):</strong> <pre style={{whiteSpace:'pre-wrap',margin:0}}>{JSON.stringify(lastRequest,null,2)}</pre></div>
                <div><strong>응답 일부(items):</strong>
                  <pre style={{whiteSpace:'pre-wrap',margin:0}}>{JSON.stringify((lastResponse && lastResponse.items) ? lastResponse.items.slice(0,6) : null,null,2)}</pre>
                </div>
              </div>
            )}

            {showSettings && (
              <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}}>
                <div style={{width:520,background:'#0b1620',padding:16,borderRadius:8}}>
                  <h3>다운로드 설정</h3>
                  <div style={{display:'flex',gap:12,marginTop:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:'#99adc0'}}>오디오 형식</div>
                      <select value={settings.audioFormat} onChange={(e)=>{ const s={...settings,audioFormat:e.target.value}; setSettings(s); localStorage.setItem('maehwa_download_settings',JSON.stringify(s)); }}>
                        <option value="webm">webm (기본)</option>
                        <option value="m4a">m4a</option>
                        <option value="mp3">mp3 (ffmpeg 필요)</option>
                      </select>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:'#99adc0'}}>오디오 품질</div>
                      <select value={settings.audioQuality} onChange={(e)=>{ const s={...settings,audioQuality:e.target.value}; setSettings(s); localStorage.setItem('maehwa_download_settings',JSON.stringify(s)); }}>
                        <option value="high">높음</option>
                        <option value="medium">중간</option>
                        <option value="low">낮음</option>
                      </select>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:12,marginTop:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:'#99adc0'}}>비디오 품질</div>
                      <select value={settings.videoQuality} onChange={(e)=>{ const s={...settings,videoQuality:e.target.value}; setSettings(s); localStorage.setItem('maehwa_download_settings',JSON.stringify(s)); }}>
                        <option value="highest">가장 높음</option>
                        <option value="1080p">1080p</option>
                        <option value="720p">720p</option>
                        <option value="480p">480p</option>
                      </select>
                    </div>
                  </div>
                  <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
                    <button className="btn btn-ghost" onClick={()=>setShowSettings(false)}>닫기</button>
                  </div>
                </div>
              </div>
            )}

            {downloads.length > 0 && (
              <div style={{marginTop:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <h3 style={{margin:'8px 0'}}>다운로드 큐 ({downloads.length})</h3>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <button className="btn btn-ghost" onClick={toggleDownloads}>{downloadsCollapsed ? '펼치기' : '접기'}</button>
                    <button className="btn btn-ghost" onClick={() => setDownloads([])}>모두 삭제</button>
                  </div>
                </div>
                {!downloadsCollapsed && (
                  <div className="download-queue" style={{display:'flex',flexDirection:'column',gap:8,maxHeight:'28vh',overflowY:'auto',paddingRight:6}}>
                    {downloads.map(d => (
                      <div key={d.videoId} className="download-item" style={{display:'flex',alignItems:'center',gap:12,background:'rgba(255,255,255,0.02)',padding:8,borderRadius:8}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700}}>{d.title}</div>
                          <div style={{fontSize:12,color:'#99adc0'}}>{d.kind} · {d.status}</div>
                          <div style={{height:8,background:'rgba(255,255,255,0.03)',borderRadius:6,overflow:'hidden',marginTop:6}}>
                            <div style={{width:`${d.percent||0}%`,height:'100%',background:'linear-gradient(90deg,var(--warm),var(--accent))'}} />
                          </div>
                        </div>
                        <div style={{minWidth:140,textAlign:'right',display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
                          <div>{d.path ? '완료' : (d.percent ? `${d.percent}%` : d.status)}</div>
                          <div style={{display:'flex',gap:6}}>
                            <button className="btn btn-ghost" onClick={() => { if (d.path) { try { window.desktopAPI.openFolder && window.desktopAPI.openFolder(d.path); } catch(e){} } }}>열기</button>
                            <button className="btn btn-danger" onClick={() => removeDownload(d.videoId)}>삭제</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          <div id="results" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {items.length === 0 && !loading && lastRequest && <p style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>검색 결과가 없습니다.</p>}
            {items.map((item) => (
              <div key={item.videoId} className="result">
                <img src={item.thumbnail} alt="thumb" />
                <div className="meta">
                  <div className="title"><Link href={`/video/[id]?id=${item.videoId}`}>{decodeHTMLEntities(item.title)}</Link></div>
                  <div className="subtitle">{decodeHTMLEntities(item.channelTitle) || '알 수 없음'} · 조회수 {formatViewCount(item.viewCount)}</div>
                  {/* 다운로드는 상세페이지에서 가능합니다 */}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'auto' }}>
            <Footer />
          </div>
        </div>
      </div>
    </div>
  )
}

  // global custom scrollbar styles for results and download queue
  export const __custom_scroll_styles = true;

  /* Insert global styles by appending a style tag at module scope via DOM when page loads */
  if (typeof window !== 'undefined') {
    const styleId = 'maehwa-custom-scroll-styles';
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style');
      s.id = styleId;
      s.innerHTML = `
        /* results and queue custom scrollbar */
        #results::-webkit-scrollbar, .download-queue::-webkit-scrollbar { width: 10px; }
        #results::-webkit-scrollbar-track, .download-queue::-webkit-scrollbar-track { background: rgba(0,0,0,0.06); border-radius: 6px; }
        #results::-webkit-scrollbar-thumb, .download-queue::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#6b7280,#4b5563); border-radius: 6px; }
        #results::-webkit-scrollbar-thumb:hover, .download-queue::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg,#4b5563,#374151); }
        /* Firefox */
        #results, .download-queue { scrollbar-width: thin; scrollbar-color: #6b7280 rgba(0,0,0,0.06); }
      `;
      document.head.appendChild(s);
    }
  }

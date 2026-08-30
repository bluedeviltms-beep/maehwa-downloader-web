import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import Footer from '../../components/Footer'
import { getApiUrl, fetchYouTubeVideoDirect, decodeHTMLEntities } from '../../utils/api'
import { downloadClientSideDirect } from '../../utils/clientDownload'

// Custom Dropdown Component replacing default HTML select
function CustomDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const selectedOpt = options.find(o => o.value === value) || options[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }} ref={ref}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          padding: '12px 16px',
          borderRadius: 12,
          border: open ? '1px solid #2563eb' : '1px solid #cbd5e1',
          background: '#ffffff',
          color: '#0f172a',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
          transition: 'all 0.15s ease'
        }}
      >
        <span>{selectedOpt?.label || value}</span>
        <span style={{ fontSize: 10, color: '#64748b', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 6,
            boxShadow: '0 12px 30px -4px rgba(15,23,42,0.12)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <div
                key={String(opt.value)}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? '#1d4ed8' : '#334155',
                  background: isSelected ? '#eff6ff' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.1s ease'
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <span>{opt.label}</span>
                {isSelected && <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 800 }}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function VideoDetail() {
  const router = useRouter()
  const { id } = router.query
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState(null)
  const [error, setError] = useState(null)
  const [showPlayer, setShowPlayer] = useState(false)
  const [downloadType, setDownloadType] = useState('audio') // 'audio' | 'video'
  const [audioFormat, setAudioFormat] = useState('m4a')
  const [audioBitrate, setAudioBitrate] = useState(192) // kbps
  const [videoFormat, setVideoFormat] = useState('mp4')
  const [videoQuality, setVideoQuality] = useState('highest')
  const [estimSize, setEstimSize] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [headerQ, setHeaderQ] = useState('')

  const handleHeaderSearch = () => {
    if (!headerQ || !headerQ.trim()) return
    router.push(`/?q=${encodeURIComponent(headerQ.trim())}`)
  }

  // Extract video ID safely from router query, search params, or pathname
  let videoId = typeof id === 'string' && id !== '[id]' ? id : (Array.isArray(id) ? id[0] : null)
  if (typeof window !== 'undefined') {
    try {
      const searchParams = new URLSearchParams(window.location.search)
      const qId = searchParams.get('id') || searchParams.get('videoId')
      if (qId && qId !== '[id]') {
        videoId = qId
      } else {
        const parts = window.location.pathname.split('/').filter(Boolean)
        const lastPart = parts[parts.length - 1]
        if (lastPart && !lastPart.includes('[id]') && lastPart !== 'video') {
          videoId = lastPart.replace(/\.html$/, '')
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (videoId && typeof videoId === 'string') {
    videoId = videoId.replace(/\.html$/, '').trim()
    if (videoId.includes('[id]') || videoId === 'null' || videoId === 'undefined') videoId = null
  }

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

  useEffect(() => {
    if (!videoId) {
      setError('올바른 비디오 ID를 찾을 수 없습니다.')
      return
    }
    let mounted = true
    setLoading(true)
    setError(null)

    const fetchDetails = async () => {
      // 1. Try desktopAPI first
      let attempts = 0
      while (attempts < 10 && !(window?.desktopAPI && typeof window.desktopAPI.getVideo === 'function')) {
        attempts += 1
        await new Promise(r => setTimeout(r, 100))
      }

      if (window?.desktopAPI && typeof window.desktopAPI.getVideo === 'function') {
        try {
          const res = await window.desktopAPI.getVideo(videoId)
          if (!mounted) return
          if (res.ok && res.details) {
            setDetails({
              ...res.details,
              title: decodeHTMLEntities(res.details.title),
              description: decodeHTMLEntities(res.details.description)
            })
            setLoading(false)
            return
          }
        } catch (e) {
          console.warn('desktopAPI getVideo failed, trying proxy fallback', e)
        }
      }

      // 2. Direct browser fetch via YouTube Data API
      try {
        const data = await fetchYouTubeVideoDirect(videoId)
        if (!mounted) return
        if (data.ok && data.details) {
          setDetails({
            ...data.details,
            title: decodeHTMLEntities(data.details.title),
            description: decodeHTMLEntities(data.details.description)
          })
        } else {
          setError(data.error || '상세정보 불러오기 실패')
        }
      } catch (directErr) {
        console.warn('Direct video details fetch failed, attempting proxy fallback', directErr)
        try {
          const res = await fetch(getApiUrl(`/api/video?id=${encodeURIComponent(videoId)}`))
          const data = await res.json()
          if (!mounted) return
          if (data.ok && data.details) {
            setDetails({
              ...data.details,
              title: decodeHTMLEntities(data.details.title),
              description: decodeHTMLEntities(data.details.description)
            })
          } else {
            setError(data.error || '상세정보 불러오기 실패')
          }
        } catch (e) {
          if (!mounted) return
          setError('상세 정보를 불러올 수 없습니다. 인터넷 연결 상태를 확인해주세요.')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchDetails()
    return () => { mounted = false }
  }, [videoId])

  // helper: parse ISO 8601 duration PT#H#M#S
  function parseDurationISO(dur) {
    if (!dur) return 0
    const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!m) return 0
    const h = Number(m[1] || 0)
    const mm = Number(m[2] || 0)
    const s = Number(m[3] || 0)
    return h * 3600 + mm * 60 + s
  }

  function formatDurationSec(totalSec) {
    if (!totalSec) return '0:00'
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    const pad = (n) => String(n).padStart(2, '0')
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
    return `${m}:${pad(s)}`
  }

  function computeEstimatedSize() {
    const durSec = parseDurationISO(details?.duration) || 0
    if (!durSec) return null
    if (downloadType === 'audio') {
      const kbps = Number(audioBitrate) || 192
      const bytes = (kbps * 1000 / 8) * durSec
      const mb = bytes / (1024 * 1024)
      return mb
    }
    let videoKbps = 8000
    if (videoQuality === '1080p') videoKbps = 5000
    else if (videoQuality === '720p') videoKbps = 2500
    else if (videoQuality === '480p') videoKbps = 1000
    const audioKbps = 192
    const bytes = ((videoKbps + audioKbps) * 1000 / 8) * durSec
    return bytes / (1024 * 1024)
  }

  useEffect(() => {
    if (!details) return
    setDownloadSuccess(false)
    const v = computeEstimatedSize()
    setEstimSize(v ? Number(v.toFixed(1)) : null)
  }, [details, downloadType, audioFormat, audioBitrate, videoFormat, videoQuality])

  const startDownloadHandler = async () => {
    if (!details || downloading) return
    setDownloading(true)
    setDownloadPercent(1)
    setDownloadSuccess(false)

    const payload = {
      url: `https://www.youtube.com/watch?v=${details.videoId}`,
      kind: downloadType,
      quality: downloadType === 'audio' ? audioBitrate : videoQuality,
      format: downloadType === 'audio' ? audioFormat : videoFormat,
      title: details.title,
      id: details.videoId
    }

    if (typeof window !== 'undefined' && window.desktopAPI && typeof window.desktopAPI.startDownload === 'function') {
      try {
        const res = await window.desktopAPI.startDownload(payload)
        if (res && res.ok) {
          setDownloadPercent(100)
          setDownloadSuccess(true)
          setTimeout(() => setDownloadSuccess(false), 3500)
        }
      } catch (e) {
        alert(`다운로드 시작 중 오류 발생: ${String(e)}`)
      } finally {
        setDownloading(false)
      }
      return
    }

    // Web browser (Phone, Tablet, PC): Execute client-side direct download into device memory Blob
    try {
      await downloadClientSideDirect({
        url: payload.url,
        title: details.title,
        kind: downloadType,
        format: payload.format,
        onProgress: (percent, msg) => {
          setDownloadPercent(percent)
        }
      })
      setDownloadSuccess(true)
      setTimeout(() => setDownloadSuccess(false), 4500)
    } catch (e) {
      alert(`다운로드 중 오류가 발생했습니다: ${String(e)}`)
    } finally {
      setDownloading(false)
    }
  }

  const formatViewCount = (value) => {
    if (value === null || value === undefined || value === '') return '—'
    const num = Number(value)
    if (Number.isNaN(num)) return '—'
    return num.toLocaleString()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: 16 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#0f172a', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 15, color: '#64748b', fontWeight: 500 }}>영상 정보를 불러오는 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, borderRadius: 16, background: '#fff', border: '1px solid #fee2e2', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#991b1b', fontSize: 18 }}>불러오기 실패</h3>
        <p style={{ color: '#7f1d1d', fontSize: 14, margin: '0 0 20px 0' }}>{error}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>새로고침</button>
          <button className="btn btn-ghost" onClick={() => router.push('/')}>메인으로 돌아가기</button>
        </div>
      </div>
    )
  }

  if (!details) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>영상 정보가 존재하지 않습니다.</div>

  const url = `https://www.youtube.com/watch?v=${details.videoId}`
  const embedUrl = `https://www.youtube.com/embed/${details.videoId}?autoplay=1&rel=0`
  const durSec = parseDurationISO(details.duration)

  // Options Data for Custom Selects
  const audioFormatOptions = [
    { value: 'm4a', label: 'm4a (AAC - 권장)' },
    { value: 'mp3', label: 'mp3 (추출/변환)' },
    { value: 'webm', label: 'webm' },
    { value: 'opus', label: 'opus' },
  ]

  const audioBitrateOptions = [
    { value: 320, label: '320 kbps (최고 품질)' },
    { value: 256, label: '256 kbps (고품질)' },
    { value: 192, label: '192 kbps (표준)' },
    { value: 128, label: '128 kbps (절약)' },
  ]

  const videoFormatOptions = [
    { value: 'mp4', label: 'mp4 (MPEG-4 - 권장)' },
    { value: 'webm', label: 'webm' },
    { value: 'mkv', label: 'mkv' },
  ]

  const videoQualityOptions = [
    { value: 'highest', label: '최고 화질 (Highest)' },
    { value: '1080p', label: '1080p (Full HD)' },
    { value: '720p', label: '720p (HD)' },
    { value: '480p', label: '480p (SD)' },
  ]

  return (
    <div className="page-shell" style={{ padding: '16px 24px 48px 24px', height: '100vh', overflowY: 'auto', background: '#f8fafc' }}>
      <Head>
        <title>{details?.title ? `${details.title} - 매화 다운로더` : '매화 다운로더'}</title>
      </Head>
      {/* Chrome Top Navigation Bar with Quick Search */}
      <div className="app-chrome" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => { try { router.back() } catch (e) { router.push('/') } }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 10,
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid #e2e8f0',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease'
            }}
          >
            <span>←</span>
            <span>이전 화면</span>
          </button>

          <Link
            href="/"
            title="히어로 페이지로 이동"
            style={{
              textDecoration: 'none',
              fontSize: 18,
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.02em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer'
            }}
          >
            <span>MaeHwa Downloader</span>
          </Link>
        </div>

        {/* Quick Header Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 360px', maxWidth: 480 }}>
          <input
            type="text"
            value={headerQ}
            onChange={(e) => setHeaderQ(e.target.value)}
            placeholder="검색어 또는 유튜브 링크 입력"
            onKeyDown={(e) => { if (e.key === 'Enter') handleHeaderSearch(); }}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              outline: 'none',
              background: '#ffffff',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)'
            }}
          />
          <button
            onClick={handleHeaderSearch}
            style={{
              padding: '9px 16px',
              borderRadius: 10,
              background: '#0f172a',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            검색
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Main Video Hero / Player Card */}
        <div style={{ background: '#ffffff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)' }}>
          {!showPlayer ? (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', maxHeight: 460, background: '#090d16', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={details.thumbnails?.maxres?.url || details.thumbnails?.high?.url || details.thumbnails?.medium?.url || details.thumbnails?.default?.url}
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.88, filter: 'brightness(0.95)' }}
                alt="thumbnail"
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 100%)' }} />
              
              {/* Duration Badge */}
              {durSec > 0 && (
                <div style={{ position: 'absolute', right: 16, bottom: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                  {formatDurationSec(durSec)}
                </div>
              )}

              {/* Play Overlay Button */}
              <button
                onClick={() => setShowPlayer(true)}
                style={{
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '14px 24px',
                  borderRadius: 99,
                  background: 'rgba(255,255,255,0.95)',
                  color: '#0f172a',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
                  transition: 'transform 0.2s ease, background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <span>미리보기 재생</span>
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', maxHeight: 480, background: '#000' }}>
              <iframe
                src={embedUrl}
                title={details.title}
                style={{ width: '100%', height: '100%', border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div style={{ position: 'absolute', right: 16, top: 16, display: 'flex', gap: 8, zIndex: 10 }}>
                <button
                  onClick={() => setShowPlayer(false)}
                  style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.75)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  플레이어 닫기
                </button>
              </div>
            </div>
          )}

          {/* Video Title & Meta Stats Section */}
          <div style={{ padding: '24px 28px' }}>
            <h1 style={{ margin: '0 0 14px 0', fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>
              {decodeHTMLEntities(details.title)}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', color: '#64748b', fontSize: 14 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '6px 12px', borderRadius: 8, color: '#334155', fontWeight: 600 }}>
                <span style={{ color: '#64748b' }}>조회수</span>
                <span>{formatViewCount(details.viewCount)}회</span>
              </div>

              {details.likeCount && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '6px 12px', borderRadius: 8, color: '#334155', fontWeight: 600 }}>
                  <span style={{ color: '#64748b' }}>좋아요</span>
                  <span>{formatViewCount(details.likeCount)}개</span>
                </div>
              )}

              {details.publishedAt && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '6px 12px', borderRadius: 8, color: '#475569', fontWeight: 500 }}>
                  <span style={{ color: '#64748b' }}>게시일</span>
                  <span>{new Date(details.publishedAt).toLocaleDateString()}</span>
                </div>
              )}

              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: 'auto', color: '#2563eb', textDecoration: 'none', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <span>YouTube에서 보기</span>
              </a>
            </div>

            {/* Video Description Accordion */}
            {details.description && (
              <div style={{ marginTop: 18, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                <button
                  onClick={() => setShowDescription(!showDescription)}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span>{showDescription ? '접기' : '영상 설명 보기'}</span>
                </button>
                {showDescription && (
                  <div style={{ marginTop: 10, padding: 14, background: '#f8fafc', borderRadius: 10, fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 240, overflowY: 'auto' }}>
                    {decodeHTMLEntities(details.description)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Download Options Panel */}
        <div style={{ background: '#ffffff', borderRadius: 20, border: '1px solid #e2e8f0', padding: '28px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>다운로드 설정</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>원하는 포맷과 품질을 선택한 후 다운로드를 진행하세요.</p>
            </div>
            
            {estimSize && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 14px', borderRadius: 12, textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600, textTransform: 'uppercase' }}>예상 용량</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }}>약 {estimSize} MB</div>
              </div>
            )}
          </div>

          {/* Download Type Selector Tabs */}
          <div style={{ display: 'flex', gap: 8, background: '#f1f5f9', padding: 4, borderRadius: 12, marginBottom: 20 }}>
            <button
              onClick={() => setDownloadType('audio')}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: downloadType === 'audio' ? '#ffffff' : 'transparent',
                color: downloadType === 'audio' ? '#0f172a' : '#64748b',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: downloadType === 'audio' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              오디오
            </button>
            <button
              onClick={() => setDownloadType('video')}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: downloadType === 'video' ? '#ffffff' : 'transparent',
                color: downloadType === 'video' ? '#0f172a' : '#64748b',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: downloadType === 'video' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              비디오
            </button>
          </div>

          {/* Options Custom Dropdowns Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 28 }}>
            {downloadType === 'audio' ? (
              <>
                <CustomDropdown
                  label="오디오 포맷"
                  options={audioFormatOptions}
                  value={audioFormat}
                  onChange={(val) => setAudioFormat(val)}
                />
                <CustomDropdown
                  label="비트레이트 (품질)"
                  options={audioBitrateOptions}
                  value={audioBitrate}
                  onChange={(val) => setAudioBitrate(val)}
                />
              </>
            ) : (
              <>
                <CustomDropdown
                  label="비디오 포맷"
                  options={videoFormatOptions}
                  value={videoFormat}
                  onChange={(val) => setVideoFormat(val)}
                />
                <CustomDropdown
                  label="화질 선택"
                  options={videoQualityOptions}
                  value={videoQuality}
                  onChange={(val) => setVideoQuality(val)}
                />
              </>
            )}
          </div>

          {/* Action Download Button */}
          <button
            onClick={startDownloadHandler}
            disabled={downloading}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 14,
              border: 'none',
              background: downloading ? '#94a3b8' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 700,
              cursor: downloading ? 'not-allowed' : 'pointer',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <span>{downloading ? `다운로드 처리 중... (${downloadPercent}%)` : downloadType === 'audio' ? '오디오 다운로드 시작' : '비디오 다운로드 시작'}</span>
          </button>

          {/* Real-time Visual Progress Console */}
          {downloading && (
            <div style={{ marginTop: 16, background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                <span>{downloadType === 'audio' ? '오디오 파일 추출 및 다운로드 중...' : '고화질 비디오 병합 및 다운로드 중...'}</span>
                <span style={{ color: '#2563eb', fontWeight: 800 }}>{downloadPercent}%</span>
              </div>
              <div style={{ width: '100%', height: 10, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${downloadPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                    borderRadius: 99,
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#64748b', textAlign: 'right' }}>
                {downloadPercent < 10 ? '서버 연결 및 미디어 소스 탐색 중...' :
                 downloadPercent < 90 ? 'yt-dlp 미디어 스트림 다운로드 중...' :
                 downloadPercent < 98 ? 'FFmpeg 오디오/비디오 병합 처리 중...' :
                 '파일 전송 준비 중...'}
              </div>
            </div>
          )}

        </div>

        <Footer />
      </div>

      {/* Top Right Toast Notification */}
      {downloadSuccess && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            background: '#ffffff',
            border: '1px solid #bbf7d0',
            borderRadius: 16,
            padding: '14px 20px',
            boxShadow: '0 20px 35px -5px rgba(15, 23, 42, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            animation: 'toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <style>{`
            @keyframes toastSlideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>다운로드 요청 완료</div>
            <div style={{ fontSize: 13, color: '#15803d', marginTop: 2 }}>파일 변환 후 브라우저 다운로드가 시작되었습니다.</div>
          </div>
          <button
            onClick={() => setDownloadSuccess(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 16,
              padding: '0 4px',
              marginLeft: 8
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

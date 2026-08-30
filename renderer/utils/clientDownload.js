/**
 * MaeHwa Downloader Engine
 * Uses backend proxy (yt-dlp + FFmpeg) for 100% reliable high-quality downloads.
 */

import { getApiUrl } from './api'

export async function downloadClientSideDirect({ url, title, kind, format, quality, onProgress }) {
  const safeTitle = (title || 'video').replace(/[\\/:*?"<>|]/g, '_').trim()
  const fileExt = format || (kind === 'audio' ? 'm4a' : 'mp4')

  if (onProgress) onProgress(10, '다운로드 요청 준비 중...')

  const downloadUrl = getApiUrl(`/api/download?url=${encodeURIComponent(url)}&kind=${kind}&format=${fileExt}&quality=${quality || 'highest'}&title=${encodeURIComponent(safeTitle)}`)

  if (onProgress) onProgress(50, '서버에서 파일 생성 및 다운로드 전송 시작...')

  // Trigger universal cross-device download (mobile safari/chrome & desktop)
  const a = document.createElement('a')
  a.href = downloadUrl
  a.download = `${safeTitle}.${fileExt}`
  a.target = '_self'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    try { document.body.removeChild(a) } catch (e) {}
  }, 1000)

  if (onProgress) onProgress(100, '다운로드가 성공적으로 시작되었습니다!')
  return { ok: true }
}

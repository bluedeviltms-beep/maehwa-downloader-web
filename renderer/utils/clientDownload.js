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

  if (onProgress) onProgress(50, '서버에서 고속 미디어 파일 수신 시작...')

  // Prevent main page URL redirection by using hidden iframe download trigger
  let iframe = document.getElementById('maehwa_hidden_download_iframe')
  if (!iframe) {
    iframe = document.createElement('iframe')
    iframe.id = 'maehwa_hidden_download_iframe'
    iframe.style.display = 'none'
    document.body.appendChild(iframe)
  }
  iframe.src = downloadUrl

  if (onProgress) onProgress(100, '다운로드가 성공적으로 시작되었습니다!')
  return { ok: true }
}

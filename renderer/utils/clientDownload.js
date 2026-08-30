/**
 * MaeHwa Downloader Engine
 * Uses local backend proxy (yt-dlp + FFmpeg) for 100% reliable high-quality downloads.
 */

import { getApiUrl } from './api'

export async function downloadClientSideDirect({ url, title, kind, format, quality, onProgress }) {
  const safeTitle = (title || 'video').replace(/[\\/:*?"<>|]/g, '_').trim()
  const fileExt = format || (kind === 'audio' ? 'm4a' : 'mp4')

  if (onProgress) onProgress(10, '다운로드 요청 준비 중...')

  const downloadUrl = getApiUrl(`/api/download?url=${encodeURIComponent(url)}&kind=${kind}&format=${fileExt}&quality=${quality || 'highest'}&title=${encodeURIComponent(safeTitle)}`)

  if (onProgress) onProgress(40, '미디어 병합 및 스트리밍 다운로드 시작...')

  // Trigger silent browser download via hidden iframe
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

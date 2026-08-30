const { z } = require('zod');

// Helper for validating YouTube URLs (hostname-based)
function _isYouTubeUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com' || host.endsWith('youtube.com');
  } catch (e) {
    return false;
  }
}

const youtubeSearchSchema = z.union([
  z.string().min(1).max(300),
  z.object({
    q: z.string().min(1).max(300),
    duration: z.enum(['any', 'short', 'medium', 'long']).optional(),
    order: z.enum(['relevance', 'date', 'viewCount', 'rating', 'title', 'videoCount']).optional(),
    maxResults: z.number().int().min(1).max(50).optional()
  })
]);

const downloadStartSchema = z.object({
  url: z.string().min(1).refine(_isYouTubeUrl, { message: 'Only YouTube URLs are supported' }),
  kind: z.enum(['audio', 'video']).optional().default('audio'),
  // allow either named quality strings (video) or numeric bitrate values (audio)
  quality: z.union([
    z.enum(['high', 'medium', 'low', '1080p', '720p', '480p', 'highest']),
    z.number().int().nonnegative()
  ]).optional().default('high'),
  // be permissive about format strings coming from renderer (allow common values or any non-empty string)
  format: z.union([z.string().min(1), z.null()]).optional().nullable(),
  outputDir: z.string().optional().nullable()
});

module.exports = {
  youtubeSearchSchema,
  downloadStartSchema
};

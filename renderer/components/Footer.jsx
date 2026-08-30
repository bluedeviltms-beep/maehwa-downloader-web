import Link from 'next/link'

export default function Footer() {
  return (
    <footer
      style={{
        marginTop: 48,
        paddingTop: 32,
        paddingBottom: 36,
        borderTop: '1px solid #e2e8f0',
        color: '#64748b',
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justify: 'space-between',
          flexWrap: 'wrap',
          gap: 20
        }}
      >
        <div>
          <Link
            href="/"
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: '#0f172a',
              textDecoration: 'none',
              letterSpacing: '-0.01em'
            }}
          >
            MaeHwa Downloader
          </Link>
          <div style={{ marginTop: 6, color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
            매화 스튜디오 | Email:{' '}
            <a href="mailto:maehwastudio.official@gmail.com" style={{ color: '#2563eb', textDecoration: 'none' }}>
              maehwastudio.official@gmail.com
            </a>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          paddingTop: 16,
          borderTop: '1px solid #f1f5f9',
          fontSize: 12,
          color: '#94a3b8'
        }}
      >
        <div>Copyright © 2026 매화 Studio. 모든 권리 보유.</div>
        <div>v1.0.1</div>
      </div>
    </footer>
  )
}


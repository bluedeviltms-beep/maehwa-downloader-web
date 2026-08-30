import Head from 'next/head'
import '../styles/global.css'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>매화 다운로더</title>
        <link rel="icon" href="/icon.ico" sizes="any" />
        <link rel="shortcut icon" href="/icon.ico" />
        <link rel="apple-touch-icon" href="/icon.ico" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}


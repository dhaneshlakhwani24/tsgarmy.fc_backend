import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

// Initialize Sentry only if DSN is provided
const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim()
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 1.0,
    integrations: [
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  })
}

const SentryApp = sentryDsn ? Sentry.withProfiler(App) : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SentryApp />
      <Toaster position="top-right" />
    </BrowserRouter>
  </StrictMode>,
)

import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import axios from 'axios'
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import './App.css'
import { branding, fallbackAchievements } from './data/content'
const FireBackground = lazy(() => import('./components/FireBackground'))

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin)
const ACHIEVEMENTS_API_URL = import.meta.env.VITE_ACHIEVEMENTS_API_URL || ''
const RESOLVED_ACHIEVEMENTS_API_URL = ACHIEVEMENTS_API_URL || `${API_URL}/api/achievements`
const PLAYERS_REFRESH_MS = Number(import.meta.env.VITE_PLAYERS_REFRESH_MS || 500)
const SCHEDULES_REFRESH_MS = Number(import.meta.env.VITE_SCHEDULES_REFRESH_MS || 500)
const fallbackAchievementRows = fallbackAchievements.map((summary, index) => ({
  id: `fallback-${index}`,
  date: '-',
  placement: '-',
  tournament: summary,
}))

const CACHE_KEYS = {
  schedules: 'tsg_cache_schedules_v1',
  achievements: 'tsg_cache_achievements_v1',
  players: 'tsg_cache_players_v1',
}

const detectDataSaver = () => {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!conn) return false
  return Boolean(conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g')
}

const detectAutoPerformanceMode = () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion) return true

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (conn?.saveData) return true
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return true

  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return true
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true

  return false
}

const readCachedJson = (key, fallbackValue) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallbackValue
    return JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

const writeCachedJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

const scheduleStatusPriority = {
  upcoming: 0,
  ongoing: 1,
  completed: 2,
}

const scheduleStatusLabel = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
}

const toAbsoluteUrl = (resourcePath) => {
  if (!resourcePath) {
    return ''
  }

  if (resourcePath.startsWith('http://') || resourcePath.startsWith('https://')) {
    return resourcePath
  }

  if (resourcePath.startsWith('/')) {
    return `${API_URL}${resourcePath}`
  }

  return resourcePath
}

const resolvePlayerImage = ({ player, toAbsoluteImageUrl, performanceMode, dataSaver }) => {
  if (!player) return branding.secondaryLogo

  if (performanceMode || dataSaver) {
    return toAbsoluteImageUrl(player.imagePathSm || player.imagePathMd || player.imagePath || player.photo)
  }

  return toAbsoluteImageUrl(player.imagePath || player.photo)
}

const toExternalUrl = (value, fallback = '') => {
  const candidate = String(value || fallback || '').trim()
  if (!candidate) return '#'
  if (/^https?:\/\//i.test(candidate)) return candidate
  return `https://${candidate.replace(/^\/+/, '')}`
}

function Header({
  isNavHidden,
  isMenuOpen,
  setIsMenuOpen,
  onPrefetchSchedule,
  onPrefetchAchievements,
  feedbackOpen,
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const refreshToHome = (event) => {
    event.preventDefault()
    window.location.assign('/home')
  }

  return (
    <header className={`site-header ${isNavHidden ? 'nav-hidden' : ''}`}>
      <Link className="brand-block" to="/home" aria-label="Go to home" onClick={refreshToHome}>
        <span className="brand-title">iQOO | OG x TSG</span>
      </Link>
      <button
        type="button"
        className="menu-toggle"
        onClick={() => setIsMenuOpen((prev) => !prev)}
        aria-label="Toggle navigation"
        aria-expanded={isMenuOpen}
      >
        ☰
      </button>
      <nav className={isMenuOpen ? 'open' : ''}>
        <NavLink
          to="/home"
          onClick={() => {
            setIsMenuOpen(false)
            setIsMoreOpen(false)
            setTimeout(() => document.getElementById('players')?.scrollIntoView({ behavior: 'smooth' }), 200)
          }}
          onMouseEnter={onPrefetchSchedule}
        >Our Players</NavLink>
        <NavLink to="/home/schedule" onClick={() => { setIsMenuOpen(false); setIsMoreOpen(false) }} onMouseEnter={onPrefetchSchedule}>Schedule</NavLink>
        <div className="more-dropdown">
          <button
            type="button"
            className="more-toggle"
            aria-label="Open more options"
            aria-expanded={isMoreOpen}
            onClick={() => setIsMoreOpen((prev) => !prev)}
            onMouseEnter={onPrefetchAchievements}
          >
            <svg className="more-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {isMoreOpen && (
            <div className="more-menu">
              <NavLink to="/tournaments" onClick={() => { setIsMoreOpen(false); setIsMenuOpen(false) }}>Tournaments</NavLink>
              <NavLink to="/fanconnect" onClick={() => { setIsMoreOpen(false); setIsMenuOpen(false) }}>Fan Connect</NavLink>
              <NavLink to="/giveaways" onClick={() => { setIsMoreOpen(false); setIsMenuOpen(false) }}>Contest & Giveaways</NavLink>
              <NavLink to="/collaborations" onClick={() => { setIsMoreOpen(false); setIsMenuOpen(false) }}>Collaborations</NavLink>
              {feedbackOpen && <NavLink to="/feedback" onClick={() => { setIsMoreOpen(false); setIsMenuOpen(false) }}>Feedback</NavLink>}
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}

function FeedbackPage({ feedbackStatus, refreshFeedbackStatus }) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    instagramUsername: '',
    email: '',
    description: '',
  })
  const [file, setFile] = useState(null)

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const payload = new FormData()
      payload.append('name', form.name)
      payload.append('instagramUsername', form.instagramUsername)
      payload.append('email', form.email)
      payload.append('description', form.description)
      if (file) {
        payload.append('file', file)
      }

      await axios.post(`${API_URL}/api/feedback/submit`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setDone(true)
      setForm({ name: '', instagramUsername: '', email: '', description: '' })
      setFile(null)
      await refreshFeedbackStatus()
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to submit feedback right now.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <section className="content-section" style={{ paddingTop: '6.5rem' }}>
        <h3>Thank You</h3>
        <p>Thanks for submitting. We will get back to you soon.</p>
      </section>
    )
  }

  if (!feedbackStatus.enabled) {
    return (
      <section className="content-section" style={{ paddingTop: '6.5rem' }}>
        <h3>Feedback</h3>
        <p>Feedback is currently closed.</p>
      </section>
    )
  }

  return (
    <section className="content-section" style={{ paddingTop: '6.5rem' }}>
      <h3>Feedback</h3>
      <form className="feedback-form" onSubmit={submit}>
        <input name="name" value={form.name} onChange={onChange} placeholder="Name" required />
        <input name="instagramUsername" value={form.instagramUsername} onChange={onChange} placeholder="Instagram username (optional)" />
        <input type="email" name="email" value={form.email} onChange={onChange} placeholder="Email" required />
        <textarea
          name="description"
          value={form.description}
          onChange={onChange}
          placeholder="Description (max 350 words)"
          rows={7}
          required
        />
        <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        {error && <p className="feedback-error">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Feedback'}</button>
      </form>
    </section>
  )
}

function InfoPage() {
  return (
    <section className="content-section soon-page" style={{ paddingTop: '6.5rem' }}>
      <div className="soon-center">
        <h2 className="soon-primary">COMMING SOON ....</h2>
        <p className="soon-secondary">STAY TUNED !!</p>
      </div>
    </section>
  )
}

function AchievementTable({ achievements }) {
  return (
    <div className="table-wrap">
      <table className="site-table achievements-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Placement</th>
            <th>Tournament / Result</th>
          </tr>
        </thead>
        <tbody>
          {achievements.map((item) => (
            <tr key={item.id}>
              <td>{item.date}</td>
              <td>{item.placement}</td>
              <td>{item.tournament}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableSkeleton({ rows = 4, cols = 5 }) {
  return (
    <div className="table-wrap">
      <div className="table-skeleton" aria-hidden="true">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div className="skeleton-row" key={`r-${rowIndex}`}>
            {Array.from({ length: cols }).map((__, colIndex) => (
              <span className="skeleton-line" key={`c-${colIndex}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayerCarouselSkeleton() {
  return (
    <div className="players-skeleton" aria-hidden="true">
      <span className="skeleton-title" />
      <div className="players-skeleton-row">
        <span className="skeleton-card mini" />
        <span className="skeleton-card center" />
        <span className="skeleton-card mini" />
      </div>
    </div>
  )
}

function ScheduleTable({ title, rows }) {
  return (
    <section className="content-section">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p>No tournaments in this section.</p>
      ) : (
        <div className="table-wrap">
          <table className="site-table schedule-table">
            <thead>
              <tr>
                <th>Tournament Name</th>
                <th>TO</th>
                <th>Livestream</th>
                <th>Live Updates (Beta)</th>
                <th>Final Point Table</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item._id}>
                  <td>{item.tournamentName || item.title}</td>
                  <td>{Array.isArray(item.organizers) && item.organizers.length ? item.organizers.join(', ') : '-'}</td>
                  <td>
                    {item.livestreamUrl ? (
                      <a href={toExternalUrl(item.livestreamUrl)} target="_blank" rel="noopener noreferrer">Open</a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {item.status === 'ongoing' && item.liveUpdatesPath ? (
                      <Link to={item.liveUpdatesPath}>Live (Beta)</Link>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {item.finalPointTable?.filePath ? (
                      <>
                        <a href={toAbsoluteUrl(item.finalPointTable.filePath)} target="_blank" rel="noreferrer">View</a>{' '}
                        <a href={toAbsoluteUrl(item.finalPointTable.filePath)} download target="_blank" rel="noreferrer">Download</a>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function LiveUpdatesPage() {
  const { slug } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [schedule, setSchedule] = useState(null)

  useEffect(() => {
    let mounted = true
    const getLiveUpdates = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/schedules/liveupdates/${slug}`)
        if (!mounted) return
        setSchedule(response.data.data)
        setError('')
      } catch (err) {
        if (!mounted) return
        setError(err?.response?.data?.message || 'Live updates are not available')
        setSchedule(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    getLiveUpdates()
    let sse = null
    try {
      sse = new EventSource(`${API_URL}/api/events`)
      sse.addEventListener('schedules', getLiveUpdates)
      sse.onerror = () => sse?.close()
    } catch {}

    return () => {
      mounted = false
      sse?.close()
    }
  }, [slug])

  return (
    <section className="content-section" style={{ paddingTop: '6.5rem' }}>
      <h3>Live Updates</h3>
      <p><Link to="/schedule">Back to schedule</Link></p>
      {loading && <p>Loading live feed...</p>}
      {!loading && error && <p>{error}</p>}
      {!loading && schedule && (
        <>
          <p>
            <strong>{schedule.tournamentName || schedule.title}</strong>
          </p>
          <p>Playing 4: {Array.isArray(schedule.playing4) && schedule.playing4.length ? schedule.playing4.join(', ') : 'Not updated yet'}</p>
          <div className="table-wrap">
            <table className="site-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Map</th>
                  <th>Placement</th>
                  <th>Kills</th>
                  <th>Points</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(schedule.liveUpdates || []).map((row) => (
                  <tr key={`match-${row.matchNumber}`}>
                    <td>{row.matchNumber}</td>
                    <td>{row.mapName || '-'}</td>
                    <td>{row.placement || '-'}</td>
                    <td>{row.kills ?? 0}</td>
                    <td>{row.points ?? 0}</td>
                    <td>{row.totalPoints ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function HomePage({
  heroBackgroundStyle,
  players,
  playersLoading,
  activeIdx,
  setActiveIdx,
  touchStartRef,
  toAbsoluteImageUrl,
  achievements,
  performanceMode,
  dataSaver,
  achievementsLoading,
}) {
  const prevPlayer = () => setActiveIdx((i) => (i - 1 + players.length) % players.length)
  const nextPlayer = () => setActiveIdx((i) => (i + 1) % players.length)

  return (
    <>
      <section id="home" className="hero-section" style={heroBackgroundStyle} aria-label="Home hero" />

      <section id="players" className="content-section">
        {!playersLoading && players.length > 1 && (
          <>
            <button className="players-car-arrow is-prev" onClick={prevPlayer} aria-label="Previous player">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button className="players-car-arrow is-next" onClick={nextPlayer} aria-label="Next player">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
        <div className="players-car-wrap">
          <div className="players-car-header">
            <div className="players-copy">
              <h3>Our Players</h3>
            </div>
          </div>

          {playersLoading && <PlayerCarouselSkeleton />}
          {!playersLoading && players.length === 0 && <p className="players-status">No players yet — add players from admin panel.</p>}

          {!playersLoading && players.length > 0 && (
            <>
              <div
                className="players-car-stage"
                onTouchStart={(e) => { touchStartRef.current = e.touches[0].clientX }}
                onTouchEnd={(e) => {
                  const diff = touchStartRef.current - e.changedTouches[0].clientX
                  if (diff > 48) setActiveIdx((i) => (i + 1) % players.length)
                  else if (diff < -48) setActiveIdx((i) => (i - 1 + players.length) % players.length)
                }}
              >
                {players.length > 4 && (() => {
                  const farLeftIdx = (activeIdx - 2 + players.length) % players.length
                  const flp = players[farLeftIdx]
                  return (
                    <article
                      key={`far-left-${flp._id || flp.name}`}
                      className="player-card is-mini is-mini-far"
                      onClick={() => setActiveIdx(farLeftIdx)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Go to: ${flp.name}`}
                      onKeyDown={(e) => e.key === 'Enter' && setActiveIdx(farLeftIdx)}
                    >
                      <div className="player-card-media">
                        <img
                          src={resolvePlayerImage({ player: flp, toAbsoluteImageUrl, performanceMode, dataSaver })}
                          alt={flp.name}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { e.currentTarget.src = branding.secondaryLogo }}
                        />
                      </div>
                      <p className="mini-name">{flp.name}</p>
                    </article>
                  )
                })()}

                {players.length > 1 && (() => {
                  const lp = players[(activeIdx - 1 + players.length) % players.length]
                  return (
                    <article
                      key={`left-${lp._id || lp.name}`}
                      className="player-card is-mini"
                      onClick={prevPlayer}
                      role="button"
                      tabIndex={0}
                      aria-label={`Previous: ${lp.name}`}
                      onKeyDown={(e) => e.key === 'Enter' && prevPlayer()}
                    >
                      <div className="player-card-media">
                        <img
                          src={resolvePlayerImage({ player: lp, toAbsoluteImageUrl, performanceMode, dataSaver })}
                          alt={lp.name}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { e.currentTarget.src = branding.secondaryLogo }}
                        />
                      </div>
                      <p className="mini-name">{lp.name}</p>
                    </article>
                  )
                })()}

                {(() => {
                  const player = players[activeIdx]
                  return (
                    <article className="player-card is-center" key={`center-${activeIdx}`}>
                      <div className="player-card-media">
                        <img
                          src={resolvePlayerImage({ player, toAbsoluteImageUrl, performanceMode, dataSaver })}
                          alt={player.name}
                          loading="eager"
                          decoding="async"
                          onError={(e) => { e.currentTarget.src = branding.secondaryLogo }}
                        />
                        {player.isLive && (
                          player.liveUrl ? (
                            <a className="player-live-badge" href={player.liveUrl} target="_blank" rel="noreferrer" aria-label={`Watch ${player.name} live`}>
                              <span className="live-dot" />
                              Live Now
                            </a>
                          ) : (
                            <div className="player-live-badge">
                              <span className="live-dot" />
                              Live Now
                            </div>
                          )
                        )}
                        <span className="player-role-pill">{player.role}</span>
                      </div>
                      <div className="player-card-body">
                        <div className="player-card-heading">
                          <h4>{player.name}</h4>
                        </div>
                        {player.description && <p className="player-description">{player.description}</p>}
                        <div className="player-social-links" aria-label={`${player.name} social links`}>
                          <a
                            className="player-social-link"
                            href={toExternalUrl(player.instagramUrl, 'https://www.instagram.com/tsgarmy.fc')}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`${player.name} Instagram`}
                            onClick={(event) => { event.stopPropagation(); event.preventDefault(); window.open(event.currentTarget.href, '_blank'); }}
                            onTouchStart={(event) => event.stopPropagation()}
                            onTouchEnd={(event) => event.stopPropagation()}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
                              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
                              <circle cx="17" cy="7" r="1.2" fill="currentColor" />
                            </svg>
                          </a>
                          <a
                            className="player-social-link"
                            href={toExternalUrl(player.youtubeUrl, 'https://www.youtube.com/@TSGArmy')}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`${player.name} YouTube`}
                            onClick={(event) => { event.stopPropagation(); event.preventDefault(); window.open(event.currentTarget.href, '_blank'); }}
                            onTouchStart={(event) => event.stopPropagation()}
                            onTouchEnd={(event) => event.stopPropagation()}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path d="M21.2 8.2a2.8 2.8 0 0 0-2-2c-1.8-.5-9.4-.5-9.4-.5s-7.6 0-9.4.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 0 12a29 29 0 0 0 .4 3.8 2.8 2.8 0 0 0 2 2c1.8.5 9.4.5 9.4.5s7.6 0 9.4-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 24 12a29 29 0 0 0-.8-3.8ZM9.6 15.3V8.7L15.8 12l-6.2 3.3Z" fill="currentColor" />
                            </svg>
                          </a>
                        </div>
                      </div>
                    </article>
                  )
                })()}

                {players.length > 1 && (() => {
                  const rp = players[(activeIdx + 1) % players.length]
                  return (
                    <article
                      key={`right-${rp._id || rp.name}`}
                      className="player-card is-mini"
                      onClick={nextPlayer}
                      role="button"
                      tabIndex={0}
                      aria-label={`Next: ${rp.name}`}
                      onKeyDown={(e) => e.key === 'Enter' && nextPlayer()}
                    >
                      <div className="player-card-media">
                        <img
                          src={resolvePlayerImage({ player: rp, toAbsoluteImageUrl, performanceMode, dataSaver })}
                          alt={rp.name}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { e.currentTarget.src = branding.secondaryLogo }}
                        />
                      </div>
                      <p className="mini-name">{rp.name}</p>
                    </article>
                  )
                })()}

                {players.length > 4 && (() => {
                  const farRightIdx = (activeIdx + 2) % players.length
                  const frp = players[farRightIdx]
                  return (
                    <article
                      key={`far-right-${frp._id || frp.name}`}
                      className="player-card is-mini is-mini-far"
                      onClick={() => setActiveIdx(farRightIdx)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Go to: ${frp.name}`}
                      onKeyDown={(e) => e.key === 'Enter' && setActiveIdx(farRightIdx)}
                    >
                      <div className="player-card-media">
                        <img
                          src={resolvePlayerImage({ player: frp, toAbsoluteImageUrl, performanceMode, dataSaver })}
                          alt={frp.name}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { e.currentTarget.src = branding.secondaryLogo }}
                        />
                      </div>
                      <p className="mini-name">{frp.name}</p>
                    </article>
                  )
                })()}
              </div>

              {players.length > 1 && (
                <div className="players-car-dots" role="tablist">
                  {players.map((player, i) => (
                    <button
                      key={player._id || i}
                      className={`car-dot ${i === activeIdx ? 'active' : ''}`}
                      onClick={() => setActiveIdx(i)}
                      aria-label={`Player ${i + 1}`}
                      aria-selected={i === activeIdx}
                      role="tab"
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section id="achievements" className="content-section">
        <h3>Achievements</h3>
        {achievementsLoading ? <TableSkeleton rows={5} cols={3} /> : <AchievementTable achievements={achievements.slice(0, 10)} />}
        <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'flex-start' }}>
          <Link to="/achievement" className="player-link" style={{ padding: '0.4rem 0.8rem' }}>More</Link>
        </div>
      </section>
    </>
  )
}

function AchievementsPage({ achievements, achievementsLoading }) {
  return (
    <section className="content-section" style={{ paddingTop: '6.5rem' }}>
      <h3>All Achievements</h3>
      {achievementsLoading ? <TableSkeleton rows={8} cols={3} /> : <AchievementTable achievements={achievements} />}
    </section>
  )
}

function SchedulePage({ schedules }) {
  const [now, setNow] = useState(new Date())
  const dayDateText = now.toLocaleDateString([], {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timeText = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const sorted = [...schedules].sort((first, second) => {
    const statusOrder = (scheduleStatusPriority[first.status] ?? 999) - (scheduleStatusPriority[second.status] ?? 999)
    if (statusOrder !== 0) {
      return statusOrder
    }

    const firstDate = `${first.eventDate || ''} ${first.eventTime || ''}`
    const secondDate = `${second.eventDate || ''} ${second.eventTime || ''}`
    return firstDate.localeCompare(secondDate)
  })

  const groups = {
    ongoing: sorted.filter((item) => item.status === 'ongoing'),
    upcoming: sorted.filter((item) => item.status === 'upcoming'),
    completed: sorted.filter((item) => item.status === 'completed'),
  }

  return (
    <>
      <section className="content-section schedule-overview">
        <div className="schedule-overview-top">
          <h3 className="schedule-overview-heading">Schedule</h3>
          <div className="schedule-now" aria-label="Current date and time">
            <p className="schedule-now-date">{dayDateText}</p>
            <p className="schedule-now-time">{timeText}</p>
          </div>
        </div>
      </section>
      {Object.keys(groups).map((statusKey) => (
        <ScheduleTable key={statusKey} title={scheduleStatusLabel[statusKey]} rows={groups[statusKey]} />
      ))}
    </>
  )
}

function FooterBar() {
  return (
    <footer className="site-footer" aria-label="Site footer">
      <p className="site-footer-copy">Made with ❤️</p>
      <div className="site-footer-socials" aria-label="Social links">
        <a className="site-footer-social-link" href="https://www.instagram.com/dhaneshlakhwani" target="_blank" rel="noreferrer">
          <span className="site-footer-insta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="17" cy="7" r="1.2" fill="currentColor" />
            </svg>
          </span>
          <span>@dhaneshlakhwani</span>
        </a>
        <span className="site-footer-separator" aria-hidden="true">x</span>
        <a className="site-footer-social-link" href="https://www.instagram.com/tsgarmy.fc" target="_blank" rel="noreferrer">
          <span className="site-footer-insta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="17" cy="7" r="1.2" fill="currentColor" />
            </svg>
          </span>
          <span>@tsgarmy.fc</span>
        </a>
      </div>
    </footer>
  )
}

function App() {
  const [schedules, setSchedules] = useState(() => readCachedJson(CACHE_KEYS.schedules, []))
  const [achievements, setAchievements] = useState(() => readCachedJson(CACHE_KEYS.achievements, fallbackAchievementRows))
  const [players, setPlayers] = useState(() => readCachedJson(CACHE_KEYS.players, []))
  const [playersLoading, setPlayersLoading] = useState(true)
  const [achievementsLoading, setAchievementsLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const touchStartRef = useRef(0)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [showIntro, setShowIntro] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isNavHidden, setIsNavHidden] = useState(false)
  const [isDataSaver, setIsDataSaver] = useState(detectDataSaver())
  const [performanceMode, setPerformanceMode] = useState(detectAutoPerformanceMode())
  const [dataBannerHidden, setDataBannerHidden] = useState(() => localStorage.getItem('tsg_data_banner_hidden') === '1')
  const [feedbackStatus, setFeedbackStatus] = useState({
    enabled: false,
  })

  useEffect(() => {
    const introTimer = setTimeout(() => {
      setShowIntro(false)
    }, 2500)

    return () => clearTimeout(introTimer)
  }, [])

  useEffect(() => {
    let lastY = window.scrollY

    const onScroll = () => {
      const currentY = window.scrollY
      const shouldHide = currentY > lastY && currentY > 80
      setIsNavHidden(shouldHide)
      lastY = currentY
    }

    window.addEventListener('scroll', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (!conn?.addEventListener) return undefined
    const handleChange = () => {
      setIsDataSaver(detectDataSaver())
      setPerformanceMode(detectAutoPerformanceMode())
    }
    conn.addEventListener('change', handleChange)
    return () => conn.removeEventListener('change', handleChange)
  }, [])

  const getFeedbackStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/feedback/public-status`)
      setFeedbackStatus(response.data.data || { enabled: false })
    } catch {
      setFeedbackStatus({ enabled: false })
    }
  }

  const getSchedules = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/schedules`)
      const nextSchedules = response.data.data || []
      setSchedules(nextSchedules)
      writeCachedJson(CACHE_KEYS.schedules, nextSchedules)
    } catch {
      setSchedules(readCachedJson(CACHE_KEYS.schedules, []))
    }
    setScheduleLoading(false)
  }

  useEffect(() => {
    getSchedules()
    getFeedbackStatus()
  }, [])

  useEffect(() => {
    const scheduleTimer = window.setInterval(() => {
      getSchedules()
    }, SCHEDULES_REFRESH_MS)

    const refreshOnFocus = () => {
      getSchedules()
    }

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      window.clearInterval(scheduleTimer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [])

  const getAchievements = async () => {
    try {
      const response = await axios.get(RESOLVED_ACHIEVEMENTS_API_URL)

      if (Array.isArray(response.data?.data) && response.data.data.length > 0) {
          const normalizedRows = response.data.data
            .map((item, index) => ({
              id: `${item.date || 'na'}-${item.tournament || 'result'}-${index}`,
              date: item.date || '-',
              placement: item.placement || '-',
              tournament: item.tournament || '-',
            }))
            .sort((first, second) => {
              const firstDate = Date.parse(first.date)
              const secondDate = Date.parse(second.date)

              if (Number.isNaN(firstDate) && Number.isNaN(secondDate)) {
                return 0
              }

              if (Number.isNaN(firstDate)) {
                return 1
              }

              if (Number.isNaN(secondDate)) {
                return -1
              }

              return secondDate - firstDate
            })

          setAchievements(normalizedRows)
          writeCachedJson(CACHE_KEYS.achievements, normalizedRows)
          return
        }

        if (Array.isArray(response.data?.summaries) && response.data.summaries.length > 0) {
          const rows = response.data.summaries.map((summary, index) => ({
              id: `summary-${index}`,
              date: '-',
              placement: '-',
              tournament: summary,
            }))
          setAchievements(rows)
          writeCachedJson(CACHE_KEYS.achievements, rows)
          return
        }

        if (Array.isArray(response.data) && response.data.length > 0) {
          const rows = response.data.map((summary, index) => ({
              id: `raw-${index}`,
              date: '-',
              placement: '-',
              tournament: summary,
            }))
          setAchievements(rows)
          writeCachedJson(CACHE_KEYS.achievements, rows)
          return
        }
    } catch {
      setAchievements(readCachedJson(CACHE_KEYS.achievements, fallbackAchievementRows))
    } finally {
      setAchievementsLoading(false)
    }
  }

  useEffect(() => {
    getAchievements()
  }, [])

  useEffect(() => {
    let isMounted = true

    const normalizePlayer = (player) => ({
      ...player,
      name: player.name || 'Unknown Player',
      role: player.role || 'Player',
      description: player.description || 'Profile update coming soon.',
      instagramUrl: player.instagramUrl || 'https://www.instagram.com/tsgarmy.fb',
      youtubeUrl: player.youtubeUrl || 'https://www.youtube.com/@TSGArmy',
      isLive: player.isLive || false,
      liveUrl: player.liveUrl || '',
      rank: player.rank || null,
    })

    const getPlayers = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/players`)
        const apiPlayers = Array.isArray(response.data?.data) ? response.data.data : []

        if (!isMounted) {
          return
        }

        const ranked = apiPlayers.filter(p => p.rank >= 1 && p.rank <= 5)
        const displayPlayers = ranked.length > 0 ? ranked : apiPlayers
        if (displayPlayers.length > 0) {
          const normalizedPlayers = displayPlayers.map(normalizePlayer)
          setPlayers(normalizedPlayers)
          const liveIdx = normalizedPlayers.findIndex(p => p.isLive)
          if (liveIdx !== -1) {
            setActiveIdx(liveIdx)
          }
        } else {
          setPlayers([])
        }

        writeCachedJson(CACHE_KEYS.players, displayPlayers.map(normalizePlayer))
      } catch {
        if (!isMounted) {
          return
        }

        setPlayers(readCachedJson(CACHE_KEYS.players, []))
      } finally {
        if (isMounted) {
          setPlayersLoading(false)
        }
      }
    }

    getPlayers()
    const refreshTimer = window.setInterval(getPlayers, PLAYERS_REFRESH_MS)

    const refreshOnFocus = () => {
      getPlayers()
      getSchedules()
      getAchievements()
    }

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    let sse = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 10
    const reconnectDelay = (attempt) => Math.min(1000 * Math.pow(1.5, attempt), 30000)

    const connectSSE = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.warn('SSE: Max reconnection attempts reached')
        return
      }

      try {
        sse = new EventSource(`${API_URL}/api/events`)
        reconnectAttempts = 0

        sse.addEventListener('players', () => { if (isMounted) getPlayers() })
        sse.addEventListener('schedules', () => { if (isMounted) getSchedules() })
        sse.addEventListener('achievements', () => { if (isMounted) getAchievements() })

        sse.onerror = () => {
          if (!isMounted) return
          sse?.close()
          sse = null
          reconnectAttempts++
          const delay = reconnectDelay(reconnectAttempts)
          console.warn(`SSE: Connection lost. Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
          setTimeout(connectSSE, delay)
        }
      } catch (e) {
        console.error('SSE: Connection failed:', e)
        reconnectAttempts++
        const delay = reconnectDelay(reconnectAttempts)
        setTimeout(connectSSE, delay)
      }
    }

    connectSSE()

    return () => {
      isMounted = false
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
      sse?.close()
    }
  }, [])

  useEffect(() => {
    setActiveIdx((prev) => {
      if (players.length === 0) return 0
      const liveIdx = players.findIndex(p => p.isLive)
      if (liveIdx !== -1) return liveIdx
      return Math.min(prev, players.length - 1)
    })
  }, [players])

  useEffect(() => {
    if (players.length <= 1) return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft')  setActiveIdx((i) => (i - 1 + players.length) % players.length)
      if (e.key === 'ArrowRight') setActiveIdx((i) => (i + 1) % players.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [players.length])

  const toAbsoluteImageUrl = toAbsoluteUrl

  const heroBackgroundStyle = {
    '--hero-bg-image': `url(${branding.homeBackground})`,
  }

  return (
    <div className="site-shell">
      {!performanceMode && <Suspense fallback={null}><FireBackground /></Suspense>}
      <div className="site-wrap">
      {showIntro && (
        <div className="intro-splash" aria-hidden="true">
          <img className="intro-logo" src={branding.introLogo} alt="TSG logo" />
        </div>
      )}

      <Header
        isNavHidden={isNavHidden}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        onPrefetchSchedule={getSchedules}
        onPrefetchAchievements={getAchievements}
        feedbackOpen={feedbackStatus.enabled}
      />

      {isDataSaver && !dataBannerHidden && (
        <div className="data-saver-banner" role="status">
          <span>Low-data network detected. Performance mode is enabled automatically.</span>
          <button
            type="button"
            onClick={() => {
              setDataBannerHidden(true)
              localStorage.setItem('tsg_data_banner_hidden', '1')
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="site-main">
        <Routes>
          <Route
            path="/home"
            element={(
              <HomePage
                heroBackgroundStyle={heroBackgroundStyle}
                players={players}
                playersLoading={playersLoading}
                activeIdx={activeIdx}
                setActiveIdx={setActiveIdx}
                touchStartRef={touchStartRef}
                toAbsoluteImageUrl={toAbsoluteImageUrl}
                achievements={achievements}
                performanceMode={performanceMode}
                dataSaver={isDataSaver}
                achievementsLoading={achievementsLoading}
              />
            )}
          />
          <Route path="/home/players" element={<Navigate to="/home" replace />} />
          <Route path="/home/achievements" element={<AchievementsPage achievements={achievements} achievementsLoading={achievementsLoading} />} />
          <Route
            path="/home/schedule"
            element={
              scheduleLoading ? (
                <section className="content-section" style={{ paddingTop: '6.5rem' }}>
                  <h3>Schedule</h3>
                  <TableSkeleton rows={6} cols={5} />
                </section>
              ) : (
                <SchedulePage schedules={schedules} />
              )
            }
          />
          <Route
            path="/tournaments"
            element={<InfoPage />}
          />
          <Route path="/fanconnect" element={<InfoPage />} />
          <Route path="/giveaways" element={<InfoPage />} />
          <Route path="/collaborations" element={<InfoPage />} />
          <Route path="/feedback" element={<FeedbackPage feedbackStatus={feedbackStatus} refreshFeedbackStatus={getFeedbackStatus} />} />
          <Route path="/liveupdates/:slug" element={<LiveUpdatesPage />} />
          <Route path="/schedule" element={<Navigate to="/home/schedule" replace />} />
          <Route path="/achievement" element={<Navigate to="/home/achievements" replace />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>

      <FooterBar />

      </div>
    </div>
  )
}

export default App

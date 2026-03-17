import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin)
const AUTH_STORAGE_KEY = 'tsg_admin_auth'
const PLAYER_AUTH_STORAGE_KEY = 'tsg_player_auth'
const AUTH_PERMISSIONS = ['schedule', 'players', 'achievements']

const setAuthToken = (token) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`
    return
  }

  delete axios.defaults.headers.common.Authorization
}

const readStoredAuth = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return { token: '', user: null }
    }

    const parsed = JSON.parse(raw)
    if (parsed?.user?.role !== 'super_admin') {
      clearStoredAuth()
      return { token: '', user: null }
    }

    return {
      token: parsed?.token || '',
      user: parsed?.user || null,
    }
  } catch {
    return { token: '', user: null }
  }
}

const saveStoredAuth = (token, user) => {
  if (!user || user.role !== 'super_admin') {
    clearStoredAuth()
    return
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }))
}

const clearStoredAuth = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

const readStoredPlayerAuth = () => {
  try {
    const raw = sessionStorage.getItem(PLAYER_AUTH_STORAGE_KEY)
    if (!raw) {
      return { token: '', account: null, player: null }
    }

    const parsed = JSON.parse(raw)
    return {
      token: parsed?.token || '',
      account: parsed?.account || null,
      player: parsed?.player || null,
    }
  } catch {
    return { token: '', account: null, player: null }
  }
}

const saveStoredPlayerAuth = (token, account, player) => {
  sessionStorage.setItem(PLAYER_AUTH_STORAGE_KEY, JSON.stringify({ token, account, player }))
}

const clearStoredPlayerAuth = () => {
  sessionStorage.removeItem(PLAYER_AUTH_STORAGE_KEY)
}

const toAbsoluteProfilePhotoUrl = (photoPath) => {
  if (!photoPath) {
    return ''
  }

  if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
    return photoPath
  }

  return `${API_URL}${photoPath}`
}

const defaultForm = {
  tournamentName: '',
  organizers: '',
  livestreamUrl: '',
  eventDate: '',
  eventHour: '',
  eventMinute: '',
  eventMeridiem: 'AM',
}

const defaultPlayerForm = {
  name: '',
  role: '',
  description: '',
  instagramUrl: '',
  youtubeUrl: '',
}

const defaultAchievementForm = {
  date: '',
  placement: '',
  tier: '',
  tournament: '',
}

function AdminLayout({ title, subtitle, stats = [], children, authUser, onLogout, canAccess }) {
  const isSuperAdmin = authUser?.role === 'super_admin'

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand-block">
          <p className="brand-kicker">Admin Console</p>
          <h1>iQOO | OG x TSG</h1>
          <p className="brand-subtext">Operations dashboard</p>
        </div>
        <nav className="admin-nav">
          {canAccess('dashboard') && <NavLink to="/dashboard">Dashboard</NavLink>}
          {canAccess('schedule') && <NavLink to="/schedule">Schedule</NavLink>}
          {canAccess('players') && <NavLink to="/players">Players</NavLink>}
          {authUser?.role === 'super_admin' && <NavLink to="/player-credentials">Player Credentials</NavLink>}
          {canAccess('achievements') && <NavLink to="/achievements">Achievements</NavLink>}
          <NavLink to="/user-feedback">User Feedback</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          {isSuperAdmin && <NavLink to="/admins">Admin Access</NavLink>}
          <button type="button" className="nav-logout-btn" onClick={onLogout}>Logout</button>
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="topbar-actions">
            <span className="status-chip">Live</span>
            {authUser?.profilePhotoPath ? (
              <img className="topbar-avatar" src={toAbsoluteProfilePhotoUrl(authUser.profilePhotoPath)} alt={authUser.username || 'admin'} />
            ) : (
              <span className="topbar-avatar fallback">{String(authUser?.username || 'a').slice(0, 1).toUpperCase()}</span>
            )}
            <span className="auth-chip">{authUser?.username || 'admin'}</span>
            <button type="button" className="logout-btn" onClick={onLogout}>Logout</button>
          </div>
        </header>

        {stats.length > 0 && (
          <section className="stats-grid">
            {stats.map((item) => (
              <article key={item.label} className="stat-card">
                <p>{item.label}</p>
                <strong>{item.value}</strong>
              </article>
            ))}
          </section>
        )}

        {children}
      </main>
    </div>
  )
}

function ScheduleManagerPage({ authUser, onLogout, canAccess }) {
    const to12HourParts = (value) => {
      const raw = String(value || '').trim()
      if (!raw) {
        return { eventHour: '', eventMinute: '', eventMeridiem: 'AM' }
      }

      const parsed24 = raw.match(/^(\d{1,2}):(\d{2})$/)
      if (parsed24) {
        const hour24 = Number(parsed24[1])
        const minute = Number(parsed24[2])
        if (!Number.isFinite(hour24) || !Number.isFinite(minute) || hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) {
          return { eventHour: '', eventMinute: '', eventMeridiem: 'AM' }
        }

        const eventMeridiem = hour24 >= 12 ? 'PM' : 'AM'
        const eventHour = String(hour24 % 12 || 12).padStart(2, '0')
        return { eventHour, eventMinute: String(minute).padStart(2, '0'), eventMeridiem }
      }

      const parsed12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
      if (!parsed12) {
        return { eventHour: '', eventMinute: '', eventMeridiem: 'AM' }
      }

      const hour12 = Number(parsed12[1])
      const minute = Number(parsed12[2])
      if (!Number.isFinite(hour12) || !Number.isFinite(minute) || hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
        return { eventHour: '', eventMinute: '', eventMeridiem: 'AM' }
      }

      return {
        eventHour: String(hour12).padStart(2, '0'),
        eventMinute: String(minute).padStart(2, '0'),
        eventMeridiem: parsed12[3].toUpperCase(),
      }
    }

    const to24HourTime = ({ eventHour, eventMinute, eventMeridiem }) => {
      const hour12 = Number(eventHour)
      const minute = Number(eventMinute)
      if (!Number.isFinite(hour12) || !Number.isFinite(minute) || hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
        return ''
      }

      const isPm = String(eventMeridiem || 'AM').toUpperCase() === 'PM'
      let hour24 = hour12 % 12
      if (isPm) {
        hour24 += 12
      }

      return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }

    const toDisplayTime = (value) => {
      const parts = to12HourParts(value)
      if (!parts.eventHour || !parts.eventMinute) {
        return value || '-'
      }

      return `${parts.eventHour}:${parts.eventMinute} ${parts.eventMeridiem}`
    }

  const [form, setForm] = useState(defaultForm)
  const [schedules, setSchedules] = useState([])
  const [editingId, setEditingId] = useState('')
  const [activeLiveScheduleId, setActiveLiveScheduleId] = useState('')
  const [liveForm, setLiveForm] = useState({ playing4: '', liveUpdates: [] })
  const [pointTableFile, setPointTableFile] = useState(null)

  const loadSchedules = async () => {
    const response = await axios.get(`${API_URL}/api/schedules`)
    setSchedules(response.data.data || [])
  }

  useEffect(() => {
    let isMounted = true

    const initializeSchedules = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/schedules`)
        if (isMounted) {
          setSchedules(response.data.data || [])
        }
      } catch {
        if (isMounted) {
          setSchedules([])
        }
      }
    }

    initializeSchedules()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let sse = null
    try {
      sse = new EventSource(`${API_URL}/api/events`)
      sse.addEventListener('schedules', loadSchedules)
      sse.onerror = () => sse?.close()
    } catch {}
    return () => sse?.close()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const resetForm = () => {
    setForm(defaultForm)
    setEditingId('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const eventTime = to24HourTime(form)
    if (!eventTime) {
      toast.error('Select a valid time (hour, minute, AM/PM).')
      return
    }

    const payload = {
      tournamentName: form.tournamentName,
      organizers: form.organizers,
      livestreamUrl: form.livestreamUrl,
      eventDate: form.eventDate,
      eventTime,
    }

    try {
      if (editingId) {
        await axios.put(`${API_URL}/api/schedules/${editingId}`, payload)
        toast.success('Schedule updated successfully')
      } else {
        await axios.post(`${API_URL}/api/schedules`, payload)
        toast.success('Schedule created successfully')
      }
      resetForm()
      loadSchedules()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to save schedule')
    }
  }

  const handleEdit = (schedule) => {
    const parsedTime = to12HourParts(schedule.eventTime)

    setEditingId(schedule._id)
    setForm({
      tournamentName: schedule.tournamentName || schedule.title || '',
      organizers: Array.isArray(schedule.organizers) ? schedule.organizers.join(', ') : '',
      livestreamUrl: schedule.livestreamUrl || '',
      eventDate: schedule.eventDate,
      eventHour: parsedTime.eventHour,
      eventMinute: parsedTime.eventMinute,
      eventMeridiem: parsedTime.eventMeridiem,
    })
  }

  const startLiveEditor = (schedule) => {
    setActiveLiveScheduleId(schedule._id)
    setLiveForm({
      playing4: Array.isArray(schedule.playing4) ? schedule.playing4.join(', ') : '',
      liveUpdates: Array.isArray(schedule.liveUpdates) && schedule.liveUpdates.length > 0
        ? schedule.liveUpdates.map((row) => ({
            matchNumber: row.matchNumber,
            mapName: row.mapName || '',
            placement: row.placement || '',
            kills: row.kills || 0,
            points: row.points || 0,
            totalPoints: row.totalPoints || 0,
            notes: row.notes || '',
          }))
        : [{ matchNumber: 1, mapName: '', placement: '', kills: 0, points: 0, totalPoints: 0, notes: '' }],
    })
    setPointTableFile(null)
  }

  const addLiveUpdateRow = () => {
    setLiveForm((prev) => ({
      ...prev,
      liveUpdates: [
        ...prev.liveUpdates,
        {
          matchNumber: prev.liveUpdates.length + 1,
          mapName: '',
          placement: '',
          kills: 0,
          points: 0,
          totalPoints: 0,
          notes: '',
        },
      ],
    }))
  }

  const removeLiveUpdateRow = (indexToRemove) => {
    setLiveForm((prev) => {
      const nextRows = prev.liveUpdates
        .filter((_, index) => index !== indexToRemove)
        .map((row, index) => ({ ...row, matchNumber: index + 1 }))

      return {
        ...prev,
        liveUpdates: nextRows.length > 0 ? nextRows : [{ matchNumber: 1, mapName: '', placement: '', kills: 0, points: 0, totalPoints: 0, notes: '' }],
      }
    })
  }

  const handleLiveRowChange = (index, field, value) => {
    setLiveForm((prev) => ({
      ...prev,
      liveUpdates: prev.liveUpdates.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      )),
    }))
  }

  const saveLiveUpdates = async () => {
    if (!activeLiveScheduleId) {
      return
    }

    try {
      await axios.patch(`${API_URL}/api/schedules/${activeLiveScheduleId}/live-updates`, {
        playing4: liveForm.playing4,
        liveUpdates: liveForm.liveUpdates.map((row, index) => ({
          ...row,
          matchNumber: Number(row.matchNumber || index + 1),
          kills: Number(row.kills || 0),
          points: Number(row.points || 0),
          totalPoints: Number(row.totalPoints || 0),
        })),
      })
      toast.success('Live updates saved')
      await loadSchedules()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to save live updates')
    }
  }

  const uploadFinalPointTable = async () => {
    if (!activeLiveScheduleId || !pointTableFile) {
      toast.error('Please select a file first')
      return
    }

    try {
      const payload = new FormData()
      payload.append('file', pointTableFile)
      await axios.post(`${API_URL}/api/schedules/${activeLiveScheduleId}/final-point-table`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Point table uploaded and tournament completed')
      setPointTableFile(null)
      setActiveLiveScheduleId('')
      setLiveForm({ playing4: '', liveUpdates: [] })
      await loadSchedules()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to upload point table')
    }
  }

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/schedules/${id}`)
      toast.success('Schedule deleted')
      if (editingId === id) {
        resetForm()
      }
      loadSchedules()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to delete schedule')
    }
  }

  return (
    <AdminLayout
      title="Schedule Manager"
      subtitle="Create, update, and monitor match operations"
      authUser={authUser}
      onLogout={onLogout}
      canAccess={canAccess}
      stats={[
        { label: 'Total Tournaments', value: schedules.length },
        { label: 'Upcoming', value: schedules.filter((item) => item.status === 'upcoming').length },
        { label: 'Ongoing', value: schedules.filter((item) => item.status === 'ongoing').length },
        { label: 'Completed', value: schedules.filter((item) => item.status === 'completed').length },
      ]}
    >
      <section className="admin-panel">
        <form className="schedule-form" onSubmit={handleSubmit}>
          <input name="tournamentName" value={form.tournamentName} onChange={handleChange} placeholder="Tournament Name" required />
          <input name="organizers" value={form.organizers} onChange={handleChange} placeholder="TO(s), comma separated" />
          <input name="livestreamUrl" value={form.livestreamUrl} onChange={handleChange} placeholder="Livestream Link" />
          <input type="date" name="eventDate" value={form.eventDate} onChange={handleChange} required />
          <div className="time-select-group">
            <select name="eventHour" value={form.eventHour} onChange={handleChange} required>
              <option value="">HH</option>
              {Array.from({ length: 12 }, (_, index) => {
                const value = String(index + 1).padStart(2, '0')
                return <option key={`h-${value}`} value={value}>{value}</option>
              })}
            </select>
            <select name="eventMinute" value={form.eventMinute} onChange={handleChange} required>
              <option value="">MM</option>
              {Array.from({ length: 60 }, (_, index) => {
                const value = String(index).padStart(2, '0')
                return <option key={`m-${value}`} value={value}>{value}</option>
              })}
            </select>
            <select name="eventMeridiem" value={form.eventMeridiem} onChange={handleChange} required>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit">{editingId ? 'Update Schedule' : 'Add Schedule'}</button>
            {editingId && (
              <button type="button" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h3 className="section-heading">Recent Tournaments</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tournament Name</th>
                <th>TO(s)</th>
                <th>Date</th>
                <th>Time</th>
                <th>Livestream</th>
                <th>Live Updates URL (Beta)</th>
                <th>Final Point Table</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((item) => (
                <tr key={item._id}>
                  <td>{item.tournamentName || item.title}</td>
                  <td>{Array.isArray(item.organizers) && item.organizers.length > 0 ? item.organizers.join(', ') : '-'}</td>
                  <td>{item.eventDate}</td>
                  <td>{toDisplayTime(item.eventTime)}</td>
                  <td>
                    {item.livestreamUrl ? <a href={item.livestreamUrl} target="_blank" rel="noreferrer">Open</a> : '-'}
                  </td>
                  <td>{item.liveUpdatesPath ? `${item.liveUpdatesPath} (beta)` : '-'}</td>
                  <td>
                    {item.finalPointTable?.filePath ? (
                      <a href={`${API_URL}${item.finalPointTable.filePath}`} target="_blank" rel="noreferrer">View</a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td><span className="status-pill">{item.status}</span></td>
                  <td>
                    <div className="table-actions">
                      <button type="button" onClick={() => handleEdit(item)}>Edit</button>
                      <button type="button" onClick={() => startLiveEditor(item)}>Live Updates</button>
                      <button type="button" onClick={() => handleDelete(item._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {activeLiveScheduleId && (
        <section className="admin-panel">
          <h3 className="section-heading">Live Updates Editor</h3>
          <div className="schedule-form top-gap">
            <input
              name="playing4"
              value={liveForm.playing4}
              onChange={(event) => setLiveForm((prev) => ({ ...prev, playing4: event.target.value }))}
              placeholder="Playing 4 (Live Updates only), comma separated"
            />
          </div>

          <div className="table-wrap top-gap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Map</th>
                  <th>Placement</th>
                  <th>Kills</th>
                  <th>Points</th>
                  <th>Total</th>
                  <th>Notes</th>
                  <th>Row</th>
                </tr>
              </thead>
              <tbody>
                {liveForm.liveUpdates.map((row, index) => (
                  <tr key={`live-row-${index}`}>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={row.matchNumber}
                        onChange={(event) => handleLiveRowChange(index, 'matchNumber', event.target.value)}
                      />
                    </td>
                    <td><input value={row.mapName} onChange={(event) => handleLiveRowChange(index, 'mapName', event.target.value)} /></td>
                    <td><input value={row.placement} onChange={(event) => handleLiveRowChange(index, 'placement', event.target.value)} /></td>
                    <td><input type="number" min="0" value={row.kills} onChange={(event) => handleLiveRowChange(index, 'kills', event.target.value)} /></td>
                    <td><input type="number" min="0" value={row.points} onChange={(event) => handleLiveRowChange(index, 'points', event.target.value)} /></td>
                    <td><input type="number" min="0" value={row.totalPoints} onChange={(event) => handleLiveRowChange(index, 'totalPoints', event.target.value)} /></td>
                    <td><input value={row.notes} onChange={(event) => handleLiveRowChange(index, 'notes', event.target.value)} /></td>
                    <td>
                      <button type="button" onClick={() => removeLiveUpdateRow(index)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-actions top-gap">
            <button type="button" onClick={addLiveUpdateRow}>Add Match Row</button>
            <button type="button" onClick={saveLiveUpdates}>Save Live Updates</button>
            <button
              type="button"
              onClick={() => {
                setActiveLiveScheduleId('')
                setLiveForm({ playing4: '', liveUpdates: [] })
                setPointTableFile(null)
              }}
            >
              Close Editor
            </button>
          </div>

          <div className="schedule-form top-gap">
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={(event) => setPointTableFile(event.target.files?.[0] || null)}
            />
          </div>
          <div className="form-actions top-gap">
            <button type="button" onClick={uploadFinalPointTable} disabled={!pointTableFile}>
              Upload Final Point Table & Complete Tournament
            </button>
          </div>
        </section>
      )}
    </AdminLayout>
  )
}

function PlayersManagerPage({ authUser, onLogout, canAccess }) {
  const [form, setForm] = useState(defaultPlayerForm)
  const [players, setPlayers] = useState([])
  const [editingId, setEditingId] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [livePrompt, setLivePrompt] = useState({ open: false, playerId: null, url: '' })

  const toAbsoluteImageUrl = (imagePath) => {
    if (!imagePath) {
      return ''
    }

    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath
    }

    return `${API_URL}${imagePath}`
  }

  const loadPlayers = async () => {
    const response = await axios.get(`${API_URL}/api/players`)
    setPlayers(response.data.data || [])
  }

  useEffect(() => {
    let isMounted = true

    const initializePlayers = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/players`)
        if (isMounted) {
          setPlayers(response.data.data || [])
        }
      } catch {
        if (isMounted) {
          setPlayers([])
        }
      }
    }

    initializePlayers()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let sse = null
    try {
      sse = new EventSource(`${API_URL}/api/events`)
      sse.addEventListener('players', loadPlayers)
      sse.onerror = () => sse?.close()
    } catch {}
    return () => sse?.close()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const resetForm = () => {
    setForm(defaultPlayerForm)
    setEditingId('')
    setImageFile(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const payload = new FormData()
    payload.append('name', form.name)
    payload.append('role', form.role)
    payload.append('description', form.description)
    payload.append('instagramUrl', form.instagramUrl)
    payload.append('youtubeUrl', form.youtubeUrl)

    if (imageFile) {
      payload.append('image', imageFile)
    }

    if (!editingId && !imageFile) {
      toast.error('New players require a profile image')
      return
    }

    try {
      if (editingId) {
        await axios.put(`${API_URL}/api/players/${editingId}`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        toast.success('Player updated successfully')
      } else {
        await axios.post(`${API_URL}/api/players`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        toast.success('Player added successfully')
      }
      resetForm()
      loadPlayers()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to save player')
    }
  }

  const handleEdit = (player) => {
    setEditingId(player._id)
    setForm({
      name: player.name,
      role: player.role,
      description: player.description,
      instagramUrl: player.instagramUrl || '',
      youtubeUrl: player.youtubeUrl || '',
    })
    setImageFile(null)
  }

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/players/${id}`)
      toast.success('Player deleted')
      if (editingId === id) {
        resetForm()
      }
      loadPlayers()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to delete player')
    }
  }

  const handleRankChange = async (id, rank) => {
    try {
      await axios.patch(`${API_URL}/api/players/${id}/rank`, { rank })
      toast.success('Rank updated')
      await loadPlayers()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to update rank')
    }
  }

  const handleLiveToggle = async (player) => {
    if (player.isLive) {
      try {
        await axios.patch(`${API_URL}/api/players/${player._id}/live`)
        toast.success('Live status updated')
        await loadPlayers()
      } catch (error) {
        toast.error(error?.response?.data?.message || error.message || 'Failed to toggle live')
      }
    } else {
      setLivePrompt({ open: true, playerId: player._id, url: '' })
    }
  }

  const confirmLivePrompt = async (useUrl) => {
    const { playerId, url } = livePrompt
    setLivePrompt({ open: false, playerId: null, url: '' })
    try {
      await axios.patch(`${API_URL}/api/players/${playerId}/live`, { liveUrl: useUrl ? url : '' })
      toast.success('Live URL updated')
      await loadPlayers()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to update live')
    }
  }

  return (
    <AdminLayout
      title="Players Manager"
      subtitle="Maintain roster, social links, and profile assets"
      authUser={authUser}
      onLogout={onLogout}
      canAccess={canAccess}
      stats={[
        { label: 'Total Players', value: players.length },
        { label: 'Ranked (1-5)', value: players.filter(p => p.rank >= 1 && p.rank <= 5).length },
        { label: 'Live Now', value: players.filter(p => p.isLive).length },
        { label: 'Editing Mode', value: editingId ? 'On' : 'Off' },
      ]}
    >
      <section className="admin-panel">
        <form className="schedule-form" onSubmit={handleSubmit}>
          <input name="name" value={form.name} onChange={handleChange} placeholder="Player name" required />
          <input name="role" value={form.role} onChange={handleChange} placeholder="Role" required />
          <input name="instagramUrl" value={form.instagramUrl} onChange={handleChange} placeholder="Instagram URL" />
          <input name="youtubeUrl" value={form.youtubeUrl} onChange={handleChange} placeholder="YouTube URL" />
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Short player description"
            rows={4}
            required
          />
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setImageFile(event.target.files?.[0] || null)}
            required={!editingId}
          />
          <div className="form-actions">
            <button type="submit">{editingId ? 'Update Player' : 'Add Player'}</button>
            {editingId && (
              <button type="button" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h3 className="section-heading">Roster</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Role</th>
                <th>Rank</th>
                <th>Live</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player._id}>
                  <td className="player-cell">
                    <img
                      className="admin-player-image"
                      src={toAbsoluteImageUrl(player.imagePath || player.photo)}
                      alt={player.name}
                    />
                    <span>{player.name}</span>
                  </td>
                  <td>{player.role}</td>
                  <td>
                    <select
                      value={player.rank != null ? String(player.rank) : ''}
                      onChange={(e) => handleRankChange(player._id, e.target.value)}
                      style={{
                        padding: '0.28rem 0.5rem', borderRadius: '0.35rem',
                        background: '#1a1008', color: '#e0c8b0',
                        border: '1px solid #4a3728', fontSize: '0.82rem', cursor: 'pointer',
                      }}
                    >
                      <option value="">None</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: player.isLive ? '#22c55e' : '#6b7280',
                        boxShadow: player.isLive ? '0 0 6px 2px rgba(34,197,94,0.6)' : 'none',
                      }} />
                      <button
                        type="button"
                        onClick={() => handleLiveToggle(player)}
                        style={{
                          background: player.isLive ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.15)',
                          border: `1px solid ${player.isLive ? 'rgba(220,38,38,0.5)' : 'rgba(34,197,94,0.5)'}`,
                          color: player.isLive ? '#f87171' : '#4ade80',
                          borderRadius: '0.4rem', padding: '0.25rem 0.7rem',
                          cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
                        }}
                      >
                        {player.isLive ? 'Go Offline' : 'Go Live'}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button type="button" onClick={() => handleEdit(player)}>Edit</button>
                      <button type="button" onClick={() => handleDelete(player._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stream URL prompt modal */}
      {livePrompt.open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1008', border: '1px solid #4a3728',
            borderRadius: '0.8rem', padding: '2rem', width: '90%', maxWidth: '440px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          }}>
            <h3 style={{ margin: '0 0 0.4rem', color: '#fff0e1', fontSize: '1.1rem' }}>Go Live</h3>
            <p style={{ margin: '0 0 1.2rem', color: '#a89070', fontSize: '0.85rem' }}>
              Enter a stream link to let viewers watch live. Leave blank to show Live Now without a link.
            </p>
            <input
              type="url"
              value={livePrompt.url}
              onChange={(e) => setLivePrompt((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://youtube.com/live/... (optional)"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '0.55rem 0.8rem', borderRadius: '0.4rem',
                background: '#0e0a06', color: '#e0c8b0',
                border: '1px solid #4a3728', fontSize: '0.9rem', marginBottom: '1.2rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => confirmLivePrompt(false)}
                style={{
                  padding: '0.45rem 1.1rem', borderRadius: '0.4rem', cursor: 'pointer',
                  background: 'transparent', border: '1px solid #4a3728',
                  color: '#a89070', fontWeight: 600, fontSize: '0.85rem',
                }}
              >
                Go Live (no link)
              </button>
              <button
                type="button"
                onClick={() => confirmLivePrompt(true)}
                style={{
                  padding: '0.45rem 1.1rem', borderRadius: '0.4rem', cursor: 'pointer',
                  background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.5)',
                  color: '#4ade80', fontWeight: 600, fontSize: '0.85rem',
                }}
              >
                Go Live
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function AchievementsManagerPage({ authUser, onLogout, canAccess }) {
  const [form, setForm] = useState(defaultAchievementForm)
  const [achievements, setAchievements] = useState([])
  const [editingId, setEditingId] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')

  const normalizeAchievements = (items = []) =>
    items.map((item, index) => ({
      ...item,
      clientId: item._id || item.id || `${item.date || 'na'}-${item.tournament || 'result'}-${index}`,
    }))

  const loadAchievements = async () => {
    const response = await axios.get(`${API_URL}/api/achievements`)
    setSourceLabel(response.data.source || '')
    setAchievements(normalizeAchievements(response.data.data || []))
  }

  useEffect(() => {
    let isMounted = true

    const initializeAchievements = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/achievements`)
        if (isMounted) {
          setSourceLabel(response.data.source || '')
          setAchievements(normalizeAchievements(response.data.data || []))
        }
      } catch {
        if (isMounted) {
          setSourceLabel('')
          setAchievements([])
        }
      }
    }

    initializeAchievements()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let sse = null
    try {
      sse = new EventSource(`${API_URL}/api/events`)
      sse.addEventListener('achievements', loadAchievements)
      sse.onerror = () => sse?.close()
    } catch {}
    return () => sse?.close()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const resetForm = () => {
    setForm(defaultAchievementForm)
    setEditingId('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    try {
      if (editingId) {
        await axios.put(`${API_URL}/api/achievements/${editingId}`, form)
        toast.success('Achievement updated')
      } else {
        await axios.post(`${API_URL}/api/achievements`, form)
        toast.success('Achievement added')
      }
      resetForm()
      loadAchievements()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to save achievement')
    }
  }

  const handleEdit = (achievement) => {
    setEditingId(achievement._id)
    setForm({
      date: achievement.date === '-' ? '' : achievement.date || '',
      placement: achievement.placement || '',
      tier: achievement.tier || '',
      tournament: achievement.tournament || '',
    })
  }

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/achievements/${id}`)
      toast.success('Achievement deleted')
      if (editingId === id) {
        resetForm()
      }
      loadAchievements()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to delete achievement')
    }
  }

  return (
    <AdminLayout
      title="Achievements Manager"
      subtitle="Manage the achievements shown on the public website"
      authUser={authUser}
      onLogout={onLogout}
      canAccess={canAccess}
      stats={[
        { label: 'Total Results', value: achievements.length },
        { label: 'Saved In Database', value: sourceLabel === 'admin' ? 'Yes' : 'No' },
      ]}
    >
      <section className="admin-panel">
        <form className="schedule-form" onSubmit={handleSubmit}>
          <input type="date" name="date" value={form.date} onChange={handleChange} />
          <input name="placement" value={form.placement} onChange={handleChange} placeholder="Placement" required />
          <input name="tier" value={form.tier} onChange={handleChange} placeholder="Tier (optional)" />
          <input name="tournament" value={form.tournament} onChange={handleChange} placeholder="Tournament" required />
          <div className="form-actions">
            <button type="submit">{editingId ? 'Update Achievement' : 'Add Achievement'}</button>
            {editingId && (
              <button type="button" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h3 className="section-heading">Published Results</h3>
        <p className="admin-meta">Source: {sourceLabel || 'Unknown'}</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Placement</th>
                <th>Tournament</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {achievements.length === 0 && (
                <tr>
                  <td colSpan="4">No achievements found. They will be imported automatically from Liquipedia once if database is empty.</td>
                </tr>
              )}
              {achievements.map((item) => (
                <tr key={item.clientId}>
                  <td>{item.date || '-'}</td>
                  <td>{item.placement || '-'}</td>
                  <td>{item.tournament || '-'}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" onClick={() => handleEdit(item)} disabled={!item._id}>Edit</button>
                      <button type="button" onClick={() => handleDelete(item._id)} disabled={!item._id}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  )
}

function DashboardPage({ authUser, onLogout, canAccess }) {
  const [metrics, setMetrics] = useState({
    web: {
      activeUsersNow: 0,
      requestsPerMinute: 0,
      totalRequests: 0,
      trafficOutLastHourBytes: 0,
      trafficInLastHourBytes: 0,
      avgResponseMs: 0,
      totalErrors: 0,
      uptimeSeconds: 0,
      topRoutesLastHour: [],
      timestamp: '',
    },
    database: {
      connected: false,
      collections: {
        schedules: 0,
        players: 0,
        achievements: 0,
      },
      totals: {
        records: 0,
        dataSizeBytes: 0,
        storageSizeBytes: 0,
      },
    },
  })

  const formatBytes = (value) => {
    const units = ['B', 'KB', 'MB', 'GB']
    let number = Number(value || 0)
    let index = 0

    while (number >= 1024 && index < units.length - 1) {
      number /= 1024
      index += 1
    }

    return `${number.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
  }

  const formatUptime = (seconds) => {
    const total = Number(seconds || 0)
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = total % 60
    return `${hours}h ${minutes}m ${secs}s`
  }

  useEffect(() => {
    let isMounted = true

    const loadDashboard = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/admin/metrics`)

        if (!isMounted) {
          return
        }

        setMetrics(response.data.data)
      } catch {
        if (isMounted) {
          setMetrics((prev) => ({ ...prev }))
        }
      }
    }

    loadDashboard()
    const refreshInterval = setInterval(loadDashboard, 15000)

    return () => {
      isMounted = false
      clearInterval(refreshInterval)
    }
  }, [])

  const isDbConnected = metrics.database.connected

  return (
    <AdminLayout
      title="Website Overview"
      subtitle="Simple live website details for daily admin checking"
      authUser={authUser}
      onLogout={onLogout}
      canAccess={canAccess}
      stats={[
        { label: 'People Active Now', value: metrics.web.activeUsersNow },
        { label: 'Site Activity / Minute', value: metrics.web.requestsPerMinute },
        { label: 'Data Sent Last Hour', value: formatBytes(metrics.web.trafficOutLastHourBytes) },
        { label: 'Database Status', value: isDbConnected ? 'Connected' : 'Disconnected' },
      ]}
    >
      <section className="admin-panel">
        <h3 className="section-heading">What Is Happening On The Website</h3>
        <div className="insight-grid">
          <article className="insight-card">
            <p>Total Requests Since Server Started</p>
            <strong>{metrics.web.totalRequests}</strong>
          </article>
          <article className="insight-card">
            <p>Different Visitors In 24 Hours</p>
            <strong>{metrics.web.uniqueVisitors24h}</strong>
          </article>
          <article className="insight-card">
            <p>Average Server Response Time</p>
            <strong>{metrics.web.avgResponseMs} ms</strong>
          </article>
          <article className="insight-card">
            <p>Requests That Failed</p>
            <strong>{metrics.web.totalErrors}</strong>
          </article>
          <article className="insight-card">
            <p>Data Received In Last Hour</p>
            <strong>{formatBytes(metrics.web.trafficInLastHourBytes)}</strong>
          </article>
          <article className="insight-card">
            <p>How Long Server Has Been Running</p>
            <strong>{formatUptime(metrics.web.uptimeSeconds)}</strong>
          </article>
        </div>
        <p className="admin-meta">Last refreshed: {metrics.web.timestamp ? new Date(metrics.web.timestamp).toLocaleString() : 'Waiting for data...'}</p>
      </section>

      <section className="admin-panel">
        <h3 className="section-heading">Most Used Website/API Parts In Last Hour</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Page / API Path</th>
                <th>Times Used</th>
              </tr>
            </thead>
            <tbody>
              {(metrics.web.topRoutesLastHour || []).map((routeRow) => (
                <tr key={routeRow.path}>
                  <td>{routeRow.path}</td>
                  <td>{routeRow.hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel">
        <h3 className="section-heading">Stored Website Data</h3>
        <div className="insight-grid">
          <article className="insight-card">
            <p>Total Saved Records</p>
            <strong>{metrics.database.totals.records}</strong>
          </article>
          <article className="insight-card">
            <p>Database Data Size</p>
            <strong>{formatBytes(metrics.database.totals.dataSizeBytes)}</strong>
          </article>
          <article className="insight-card">
            <p>Database Storage Used</p>
            <strong>{formatBytes(metrics.database.totals.storageSizeBytes)}</strong>
          </article>
          <article className="insight-card">
            <p>Connection Health</p>
            <strong>{isDbConnected ? 'Healthy' : 'Down'}</strong>
          </article>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data Type</th>
                <th>Saved Items</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Schedules</td>
                <td>{metrics.database.collections.schedules}</td>
              </tr>
              <tr>
                <td>Players</td>
                <td>{metrics.database.collections.players}</td>
              </tr>
              <tr>
                <td>Achievements</td>
                <td>{metrics.database.collections.achievements}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  )
}

function AdminUsersPage({ authUser, onLogout, canAccess }) {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', permissions: [] })

  const loadAdmins = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/auth/admins`)
      setAdmins(response.data.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdmins()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePermission = (permission) => {
    setForm((prev) => {
      const hasIt = prev.permissions.includes(permission)
      return {
        ...prev,
        permissions: hasIt
          ? prev.permissions.filter((item) => item !== permission)
          : [...prev.permissions, permission],
      }
    })
  }

  const createAdmin = async (event) => {
    event.preventDefault()
    try {
      await axios.post(`${API_URL}/api/auth/admins`, form)
      toast.success('Admin created')
      setForm({ username: '', password: '', permissions: [] })
      await loadAdmins()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to create admin')
    }
  }

  const toggleActive = async (admin) => {
    try {
      await axios.patch(`${API_URL}/api/auth/admins/${admin.id}`, {
        isActive: !admin.isActive,
      })
      toast.success(`Admin ${admin.isActive ? 'deactivated' : 'activated'}`)
      await loadAdmins()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to update admin')
    }
  }

  const resetPassword = async (admin) => {
    const nextPassword = window.prompt(`New password for ${admin.username}`)
    if (!nextPassword) {
      return
    }

    try {
      await axios.patch(`${API_URL}/api/auth/admins/${admin.id}`, { password: nextPassword })
      toast.success('Password updated')
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to update password')
    }
  }

  const updatePermissions = async (admin, permission) => {
    const hasPermission = Array.isArray(admin.permissions) && admin.permissions.includes(permission)
    const nextPermissions = hasPermission
      ? admin.permissions.filter((item) => item !== permission)
      : [...(admin.permissions || []), permission]

    try {
      await axios.patch(`${API_URL}/api/auth/admins/${admin.id}`, { permissions: nextPermissions })
      toast.success('Permissions updated')
      await loadAdmins()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to update permissions')
    }
  }

  return (
    <AdminLayout
      title="Admin Access Control"
      subtitle="Create admins and control module permissions"
      authUser={authUser}
      onLogout={onLogout}
      canAccess={canAccess}
      stats={[
        { label: 'Total Accounts', value: admins.length },
        { label: 'Active Admins', value: admins.filter((item) => item.isActive).length },
        { label: 'Super Admin', value: admins.filter((item) => item.role === 'super_admin').length },
      ]}
    >
      <section className="admin-panel">
        <h3 className="section-heading">Create New Admin</h3>
        <form className="schedule-form" onSubmit={createAdmin}>
          <input
            name="username"
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            placeholder="Username"
            required
          />
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Password"
            minLength={6}
            required
          />
          <div className="permission-grid">
            {AUTH_PERMISSIONS.map((permission) => (
              <label key={permission} className="permission-item">
                <input
                  type="checkbox"
                  checked={form.permissions.includes(permission)}
                  onChange={() => togglePermission(permission)}
                />
                <span>{permission}</span>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="submit">Create Admin</button>
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h3 className="section-heading">Admin Accounts</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Permissions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && admins.length === 0 && (
                <tr>
                  <td colSpan="5">No admins found.</td>
                </tr>
              )}
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td>{admin.username}</td>
                  <td>{admin.role}</td>
                  <td>{admin.isActive ? 'Active' : 'Disabled'}</td>
                  <td>
                    <div className="permission-grid compact">
                      {AUTH_PERMISSIONS.map((permission) => (
                        <label key={`${admin.id}-${permission}`} className="permission-item">
                          <input
                            type="checkbox"
                            disabled={admin.role === 'super_admin'}
                            checked={admin.role === 'super_admin' || (admin.permissions || []).includes(permission)}
                            onChange={() => updatePermissions(admin, permission)}
                          />
                          <span>{permission}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    {admin.role === 'super_admin' ? (
                      <span>Protected</span>
                    ) : (
                      <div className="table-actions">
                        <button type="button" onClick={() => toggleActive(admin)}>
                          {admin.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" onClick={() => resetPassword(admin)}>Reset Password</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  )
}

function LoginPage({ onLogin, isSubmitting, error }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    await onLogin(username, password)
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <p className="brand-kicker">Secure Access</p>
        <h1>iQOO | OG x TSG Admin</h1>
        <p className="brand-subtext">Login with your admin credentials.</p>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Login'}</button>
        <p className="auth-alt-link">Player? Use <a href="/player-login">Player Login</a></p>
      </form>
    </div>
  )
}

function ForbiddenPage({ onLogout }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Access Limited</h1>
        <p className="brand-subtext">Your account is logged in but has no module permission assigned.</p>
        <button type="button" onClick={onLogout}>Logout</button>
      </div>
    </div>
  )
}

function ProfilePage({ authUser, onLogout, canAccess, onUserUpdated }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const uploadProfilePhoto = async (event) => {
    event.preventDefault()
    if (!selectedFile) {
      toast.error('Please select a file')
      return
    }

    setSubmitting(true)
    try {
      const payload = new FormData()
      payload.append('photo', selectedFile)
      const response = await axios.patch(`${API_URL}/api/auth/me/photo`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onUserUpdated(response.data.user)
      setSelectedFile(null)
      toast.success('Profile photo updated')
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to update profile photo')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminLayout
      title="My Profile"
      subtitle="Manage your account photo and identity"
      authUser={authUser}
      onLogout={onLogout}
      canAccess={canAccess}
      stats={[
        { label: 'Role', value: authUser?.role || 'admin' },
        { label: 'Username', value: authUser?.username || '-' },
      ]}
    >
      <section className="admin-panel profile-panel">
        <div className="profile-summary">
          <div className="profile-avatar-wrap">
            {authUser?.profilePhotoPath ? (
              <img
                src={toAbsoluteProfilePhotoUrl(authUser.profilePhotoPath)}
                alt={authUser.username}
                className="profile-avatar"
              />
            ) : (
              <div className="profile-avatar fallback">{String(authUser?.username || 'A').slice(0, 1).toUpperCase()}</div>
            )}
          </div>
          <div>
            <h3 className="section-heading">{authUser?.username}</h3>
            <p className="admin-meta">{authUser?.role === 'super_admin' ? 'Super Admin' : 'Admin'}</p>
          </div>
        </div>

        <form className="schedule-form top-gap" onSubmit={uploadProfilePhoto}>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            required
          />
          <div className="form-actions">
            <button type="submit" disabled={submitting || !selectedFile}>
              {submitting ? 'Uploading...' : 'Update Profile Photo'}
            </button>
          </div>
        </form>
      </section>
    </AdminLayout>
  )
}

function PlayerCredentialsPage({ authUser, onLogout, canAccess }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ playerId: '', username: '', password: '' })

  const loadRows = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/player-auth/accounts`)
      setRows(response.data.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveAccount = async (event) => {
    event.preventDefault()
    await axios.post(`${API_URL}/api/player-auth/accounts`, form)
    setForm({ playerId: '', username: '', password: '' })
    await loadRows()
  }

  const toggleActive = async (account) => {
    await axios.patch(`${API_URL}/api/player-auth/accounts/${account.id}`, {
      isActive: !account.isActive,
    })
    await loadRows()
  }

  const resetPassword = async (account) => {
    const nextPassword = window.prompt(`New password for ${account.username}`)
    if (!nextPassword) {
      return
    }

    await axios.patch(`${API_URL}/api/player-auth/accounts/${account.id}`, { password: nextPassword })
    await loadRows()
    alert('Password reset complete')
  }

  const playersWithoutAccounts = rows.filter((item) => !item.account)

  return (
    <AdminLayout
      title="Player Credentials"
      subtitle="Generate and manage player login IDs and passwords"
      authUser={authUser}
      onLogout={onLogout}
      canAccess={canAccess}
      stats={[
        { label: 'Total Players', value: rows.length },
        { label: 'Credentials Created', value: rows.filter((item) => item.account).length },
        { label: 'Active Player Logins', value: rows.filter((item) => item.account?.isActive).length },
      ]}
    >
      <section className="admin-panel">
        <h3 className="section-heading">Create ID / Password For Player</h3>
        <form className="schedule-form" onSubmit={saveAccount}>
          <select
            value={form.playerId}
            onChange={(event) => setForm((prev) => ({ ...prev, playerId: event.target.value }))}
            required
          >
            <option value="">Select Player</option>
            {playersWithoutAccounts.map((item) => (
              <option key={item.player.id} value={item.player.id}>{item.player.name} ({item.player.role})</option>
            ))}
          </select>
          <input
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            placeholder="Player login ID"
            required
          />
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Password"
            minLength={6}
            required
          />
          <div className="form-actions">
            <button type="submit">Create Credentials</button>
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h3 className="section-heading">All Players & Login Status</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Role</th>
                <th>Login ID</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan="5">No players found.</td>
                </tr>
              )}
              {rows.map((item) => (
                <tr key={item.player.id}>
                  <td>{item.player.name}</td>
                  <td>{item.player.role}</td>
                  <td>{item.account?.username || '-'}</td>
                  <td>{item.account ? (item.account.isActive ? 'Active' : 'Disabled') : 'No Account'}</td>
                  <td>
                    {item.account ? (
                      <div className="table-actions">
                        <button type="button" onClick={() => toggleActive(item.account)}>
                          {item.account.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" onClick={() => resetPassword(item.account)}>Reset Password</button>
                      </div>
                    ) : (
                      <span>Create credentials above</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  )
}

function PlayerLoginPage({ onLogin, loading, error }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    await onLogin(username, password)
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <p className="brand-kicker">Player Access</p>
        <h1>TSG Player Panel</h1>
        <p className="brand-subtext">Login to update your live status and profile description.</p>
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Player ID" required />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
      </form>
    </div>
  )
}

function PlayerPanelPage({ playerAccount, playerProfile, onSave, onLogout, loading }) {
  const [description, setDescription] = useState(playerProfile?.description || '')
  const [isLive, setIsLive] = useState(Boolean(playerProfile?.isLive))
  const [liveUrl, setLiveUrl] = useState(playerProfile?.liveUrl || '')

  useEffect(() => {
    setDescription(playerProfile?.description || '')
    setIsLive(Boolean(playerProfile?.isLive))
    setLiveUrl(playerProfile?.liveUrl || '')
  }, [playerProfile])

  const submit = async (event) => {
    event.preventDefault()
    await onSave({ description, isLive, liveUrl })
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <p className="brand-kicker">Player Dashboard</p>
        <h1>{playerProfile?.name || playerAccount?.username}</h1>
        <p className="brand-subtext">Role: {playerProfile?.role || '-'}</p>

        <textarea
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Update your player description"
          required
        />

        <label className="permission-item live-toggle">
          <input type="checkbox" checked={isLive} onChange={(event) => setIsLive(event.target.checked)} />
          <span>Go Live</span>
        </label>

        <input
          value={liveUrl}
          onChange={(event) => setLiveUrl(event.target.value)}
          placeholder="Stream link (required when live)"
          disabled={!isLive}
        />

        <div className="form-actions">
          <button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
          <button type="button" onClick={onLogout}>Logout</button>
        </div>
      </form>
    </div>
  )
}

function UserFeedbackPage({ authUser, onLogout, canAccess }) {
  const [feedbackRows, setFeedbackRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState({
    enabled: false,
    maxSubmissions: 0,
    acceptedSubmissions: 0,
    remainingSubmissions: 0,
  })
  const [configForm, setConfigForm] = useState({ enabled: false, maxSubmissions: 25 })

  const isSuperAdmin = authUser?.role === 'super_admin'

  const loadFeedback = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/feedback`)
      setFeedbackRows(response.data.data || [])
    } finally {
      setLoading(false)
    }
  }

  const loadConfig = async () => {
    if (!isSuperAdmin) {
      return
    }

    const response = await axios.get(`${API_URL}/api/feedback/config`)
    const nextConfig = response.data.data
    setConfig(nextConfig)
    setConfigForm({ enabled: Boolean(nextConfig.enabled), maxSubmissions: Number(nextConfig.maxSubmissions || 0) })
  }

  useEffect(() => {
    loadFeedback()
    loadConfig()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveConfig = async (event) => {
    event.preventDefault()
    try {
      await axios.patch(`${API_URL}/api/feedback/config`, {
        enabled: Boolean(configForm.enabled),
        maxSubmissions: Number(configForm.maxSubmissions || 0),
      })
      await loadConfig()
      toast.success('Feedback settings updated')
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to update settings')
    }
  }

  const deleteFeedback = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/feedback/${id}`)
      toast.success('Feedback deleted')
      await loadFeedback()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to delete feedback')
    }
  }

  return (
    <AdminLayout
      title="User Feedback"
      subtitle="Review submitted feedback and control intake"
      authUser={authUser}
      onLogout={onLogout}
      canAccess={canAccess}
      stats={[
        { label: 'Total Feedback', value: feedbackRows.length },
        { label: 'Feedback Open', value: config.enabled ? 'Yes' : 'No' },
        { label: 'Remaining Slots', value: config.remainingSubmissions || 0 },
      ]}
    >
      {isSuperAdmin && (
        <section className="admin-panel">
          <h3 className="section-heading">Feedback Control (Super Admin)</h3>
          <form className="schedule-form" onSubmit={saveConfig}>
            <label className="permission-item live-toggle">
              <input
                type="checkbox"
                checked={configForm.enabled}
                onChange={(event) => setConfigForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              <span>Enable Feedback Form</span>
            </label>
            <input
              type="number"
              min="0"
              value={configForm.maxSubmissions}
              onChange={(event) => setConfigForm((prev) => ({ ...prev, maxSubmissions: event.target.value }))}
              placeholder="Max submissions"
              required
            />
            <div className="form-actions">
              <button type="submit">Save Feedback Settings</button>
            </div>
          </form>
          <p className="admin-meta top-gap">
            Accepted: {config.acceptedSubmissions || 0} / {config.maxSubmissions || 0}
          </p>
        </section>
      )}

      <section className="admin-panel">
        <h3 className="section-heading">Feedback Inbox</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Instagram</th>
                <th>Email</th>
                <th>Description</th>
                <th>Attachment</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && feedbackRows.length === 0 && (
                <tr>
                  <td colSpan="7">No feedback submitted yet.</td>
                </tr>
              )}
              {feedbackRows.map((item) => (
                <tr key={item._id}>
                  <td>{item.name}</td>
                  <td>{item.instagramUsername || '-'}</td>
                  <td>{item.email}</td>
                  <td>{item.description}</td>
                  <td>
                    {item.attachmentPath ? (
                      <a href={`${API_URL}${item.attachmentPath}`} target="_blank" rel="noreferrer">View</a>
                    ) : '-'}
                  </td>
                  <td>{item.submittedAt ? new Date(item.submittedAt).toLocaleString() : '-'}</td>
                  <td>
                    <button type="button" onClick={() => deleteFeedback(item._id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  )
}

function App() {
  const storedAuth = readStoredAuth()
  const storedPlayerAuth = readStoredPlayerAuth()
  const [authUser, setAuthUser] = useState(storedAuth.user)
  const [token, setToken] = useState(storedAuth.token)
  const [playerToken, setPlayerToken] = useState(storedPlayerAuth.token)
  const [playerAccount, setPlayerAccount] = useState(storedPlayerAuth.account)
  const [playerProfile, setPlayerProfile] = useState(storedPlayerAuth.player)
  const [checkingSession, setCheckingSession] = useState(true)
  const [submittingLogin, setSubmittingLogin] = useState(false)
  const [authError, setAuthError] = useState('')
  const [submittingPlayerLogin, setSubmittingPlayerLogin] = useState(false)
  const [playerAuthError, setPlayerAuthError] = useState('')
  const [savingPlayerProfile, setSavingPlayerProfile] = useState(false)

  const canAccess = (permission) => {
    if (!authUser) {
      return false
    }
    if (permission === 'dashboard') {
      return authUser.role === 'super_admin'
    }
    if (authUser.role === 'super_admin') {
      return true
    }
    return Array.isArray(authUser.permissions) && authUser.permissions.includes(permission)
  }

  const firstAllowedPath = canAccess('dashboard')
    ? '/dashboard'
    : canAccess('schedule')
      ? '/schedule'
      : canAccess('players')
        ? '/players'
        : canAccess('achievements')
          ? '/achievements'
          : '/user-feedback'

  const handleLogout = async () => {
    try {
      if (token) {
        await axios.post(`${API_URL}/api/auth/logout`)
      }
    } catch {
    }

    setAuthUser(null)
    setToken('')
    setAuthError('')
    clearStoredAuth()
    setAuthToken('')
    window.location.assign('/login')
  }

  const handlePlayerLogout = async () => {
    try {
      if (playerToken) {
        await axios.post(`${API_URL}/api/player-auth/logout`, {}, {
          headers: { Authorization: `Bearer ${playerToken}` },
        })
      }
    } catch {
    }

    setPlayerToken('')
    setPlayerAccount(null)
    setPlayerProfile(null)
    setPlayerAuthError('')
    clearStoredPlayerAuth()
    window.location.assign('/player-login')
  }

  const updateAuthUser = (nextUser) => {
    setAuthUser(nextUser)
    if (token) {
      saveStoredAuth(token, nextUser)
    }
  }

  const handleLogin = async (username, password) => {
    setSubmittingLogin(true)
    setAuthError('')
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, { username, password })
      const nextToken = response.data.token
      const nextUser = response.data.user

      setToken(nextToken)
      setAuthUser(nextUser)
      setAuthToken(nextToken)
      saveStoredAuth(nextToken, nextUser)
    } catch (error) {
      setAuthError(error?.response?.data?.message || 'Login failed')
    } finally {
      setSubmittingLogin(false)
    }
  }

  const handlePlayerLogin = async (username, password) => {
    setSubmittingPlayerLogin(true)
    setPlayerAuthError('')
    try {
      const response = await axios.post(`${API_URL}/api/player-auth/login`, { username, password })
      const nextToken = response.data.token
      const nextAccount = response.data.account
      const nextPlayer = response.data.player

      setPlayerToken(nextToken)
      setPlayerAccount(nextAccount)
      setPlayerProfile(nextPlayer)
      saveStoredPlayerAuth(nextToken, nextAccount, nextPlayer)
      window.location.assign('/player-panel')
    } catch (error) {
      setPlayerAuthError(error?.response?.data?.message || 'Login failed')
    } finally {
      setSubmittingPlayerLogin(false)
    }
  }

  const handlePlayerProfileSave = async ({ description, isLive, liveUrl }) => {
    if (!playerToken) {
      return
    }

    if (isLive && !String(liveUrl || '').trim()) {
      toast.error('Please add stream link when live is on.')
      return
    }

    setSavingPlayerProfile(true)
    try {
      const response = await axios.patch(
        `${API_URL}/api/player-auth/me`,
        {
          description,
          isLive,
          liveUrl: isLive ? liveUrl : '',
        },
        { headers: { Authorization: `Bearer ${playerToken}` } }
      )

      const nextPlayer = response.data.player
      setPlayerProfile(nextPlayer)
      saveStoredPlayerAuth(playerToken, playerAccount, nextPlayer)
      toast.success('Profile updated')
    } catch (error) {
      if (error?.response?.status === 401) {
        await handlePlayerLogout()
        return
      }
      toast.error(error?.response?.data?.message || error.message || 'Failed to update profile')
    } finally {
      setSavingPlayerProfile(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    const restoreSession = async () => {
      if (!storedAuth.token && !storedPlayerAuth.token) {
        if (isMounted) {
          setCheckingSession(false)
        }
        return
      }

      if (storedAuth.token) {
        setAuthToken(storedAuth.token)
        try {
          const response = await axios.get(`${API_URL}/api/auth/me`)
          if (!isMounted) {
            return
          }
          setToken(storedAuth.token)
          setAuthUser(response.data.user)
          saveStoredAuth(storedAuth.token, response.data.user)
        } catch {
          if (isMounted) {
            setAuthUser(null)
            setToken('')
            clearStoredAuth()
            setAuthToken('')
          }
        }
      }

      if (storedPlayerAuth.token) {
        try {
          const response = await axios.get(`${API_URL}/api/player-auth/me`, {
            headers: { Authorization: `Bearer ${storedPlayerAuth.token}` },
          })
          if (isMounted) {
            setPlayerToken(storedPlayerAuth.token)
            setPlayerAccount(response.data.account)
            setPlayerProfile(response.data.player)
            saveStoredPlayerAuth(storedPlayerAuth.token, response.data.account, response.data.player)
          }
        } catch {
          if (isMounted) {
            setPlayerToken('')
            setPlayerAccount(null)
            setPlayerProfile(null)
            clearStoredPlayerAuth()
          }
        }
      }

      if (isMounted) {
        setCheckingSession(false)
      }
    }

    restoreSession()

    return () => {
      isMounted = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAuthToken(token)
  }, [token])

  if (checkingSession) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Checking Session</h1>
          <p className="brand-subtext">Please wait...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to="/login" replace />}
      />
      <Route
        path="/player-login"
        element={playerToken
          ? <Navigate to="/player-panel" replace />
          : <PlayerLoginPage onLogin={handlePlayerLogin} loading={submittingPlayerLogin} error={playerAuthError} />}
      />
      <Route
        path="/player-panel"
        element={playerToken && playerProfile
          ? (
            <PlayerPanelPage
              playerAccount={playerAccount}
              playerProfile={playerProfile}
              onSave={handlePlayerProfileSave}
              onLogout={handlePlayerLogout}
              loading={savingPlayerProfile}
            />
          )
          : <Navigate to="/player-login" replace />}
      />
      <Route
        path="/login"
        element={authUser
          ? <Navigate to={firstAllowedPath} replace />
          : <LoginPage onLogin={handleLogin} isSubmitting={submittingLogin} error={authError} />}
      />
      <Route
        path="/dashboard"
        element={authUser?.role === 'super_admin'
          ? <DashboardPage authUser={authUser} onLogout={handleLogout} canAccess={canAccess} />
          : <Navigate to={authUser ? firstAllowedPath : '/login'} replace />}
      />
      <Route
        path="/schedule"
        element={authUser && canAccess('schedule')
          ? <ScheduleManagerPage authUser={authUser} onLogout={handleLogout} canAccess={canAccess} />
          : <Navigate to={authUser ? firstAllowedPath : '/login'} replace />}
      />
      <Route
        path="/players"
        element={authUser && canAccess('players')
          ? <PlayersManagerPage authUser={authUser} onLogout={handleLogout} canAccess={canAccess} />
          : <Navigate to={authUser ? firstAllowedPath : '/login'} replace />}
      />
      <Route
        path="/player-credentials"
        element={authUser?.role === 'super_admin'
          ? <PlayerCredentialsPage authUser={authUser} onLogout={handleLogout} canAccess={canAccess} />
          : <Navigate to={authUser ? firstAllowedPath : '/login'} replace />}
      />
      <Route
        path="/achievements"
        element={authUser && canAccess('achievements')
          ? <AchievementsManagerPage authUser={authUser} onLogout={handleLogout} canAccess={canAccess} />
          : <Navigate to={authUser ? firstAllowedPath : '/login'} replace />}
      />
      <Route
        path="/user-feedback"
        element={authUser
          ? <UserFeedbackPage authUser={authUser} onLogout={handleLogout} canAccess={canAccess} />
          : <Navigate to="/login" replace />}
      />
      <Route
        path="/admins"
        element={authUser?.role === 'super_admin'
          ? <AdminUsersPage authUser={authUser} onLogout={handleLogout} canAccess={canAccess} />
          : <Navigate to={authUser ? firstAllowedPath : '/login'} replace />}
      />
      <Route
        path="/profile"
        element={authUser
          ? <ProfilePage authUser={authUser} onLogout={handleLogout} canAccess={canAccess} onUserUpdated={updateAuthUser} />
          : <Navigate to="/login" replace />}
      />
      <Route
        path="/forbidden"
        element={authUser ? <Navigate to={firstAllowedPath} replace /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={authUser ? firstAllowedPath : '/login'} replace />} />
    </Routes>
  )
}

export default App

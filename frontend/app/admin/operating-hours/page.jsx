'use client'
import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'
import { useUI } from '@/context/UIContext'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function defaultHours() {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    open_time: '09:00',
    close_time: '18:00',
    is_open: i !== 0  // Sunday closed by default
  }))
}

export default function OperatingHoursPage() {
  const [hours, setHours] = useState(defaultHours())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const { alert } = useUI()

  useEffect(() => { loadHours() }, [])

  async function loadHours() {
    try {
      const data = await apiService.getOperatingHours()
      if (data && data.length > 0) {
        // Sort by day_of_week and merge with defaults
        const map = new Map(data.map(d => [d.day_of_week, d]))
        setHours(Array.from({ length: 7 }, (_, i) => {
          const entry = map.get(i)
          return entry
            ? { day_of_week: i, open_time: entry.open_time?.slice(0, 5) || '09:00', close_time: entry.close_time?.slice(0, 5) || '18:00', is_open: entry.is_open }
            : { day_of_week: i, open_time: '09:00', close_time: '18:00', is_open: i !== 0 }
        }))
      }
    } catch (error) {
      console.error('Error loading operating hours:', error)
    } finally {
      setLoading(false)
    }
  }

  function updateDay(dayOfWeek, field, value) {
    setHours(h => h.map(d => d.day_of_week === dayOfWeek ? { ...d, [field]: value } : d))
  }

  async function saveHours(e) {
    e.preventDefault()
    setMessage('')
    setSaving(true)
    try {
      await apiService.updateOperatingHours(hours)
      setMessage('Operating hours saved successfully.')
    } catch (error) {
      await alert({ title: 'Save Failed', message: error.response?.data?.error || 'Error saving hours', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Operating Hours</h2>

      <div className="card">
        <div className="card-header"><h5 className="m-0 font-semibold">Set Weekly Operating Hours</h5></div>
        <div className="card-body">
          {loading ? (
            <div className="loading"><div className="spinner-border"></div></div>
          ) : (
            <form onSubmit={saveHours}>
              {message && <div className="alert alert-success mb-4">{message}</div>}

              <div className="space-y-3">
                {hours.map(day => (
                  <div key={day.day_of_week} className="p-4 border border-gray-200 rounded-lg">
                    <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id={`open-${day.day_of_week}`}
                          checked={day.is_open}
                          onChange={e => updateDay(day.day_of_week, 'is_open', e.target.checked)}
                        />
                        <label htmlFor={`open-${day.day_of_week}`} className="font-semibold text-gray-700">
                          {DAY_NAMES[day.day_of_week]}
                        </label>
                      </div>

                      <div>
                        <label className="form-label">Open Time</label>
                        <input
                          type="time"
                          className="form-control"
                          value={day.open_time}
                          disabled={!day.is_open}
                          onChange={e => updateDay(day.day_of_week, 'open_time', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label">Close Time</label>
                        <input
                          type="time"
                          className="form-control"
                          value={day.close_time}
                          disabled={!day.is_open}
                          onChange={e => updateDay(day.day_of_week, 'close_time', e.target.value)}
                        />
                      </div>

                      <div className="flex items-center pt-5">
                        {day.is_open ? (
                          <span className="badge bg-success">Open</span>
                        ) : (
                          <span className="badge bg-danger">Closed</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm mr-2"></span>}
                  <i className="bi bi-save mr-2"></i>Save Operating Hours
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

import { useUI } from '@/context/UIContext'
import { apiService } from '@/services/api'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function normalizeRows(rows) {
  const rowMap = new Map((Array.isArray(rows) ? rows : []).map(row => [row.day_of_week, row]))
  return DAY_NAMES.map((label, day_of_week) => {
    const row = rowMap.get(day_of_week)
    return {
      id: row?.id ?? null,
      day_of_week,
      label,
      is_available: Boolean(row?.is_available),
      start_time: row?.start_time?.slice(0, 5) || '09:00',
      end_time: row?.end_time?.slice(0, 5) || '18:00',
    }
  })
}

function formatTime(value) {
  if (!value) return 'Closed'
  const [hours, minutes] = value.split(':')
  const hour = Number(hours)
  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`
}

export default function StylistAvailabilityPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const { alert } = useUI()

  useEffect(() => {
    loadAvailability()
  }, [])

  async function loadAvailability() {
    setLoading(true)
    try {
      const data = await apiService.getStylistWeeklyAvailability()
      setRows(normalizeRows(data))
    } catch (error) {
      console.error('Error loading weekly availability:', error)
      setRows(normalizeRows([]))
    } finally {
      setLoading(false)
    }
  }

  function updateRow(dayOfWeek, updates) {
    setRows(current =>
      current.map(row => (row.day_of_week === dayOfWeek ? { ...row, ...updates } : row))
    )
  }

  async function handleSave(event) {
    event.preventDefault()
    setFormError('')
    setSaveMessage('')

    for (const row of rows) {
      if (!row.is_available) continue
      if (!row.start_time || !row.end_time) {
        return setFormError(`Start and end time are required for ${row.label}`)
      }
      if (row.end_time <= row.start_time) {
        return setFormError(`End time must be after start time for ${row.label}`)
      }
    }

    setSaving(true)
    try {
      const responses = await Promise.all(
        rows.map(row => {
          const payload = {
            day_of_week: row.day_of_week,
            is_available: row.is_available,
            start_time: row.is_available ? row.start_time : null,
            end_time: row.is_available ? row.end_time : null,
          }
          return row.id
            ? apiService.updateStylistWeeklyAvailability(row.id, payload)
            : apiService.createStylistWeeklyAvailability(payload)
        })
      )

      const updatedRows = responses.map(response => response.availability || response)
      const notifications = responses.flatMap(response => response.updated_appointments || [])
      setRows(normalizeRows(updatedRows))

      const rescheduled = notifications.filter(item => item.action === 'rescheduled').length
      const cancelled = notifications.filter(item => item.action === 'cancelled').length
      const summary = []
      if (rescheduled) summary.push(`${rescheduled} appointment${rescheduled === 1 ? '' : 's'} rescheduled`)
      if (cancelled) summary.push(`${cancelled} appointment${cancelled === 1 ? '' : 's'} cancelled`)
      setSaveMessage(
        summary.length > 0
          ? `Weekly availability saved. ${summary.join(' and ')} automatically.`
          : 'Weekly availability saved successfully.'
      )
    } catch (error) {
      setFormError(error.response?.data?.error || 'Error saving weekly availability')
      await alert({
        title: 'Save Failed',
        message: error.response?.data?.error || 'Error saving weekly availability',
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="text-stone-100">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Weekly Availability</h2>
          <p className="text-sm text-stone-300 mt-2 max-w-3xl leading-relaxed">
            Your week starts with the salon&apos;s operating hours. Change any day here and future conflicting bookings will be rescheduled or cancelled automatically.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h5 className="m-0 font-semibold">Set Your Recurring Schedule</h5>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="loading"><div className="spinner-border"></div></div>
          ) : (
            <form onSubmit={handleSave}>
              {formError && <div className="alert alert-danger mb-4">{formError}</div>}
              {saveMessage && <div className="alert alert-success mb-4">{saveMessage}</div>}

              <div className="space-y-4">
                {rows.map(row => (
                  <div
                    key={row.day_of_week}
                    className={`rounded-2xl p-5 border transition-colors ${
                      row.is_available
                        ? 'border-white/20 bg-white/[0.03]'
                        : 'border-white/10 bg-black/10'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_auto] gap-4 items-center">
                      <div className="flex items-center gap-3">
                        <input
                          id={`weekly-open-${row.day_of_week}`}
                          type="checkbox"
                          className="form-check-input accent-amber-400"
                          checked={row.is_available}
                          onChange={event => updateRow(row.day_of_week, { is_available: event.target.checked })}
                        />
                        <label
                          htmlFor={`weekly-open-${row.day_of_week}`}
                          className={`text-xl font-semibold ${
                            row.is_available ? 'text-stone-100' : 'text-stone-400'
                          }`}
                        >
                          {row.label}
                        </label>
                      </div>

                      <div>
                        <label className="form-label text-stone-200">Start Time</label>
                        <input
                          type="time"
                          className="form-control text-stone-100"
                          value={row.start_time}
                          disabled={!row.is_available}
                          onChange={event => updateRow(row.day_of_week, { start_time: event.target.value })}
                        />
                      </div>

                      <div>
                        <label className="form-label text-stone-200">End Time</label>
                        <input
                          type="time"
                          className="form-control text-stone-100"
                          value={row.end_time}
                          disabled={!row.is_available}
                          onChange={event => updateRow(row.day_of_week, { end_time: event.target.value })}
                        />
                      </div>

                      <div className="md:text-right">
                        <span
                          className={`badge ${
                            row.is_available
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {row.is_available ? `${formatTime(row.start_time)} - ${formatTime(row.end_time)}` : 'Closed'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex gap-3">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm mr-2"></span>}
                  <i className="bi bi-save mr-2"></i>Save Weekly Availability
                </button>
                <button type="button" className="btn btn-secondary" onClick={loadAvailability} disabled={saving}>
                  <i className="bi bi-arrow-clockwise mr-2"></i>Reload
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

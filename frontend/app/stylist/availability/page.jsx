'use client'
import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'
import { useUI } from '@/context/UIContext'

function getTodayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function StylistAvailabilityPage() {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [addForm, setAddForm] = useState({ date: getTodayString(), start_time: '09:00', end_time: '17:00' })
  const [formError, setFormError] = useState('')
  const [adding, setAdding] = useState(false)
  const { alert, confirm } = useUI()

  useEffect(() => { loadSlots() }, [])

  async function loadSlots() {
    setLoading(true)
    try {
      const data = await apiService.getStylistAvailability()
      setSlots(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error loading availability:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setAddForm(f => ({ ...f, [name]: value }))
  }

  async function handleAdd(e) {
    e.preventDefault()
    setFormError('')
    if (!addForm.date) return setFormError('Date is required')
    if (!addForm.start_time) return setFormError('Start time is required')
    if (!addForm.end_time) return setFormError('End time is required')
    if (addForm.end_time <= addForm.start_time) return setFormError('End time must be after start time')

    setAdding(true)
    try {
      await apiService.addAvailabilitySlot(addForm)
      await loadSlots()
      setAddForm({ date: getTodayString(), start_time: '09:00', end_time: '17:00' })
    } catch (error) {
      setFormError(error.response?.data?.error || 'Error adding slot')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id) {
    if (await confirm({ title: 'Delete Slot', message: 'Remove this availability slot?', confirmText: 'Delete' })) {
      try {
        await apiService.deleteAvailabilitySlot(id)
        await loadSlots()
      } catch (error) {
        await alert({ title: 'Error', message: error.response?.data?.error || 'Error deleting slot', tone: 'error' })
      }
    }
  }

  function formatDate(d) {
    if (!d) return '—'
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatTime(t) {
    if (!t) return '—'
    const [h, m] = t.split(':')
    const hr = parseInt(h)
    const ampm = hr >= 12 ? 'PM' : 'AM'
    return `${hr % 12 || 12}:${m} ${ampm}`
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Manage Availability</h2>

      <div className="grid grid-cols-2 gap-6">
        {/* Add Slot */}
        <div className="card">
          <div className="card-header"><h5 className="m-0 font-semibold">Add Availability Slot</h5></div>
          <div className="card-body">
            <form onSubmit={handleAdd}>
              {formError && <div className="alert alert-danger">{formError}</div>}

              <div className="mb-4">
                <label className="form-label">Date *</label>
                <input type="date" className="form-control" name="date"
                  value={addForm.date} onChange={handleFormChange}
                  min={getTodayString()} />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="form-label">Start Time *</label>
                  <input type="time" className="form-control" name="start_time"
                    value={addForm.start_time} onChange={handleFormChange} />
                </div>
                <div>
                  <label className="form-label">End Time *</label>
                  <input type="time" className="form-control" name="end_time"
                    value={addForm.end_time} onChange={handleFormChange} />
                </div>
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={adding}>
                {adding && <span className="spinner-border spinner-border-sm mr-2"></span>}
                <i className="bi bi-plus-circle mr-2"></i>Add Slot
              </button>
            </form>
          </div>
        </div>

        {/* Slot List */}
        <div className="card">
          <div className="card-header"><h5 className="m-0 font-semibold">Your Availability Slots</h5></div>
          <div className="card-body p-0">
            {loading ? (
              <div className="loading"><div className="spinner-border"></div></div>
            ) : slots.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                <i className="bi bi-calendar-x text-4xl mb-2 block"></i>
                No availability slots set.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Start</th><th>End</th><th></th></tr>
                </thead>
                <tbody>
                  {slots.map(slot => (
                    <tr key={slot.id}>
                      <td>{formatDate(slot.date)}</td>
                      <td>{formatTime(slot.start_time)}</td>
                      <td>{formatTime(slot.end_time)}</td>
                      <td>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(slot.id)}>
                          <i className="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'
import { useUI } from '@/context/UIContext'

export default function AdminAppointmentsPage() {
  const [appointments, setAppointments] = useState([])
  const [stylists, setStylists] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterStylist, setFilterStylist] = useState('')
  const { alert, confirm } = useUI()

  useEffect(() => { loadStylists() }, [])
  useEffect(() => { loadAppointments() }, [filterStatus, filterStylist])

  async function loadStylists() {
    try {
      const data = await apiService.getStylists()
      setStylists(data)
    } catch (error) {
      console.error('Error loading stylists:', error)
    }
  }

  async function loadAppointments() {
    setLoading(true)
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterStylist) params.stylist_id = filterStylist
      const data = await apiService.getAdminAppointments(params)
      setAppointments(data)
    } catch (error) {
      console.error('Error loading appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(id) {
    if (await confirm({ title: 'Cancel Appointment', message: 'Are you sure you want to cancel this appointment?', confirmText: 'Cancel Appointment' })) {
      try {
        await apiService.cancelAppointment(id)
        await loadAppointments()
      } catch (error) {
        await alert({ title: 'Error', message: error.response?.data?.error || 'Error cancelling appointment', tone: 'error' })
      }
    }
  }

  function statusBadgeClass(status) {
    if (status === 'Completed') return 'badge badge-completed'
    if (status === 'Cancelled') return 'badge badge-cancelled'
    if (status === 'WalkIn') return 'badge bg-info'
    return 'badge badge-booked'
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
      <h2 className="text-2xl font-bold text-gray-800 mb-6">All Appointments</h2>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Filter by Status</label>
              <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="Booked">Booked</option>
                <option value="WalkIn">Walk-in</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="form-label">Filter by Stylist</label>
              <select className="form-select" value={filterStylist} onChange={e => setFilterStylist(e.target.value)}>
                <option value="">All Stylists</option>
                {stylists.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button className="btn btn-secondary" onClick={() => { setFilterStatus(''); setFilterStylist('') }}>
                <i className="bi bi-x-circle mr-2"></i>Clear Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="loading"><div className="spinner-border"></div></div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th><th>Phone</th><th>Date</th><th>Time</th>
                  <th>Stylist</th><th>Service</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-8">No appointments found.</td></tr>
                ) : appointments.map(apt => (
                  <tr key={apt.id}>
                    <td>{apt.customer_name}</td>
                    <td>{apt.customer_phone}</td>
                    <td>{apt.appointment_date || '—'}</td>
                    <td>{apt.appointment_time ? formatTime(apt.appointment_time) : '—'}</td>
                    <td>{apt.stylist?.full_name || '—'}</td>
                    <td>{apt.service?.name || '—'}</td>
                    <td><span className={statusBadgeClass(apt.status)}>{apt.status}</span></td>
                    <td>
                      {(apt.status === 'Booked' || apt.status === 'WalkIn') && (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleCancel(apt.id)}>
                          <i className="bi bi-x-circle mr-1"></i>Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

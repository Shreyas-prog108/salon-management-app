'use client'
import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'
import { useUI } from '@/context/UIContext'

const emptyServiceRecord = { service_performed: '', notes: '', price_charged: '' }

export default function StylistAppointmentsPage() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [selectedApt, setSelectedApt] = useState(null)
  const [serviceRecord, setServiceRecord] = useState(emptyServiceRecord)
  const [recordError, setRecordError] = useState('')
  const { alert, confirm } = useUI()

  useEffect(() => { loadAppointments() }, [filterDate, filterStatus])

  async function loadAppointments() {
    setLoading(true)
    try {
      const params = {}
      if (filterDate) params.date = filterDate
      if (filterStatus) params.status = filterStatus
      const data = await apiService.getStylistAppointments(params)
      setAppointments(data)
    } catch (error) {
      console.error('Error loading appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(id) {
    if (await confirm({ title: 'Cancel Appointment', message: 'Cancel this appointment?', confirmText: 'Yes, Cancel' })) {
      try {
        await apiService.updateAppointmentStatus(id, 'Cancelled')
        await loadAppointments()
      } catch (error) {
        await alert({ title: 'Error', message: error.response?.data?.error || 'Error cancelling', tone: 'error' })
      }
    }
  }

  function openCompleteModal(apt) {
    setSelectedApt(apt)
    setServiceRecord({ service_performed: apt.service?.name || '', notes: '', price_charged: apt.service?.price || '' })
    setRecordError('')
    setShowRecordModal(true)
  }

  async function submitServiceRecord(e) {
    e.preventDefault()
    setRecordError('')
    if (!serviceRecord.service_performed?.trim()) return setRecordError('Service performed is required')
    try {
      // Must mark Completed first before the service record can be saved
      await apiService.updateAppointmentStatus(selectedApt.id, 'Completed')
      await apiService.addServiceRecord(selectedApt.id, {
        service_performed: serviceRecord.service_performed,
        notes: serviceRecord.notes,
        price_charged: serviceRecord.price_charged !== '' ? Number(serviceRecord.price_charged) : null
      })
      setShowRecordModal(false)
      await loadAppointments()
      await alert({ title: 'Completed', message: 'Appointment marked as completed.', tone: 'info' })
    } catch (error) {
      setRecordError(error.response?.data?.error || 'Error completing appointment')
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
      <h2 className="text-2xl font-bold text-gray-800 mb-6">My Schedule</h2>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Filter by Date</label>
              <input type="date" className="form-control"
                value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
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
            <div className="flex items-end">
              <button className="btn btn-secondary" onClick={() => { setFilterDate(''); setFilterStatus('') }}>
                <i className="bi bi-x-circle mr-2"></i>Clear
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
                  <th>Service</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-8">No appointments found.</td></tr>
                ) : appointments.map(apt => (
                  <tr key={apt.id}>
                    <td>{apt.customer_name}</td>
                    <td>{apt.customer_phone}</td>
                    <td>{apt.appointment_date || (apt.is_walkin ? 'Today (Walk-in)' : '—')}</td>
                    <td>{apt.appointment_time ? formatTime(apt.appointment_time) : (apt.is_walkin ? 'Now' : '—')}</td>
                    <td>{apt.service?.name || '—'}</td>
                    <td><span className={statusBadgeClass(apt.status)}>{apt.status}</span></td>
                    <td>
                      <div className="flex gap-2">
                        {(apt.status === 'Booked' || apt.status === 'WalkIn') && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => openCompleteModal(apt)}>
                              <i className="bi bi-check-circle mr-1"></i>Complete
                            </button>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleCancel(apt.id)}>
                              <i className="bi bi-x-circle mr-1"></i>Cancel
                            </button>
                          </>
                        )}
                        {apt.service_record && (
                          <span className="text-xs text-gray-400 flex items-center">
                            <i className="bi bi-file-check mr-1"></i>Record
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showRecordModal && (
        <div className="custom-modal-overlay" onClick={() => setShowRecordModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Complete Appointment</h5>
                <button className="btn-close" onClick={() => setShowRecordModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                  <strong>{selectedApt?.customer_name}</strong> — {selectedApt?.service?.name}
                </div>
                <form onSubmit={submitServiceRecord}>
                  {recordError && <div className="alert alert-danger">{recordError}</div>}
                  <div className="mb-4">
                    <label className="form-label">Service Performed *</label>
                    <input type="text" className="form-control"
                      value={serviceRecord.service_performed}
                      onChange={e => setServiceRecord(r => ({ ...r, service_performed: e.target.value }))}
                      placeholder="What was done" />
                  </div>
                  <div className="mb-4">
                    <label className="form-label">Notes</label>
                    <textarea className="form-control" rows={3}
                      value={serviceRecord.notes}
                      onChange={e => setServiceRecord(r => ({ ...r, notes: e.target.value }))}
                      placeholder="Any additional notes" />
                  </div>
                  <div className="mb-4">
                    <label className="form-label">Price Charged (₹)</label>
                    <input type="number" min="0" step="0.01" className="form-control"
                      value={serviceRecord.price_charged}
                      onChange={e => setServiceRecord(r => ({ ...r, price_charged: e.target.value }))} />
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowRecordModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">
                      <i className="bi bi-check-circle mr-2"></i>Mark Complete
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

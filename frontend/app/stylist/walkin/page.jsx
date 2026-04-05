'use client'
import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'
import { useUI } from '@/context/UIContext'

export default function StylistWalkinPage() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(false)
  const [servicesLoading, setServicesLoading] = useState(true)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    service_id: '',
    reason: ''
  })
  const { alert } = useUI()

  useEffect(() => { loadServices() }, [])

  async function loadServices() {
    try {
      const data = await apiService.getPublicServices()
      setServices(data)
    } catch (error) {
      console.error('Error loading services:', error)
    } finally {
      setServicesLoading(false)
    }
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess(null)
    if (!form.customer_name.trim()) return setError('Customer name is required')
    if (!form.customer_phone.trim()) return setError('Customer phone is required')
    if (!form.service_id) return setError('Please select a service')

    setLoading(true)
    try {
      const stylistId = apiService.user?.id
      const data = await apiService.createWalkin({
        stylist_id: stylistId,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        service_id: Number(form.service_id),
        reason: form.reason
      })
      setSuccess(data)
      setForm({ customer_name: '', customer_phone: '', service_id: '', reason: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Error registering walk-in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Register Walk-in</h2>

      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header"><h5 className="m-0 font-semibold">Walk-in Customer Details</h5></div>
          <div className="card-body">
            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label className="form-label">Customer Name *</label>
                <input type="text" className="form-control" name="customer_name"
                  value={form.customer_name} onChange={handleChange} placeholder="Full name" />
              </div>

              <div className="mb-4">
                <label className="form-label">Customer Phone *</label>
                <input type="tel" className="form-control" name="customer_phone"
                  value={form.customer_phone} onChange={handleChange} placeholder="10-digit phone number" />
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <i className="bi bi-exclamation-triangle-fill"></i>
                  Digits only — no country code (e.g. 9876543210)
                </p>
              </div>

              <div className="mb-4">
                <label className="form-label">Service *</label>
                <select className="form-select" name="service_id"
                  value={form.service_id} onChange={handleChange}>
                  <option value="">— Select a service —</option>
                  {servicesLoading ? (
                    <option disabled>Loading services...</option>
                  ) : services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — ₹{s.price} ({s.duration_minutes} min)</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="form-label">Notes / Reason</label>
                <textarea className="form-control" name="reason"
                  value={form.reason} onChange={handleChange}
                  rows={2} placeholder="Optional notes about this visit" />
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading && <span className="spinner-border spinner-border-sm mr-2"></span>}
                <i className="bi bi-person-plus mr-2"></i>
                {loading ? 'Registering...' : 'Register Walk-in'}
              </button>
            </form>
          </div>
        </div>

        {/* Confirmation panel */}
        {success && (
          <div className="card">
            <div className="card-header"><h5 className="m-0 font-semibold">Walk-in Registered</h5></div>
            <div className="card-body">
              <div className="text-center mb-4">
                <i className="bi bi-check-circle-fill text-5xl text-[#2f8f57]"></i>
                <h4 className="mt-3 font-bold text-gray-800">Successfully Registered!</h4>
              </div>
              <table className="table">
                <tbody>
                  <tr><td className="font-medium">Customer</td><td>{success.customer_name || form.customer_name}</td></tr>
                  <tr><td className="font-medium">Phone</td><td>{success.customer_phone || form.customer_phone}</td></tr>
                  <tr><td className="font-medium">Service</td><td>{success.service?.name || services.find(s => s.id === Number(form.service_id))?.name}</td></tr>
                  <tr><td className="font-medium">Status</td><td><span className="badge bg-info">WalkIn</span></td></tr>
                  {success.id && <tr><td className="font-medium">Booking ID</td><td>#{success.id}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

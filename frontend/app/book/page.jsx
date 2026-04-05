'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiService } from '@/services/api'

const STEPS = ['Service', 'Stylist', 'Date & Time', 'Details', 'Confirm']

function getTodayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function BookPage() {
  const [step, setStep] = useState(0)
  const [services, setServices] = useState([])
  const [stylists, setStylists] = useState([])
  const [slots, setSlots] = useState([])

  const [selectedService, setSelectedService] = useState(null)
  const [selectedStylist, setSelectedStylist] = useState(null)
  const [selectedDate, setSelectedDate] = useState(getTodayString())
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', customer_email: '', reason: '' })

  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingStylists, setLoadingStylists] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [booking, setBooking] = useState(null)
  const [bookingError, setBookingError] = useState('')
  const [formError, setFormError] = useState('')

  // Lookup section
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResults, setLookupResults] = useState(null)
  const [lookupError, setLookupError] = useState('')

  useEffect(() => {
    async function loadServices() {
      try {
        const data = await apiService.getPublicServices()
        setServices(data)
      } catch (e) {
        console.error('Error loading services:', e)
      } finally {
        setLoadingServices(false)
      }
    }
    loadServices()
  }, [])

  async function handleSelectService(service) {
    setSelectedService(service)
    setSelectedStylist(null)
    setSlots([])
    setSelectedSlot(null)
    setLoadingStylists(true)
    setStep(1)
    try {
      const data = await apiService.getPublicStylists({ service_id: service.id })
      setStylists(data)
    } catch (e) {
      console.error('Error loading stylists:', e)
      setStylists([])
    } finally {
      setLoadingStylists(false)
    }
  }

  async function handleSelectStylist(stylist) {
    setSelectedStylist(stylist)
    setSelectedSlot(null)
    setStep(2)
    await loadSlots(stylist.id, selectedDate)
  }

  async function loadSlots(stylistId, date) {
    if (!stylistId || !date) return
    setLoadingSlots(true)
    setSlots([])
    try {
      const data = await apiService.getStylistSlots(stylistId, date, selectedService?.id)
      setSlots(Array.isArray(data) ? data : [])
    } catch (e) {
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  async function handleDateChange(date) {
    setSelectedDate(date)
    setSelectedSlot(null)
    if (selectedStylist) await loadSlots(selectedStylist.id, date)
  }

  async function handleSubmitBooking(e) {
    e.preventDefault()
    setFormError(''); setBookingError('')
    if (!form.customer_name.trim()) return setFormError('Name is required')
    if (!form.customer_phone.trim()) return setFormError('Phone is required')
    if (!selectedSlot) return setFormError('Please select a time slot')
    setSubmitting(true)
    try {
      const data = await apiService.bookAppointment({
        stylist_id: selectedStylist.id,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email,
        appointment_date: selectedDate,
        appointment_time: selectedSlot,
        service_id: selectedService.id,
        reason: form.reason
      })
      setBooking(data)
      setStep(4)
    } catch (err) {
      setBookingError(err.response?.data?.error || 'Booking failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLookup(e) {
    e.preventDefault()
    setLookupError(''); setLookupResults(null)
    if (!lookupPhone.trim()) return setLookupError('Please enter a phone number')
    setLookupLoading(true)
    try {
      const data = await apiService.lookupAppointments(lookupPhone)
      setLookupResults(Array.isArray(data) ? data : [])
    } catch (err) {
      setLookupError(err.response?.data?.error || 'Failed to look up appointments')
    } finally {
      setLookupLoading(false)
    }
  }

  function resetBooking() {
    setStep(0); setSelectedService(null); setSelectedStylist(null)
    setSelectedDate(getTodayString()); setSelectedSlot(null)
    setForm({ customer_name: '', customer_phone: '', customer_email: '', reason: '' })
    setBooking(null); setBookingError(''); setFormError('')
  }

  function formatTime(t) {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hr = parseInt(h)
    const ampm = hr >= 12 ? 'PM' : 'AM'
    return `${hr % 12 || 12}:${m} ${ampm}`
  }

  function statusBadgeClass(status) {
    if (status === 'Completed') return 'badge badge-completed'
    if (status === 'Cancelled') return 'badge badge-cancelled'
    if (status === 'WalkIn') return 'badge bg-info'
    return 'badge badge-booked'
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f0faf4 0%, #e8f5e9 100%)' }}>
      {/* Header */}
      <nav className="navbar-custom">
        <a className="text-white font-bold text-lg flex items-center no-underline" href="/book">
          <i className="bi bi-scissors mr-2"></i>
          Salon Manager
        </a>
        <Link href="/auth/login" className="btn btn-sm text-white border border-white/40 hover:bg-white/10">
          <i className="bi bi-person mr-1"></i>Staff Login
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Book an Appointment</h1>
          <p className="text-gray-500">Schedule your salon visit in minutes</p>
        </div>

        {/* Step indicator */}
        {step < 4 && (
          <div className="flex items-center justify-center mb-8">
            {STEPS.slice(0, 4).map((label, i) => (
              <div key={i} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  i < step ? 'bg-[#2f8f57] text-white' :
                  i === step ? 'bg-[#2f8f57] text-white ring-4 ring-[#2f8f57]/30' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {i < step ? <i className="bi bi-check"></i> : i + 1}
                </div>
                <span className={`mx-2 text-sm font-medium ${i === step ? 'text-[#2f8f57]' : 'text-gray-400'}`}>{label}</span>
                {i < 3 && <div className={`w-8 h-0.5 mx-1 ${i < step ? 'bg-[#2f8f57]' : 'bg-gray-200'}`}></div>}
              </div>
            ))}
          </div>
        )}

        {/* Step 0: Select Service */}
        {step === 0 && (
          <div className="card">
            <div className="card-header"><h5 className="m-0 font-semibold">Step 1: Choose a Service</h5></div>
            <div className="card-body">
              {loadingServices ? (
                <div className="loading"><div className="spinner-border"></div></div>
              ) : services.length === 0 ? (
                <p className="text-center text-gray-400">No services available at this time.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {services.map(service => (
                    <div
                      key={service.id}
                      className="border-2 border-gray-200 rounded-xl p-4 cursor-pointer hover:border-[#2f8f57] hover:bg-[#f0faf4] transition-all"
                      onClick={() => handleSelectService(service)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-bold text-gray-800 mb-1">{service.name}</h5>
                          <p className="text-sm text-gray-500 mb-2">{service.description || 'Professional salon service'}</p>
                          <div className="flex gap-3 text-sm">
                            <span className="text-[#2f8f57] font-semibold">₹{Number(service.price).toLocaleString()}</span>
                            <span className="text-gray-400"><i className="bi bi-clock mr-1"></i>{service.duration_minutes} min</span>
                          </div>
                        </div>
                        <i className="bi bi-scissors text-2xl text-[#2f8f57]/40"></i>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Select Stylist */}
        {step === 1 && (
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h5 className="m-0 font-semibold">Step 2: Choose a Stylist</h5>
              <button className="btn btn-sm text-white border border-white/40" onClick={() => setStep(0)}>
                <i className="bi bi-arrow-left mr-1"></i>Back
              </button>
            </div>
            <div className="card-body">
              <div className="mb-4 p-3 bg-[#f0faf4] rounded-lg text-sm text-gray-600">
                Selected: <strong>{selectedService?.name}</strong> — ₹{selectedService?.price}
              </div>
              {loadingStylists ? (
                <div className="loading"><div className="spinner-border"></div></div>
              ) : stylists.length === 0 ? (
                <p className="text-center text-gray-400">No stylists available for this service.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {stylists.map(stylist => (
                    <div
                      key={stylist.id}
                      className="border-2 border-gray-200 rounded-xl p-4 cursor-pointer hover:border-[#2f8f57] hover:bg-[#f0faf4] transition-all"
                      onClick={() => handleSelectStylist(stylist)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-[#2f8f57] flex items-center justify-center text-white font-bold text-lg">
                          {(stylist.full_name || stylist.username || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h5 className="font-bold text-gray-800 mb-0">{stylist.full_name}</h5>
                          <p className="text-sm text-[#2f8f57] mb-0">{stylist.specialty || 'General Styling'}</p>
                          {stylist.experience_years > 0 && (
                            <p className="text-xs text-gray-400">{stylist.experience_years} years experience</p>
                          )}
                        </div>
                      </div>
                      {stylist.bio && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{stylist.bio}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Date & Time */}
        {step === 2 && (
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h5 className="m-0 font-semibold">Step 3: Choose Date & Time</h5>
              <button className="btn btn-sm text-white border border-white/40" onClick={() => setStep(1)}>
                <i className="bi bi-arrow-left mr-1"></i>Back
              </button>
            </div>
            <div className="card-body">
              <div className="mb-4 p-3 bg-[#f0faf4] rounded-lg text-sm text-gray-600">
                <strong>{selectedService?.name}</strong> with <strong>{selectedStylist?.full_name}</strong>
              </div>

              <div className="mb-6">
                <label className="form-label">Select Date</label>
                <input type="date" className="form-control w-64"
                  value={selectedDate} min={getTodayString()}
                  onChange={e => handleDateChange(e.target.value)} />
              </div>

              <div>
                <label className="form-label">Available Time Slots</label>
                {loadingSlots ? (
                  <div className="loading py-8"><div className="spinner-border"></div></div>
                ) : slots.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 bg-gray-50 rounded-lg">
                    <i className="bi bi-calendar-x text-3xl mb-2 block"></i>
                    No available slots for this date. Try another date.
                  </div>
                ) : (
                  <div className="time-slots-container">
                    {slots.map((slot, i) => {
                      const slotTime = typeof slot === 'string' ? slot : slot.time || slot.start_time
                      return (
                        <div
                          key={i}
                          className={`time-slot${selectedSlot === slotTime ? ' selected' : ''}`}
                          onClick={() => setSelectedSlot(slotTime)}
                        >
                          {formatTime(slotTime)}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedSlot && (
                <div className="mt-6">
                  <button className="btn btn-primary" onClick={() => setStep(3)}>
                    Continue <i className="bi bi-arrow-right ml-2"></i>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Customer Details */}
        {step === 3 && (
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h5 className="m-0 font-semibold">Step 4: Your Details</h5>
              <button className="btn btn-sm text-white border border-white/40" onClick={() => setStep(2)}>
                <i className="bi bi-arrow-left mr-1"></i>Back
              </button>
            </div>
            <div className="card-body">
              <div className="mb-5 p-4 bg-[#f0faf4] rounded-lg text-sm">
                <div className="grid grid-cols-2 gap-2 text-gray-600">
                  <div><strong>Service:</strong> {selectedService?.name}</div>
                  <div><strong>Stylist:</strong> {selectedStylist?.full_name}</div>
                  <div><strong>Date:</strong> {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                  <div><strong>Time:</strong> {formatTime(selectedSlot)}</div>
                  <div><strong>Price:</strong> ₹{Number(selectedService?.price).toLocaleString()}</div>
                  <div><strong>Duration:</strong> {selectedService?.duration_minutes} min</div>
                </div>
              </div>

              {bookingError && <div className="alert alert-danger">{bookingError}</div>}

              <form onSubmit={handleSubmitBooking}>
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="form-label">Your Name *</label>
                    <input type="text" className="form-control"
                      value={form.customer_name}
                      onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                      placeholder="Full name" />
                  </div>
                  <div>
                    <label className="form-label">Your Phone *</label>
                    <input type="tel" className="form-control"
                      value={form.customer_phone}
                      onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                      placeholder="10-digit number" />
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"> digits only — no country code (e.g. 9876543210)
                    </p>
                  </div>
                  <div>
                    <label className="form-label">Your Email <span className="text-gray-400 font-normal text-xs">(optional — for booking confirmation)</span></label>
                    <input
                      type="email"
                      className="form-control"
                      value={form.customer_email}
                      onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="form-label">Notes / Special Requests</label>
                  <textarea className="form-control" rows={2}
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="Any special instructions or requests (optional)" />
                </div>
                <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                  {submitting && <span className="spinner-border spinner-border-sm mr-2"></span>}
                  <i className="bi bi-calendar-check mr-2"></i>
                  {submitting ? 'Booking...' : 'Confirm Booking'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && booking && (
          <div className="card">
            <div className="card-body text-center">
              <i className="bi bi-check-circle-fill text-6xl text-[#2f8f57] block mb-4"></i>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Booking Confirmed!</h3>
              <p className="text-gray-500 mb-6">Your appointment has been booked successfully.</p>

              <div className="bg-[#f0faf4] rounded-xl p-5 text-left mb-6 max-w-sm mx-auto">
                <table className="table">
                  <tbody>
                    <tr><td className="font-medium">Booking ID</td><td>#{booking.id}</td></tr>
                    <tr><td className="font-medium">Customer</td><td>{booking.customer_name}</td></tr>
                    <tr><td className="font-medium">Service</td><td>{booking.service?.name || selectedService?.name}</td></tr>
                    <tr><td className="font-medium">Stylist</td><td>{booking.stylist?.full_name || selectedStylist?.full_name}</td></tr>
                    <tr><td className="font-medium">Date</td><td>{booking.appointment_date}</td></tr>
                    <tr><td className="font-medium">Time</td><td>{formatTime(booking.appointment_time)}</td></tr>
                    <tr><td className="font-medium">Status</td><td><span className="badge badge-booked">Booked</span></td></tr>
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-gray-500 mb-6">
                Save your phone number <strong>{booking.customer_phone}</strong> to look up your appointment later.
              </p>

              <button className="btn btn-primary" onClick={resetBooking}>
                <i className="bi bi-plus-circle mr-2"></i>Book Another Appointment
              </button>
            </div>
          </div>
        )}

        {/* Lookup Section */}
        <div className="card mt-8">
          <div className="card-header"><h5 className="m-0 font-semibold">Look Up My Appointments</h5></div>
          <div className="card-body">
            <p className="text-sm text-gray-500 mb-1">Enter your phone number to view your existing appointments.</p>
            <p className="text-xs text-amber-600 mb-4 flex items-center gap-1">
              Digits only — no country code (e.g. 9876543210)
            </p>
            <form onSubmit={handleLookup}>
              {lookupError && <div className="alert alert-danger">{lookupError}</div>}
              <div className="flex gap-3">
                <input
                  type="tel"
                  className="form-control"
                  placeholder="10-digit phone number"
                  value={lookupPhone}
                  onChange={e => setLookupPhone(e.target.value)}
                />
                <button type="submit" className="btn btn-primary whitespace-nowrap" disabled={lookupLoading}>
                  {lookupLoading && <span className="spinner-border spinner-border-sm mr-2"></span>}
                  <i className="bi bi-search mr-1"></i>Search
                </button>
              </div>
            </form>

            {lookupResults !== null && (
              <div className="mt-4">
                {lookupResults.length === 0 ? (
                  <p className="text-center text-gray-400">No appointments found for this number.</p>
                ) : (
                  <table className="table mt-2">
                    <thead>
                      <tr><th>Date</th><th>Time</th><th>Service</th><th>Stylist</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {lookupResults.map(apt => (
                        <tr key={apt.id}>
                          <td>{apt.appointment_date || 'Walk-in'}</td>
                          <td>{apt.appointment_time ? formatTime(apt.appointment_time) : '—'}</td>
                          <td>{apt.service?.name || '—'}</td>
                          <td>{apt.stylist?.full_name || '—'}</td>
                          <td><span className={statusBadgeClass(apt.status)}>{apt.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

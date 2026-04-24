'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { apiService } from '@/services/api'

const BOOKING_MODES = [
  { id: 'date_time', label: 'By Date & Time', icon: 'bi-calendar-date' },
  { id: 'barber', label: 'By Barber', icon: 'bi-scissors' }
]

const STEP_LABELS = {
  date_time: ['Date & Time', 'Service & Barber', 'Details'],
  barber: ['Barber', 'Time & Service', 'Details']
}

function getTodayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getInitialPreferredTime() {
  const now = new Date()
  const minutes = now.getMinutes()
  const roundedMinutes = minutes === 0 ? 0 : minutes <= 30 ? 30 : 0
  const hourOffset = minutes > 30 ? 1 : 0
  const nextHour = (now.getHours() + hourOffset) % 24
  return `${String(nextHour).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`
}

function shiftTime(value, deltaMinutes) {
  const [hours, minutes] = (value || '00:00').split(':').map(Number)
  let total = (hours * 60) + minutes + deltaMinutes
  total = Math.max(0, Math.min((23 * 60) + 30, total))
  const nextHours = Math.floor(total / 60)
  const nextMinutes = total % 60
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`
}

function formatTime(value) {
  if (!value) return ''
  const [hours, minutes] = value.split(':')
  const hour = Number(hours)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${minutes} ${suffix}`
}

function formatLongDate(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
}

function statusBadgeClass(status) {
  if (status === 'Completed') return 'badge badge-completed'
  if (status === 'Cancelled') return 'badge badge-cancelled'
  if (status === 'WalkIn') return 'badge bg-info'
  return 'badge badge-booked'
}

function availabilityTone(status) {
  if (status === 'full') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'filling_fast') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function availabilityLabel(status) {
  if (status === 'full') return 'Full'
  if (status === 'filling_fast') return 'Filling Fast'
  return 'Available'
}

function BookPageContent() {
  const searchParams = useSearchParams()
  const [bookingMode, setBookingMode] = useState('date_time')
  const [step, setStep] = useState(0)

  const [services, setServices] = useState([])
  const [stylists, setStylists] = useState([])
  const [dateAvailability, setDateAvailability] = useState([])
  const [stylistSchedule, setStylistSchedule] = useState([])

  const [selectedService, setSelectedService] = useState(null)
  const [selectedStylist, setSelectedStylist] = useState(null)
  const [selectedDate, setSelectedDate] = useState(getTodayString())
  const [preferredTime, setPreferredTime] = useState(getInitialPreferredTime())
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [selectedSlotDetails, setSelectedSlotDetails] = useState(null)

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    reason: ''
  })

  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingStylists, setLoadingStylists] = useState(true)
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [loadingSlotDetails, setLoadingSlotDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [booking, setBooking] = useState(null)
  const [bookingError, setBookingError] = useState('')
  const [formError, setFormError] = useState('')

  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResults, setLookupResults] = useState(null)
  const [lookupError, setLookupError] = useState('')

  const activeSteps = STEP_LABELS[bookingMode]

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [serviceData, stylistData] = await Promise.all([
          apiService.getPublicServices(),
          apiService.getPublicStylists()
        ])
        setServices(Array.isArray(serviceData) ? serviceData : [])
        setStylists(Array.isArray(stylistData) ? stylistData : [])
      } catch (error) {
        console.error('Error loading booking data:', error)
      } finally {
        setLoadingServices(false)
        setLoadingStylists(false)
      }
    }

    loadInitialData()
  }, [])

  useEffect(() => {
    if (bookingMode !== 'date_time') return

    async function loadAvailability() {
      setLoadingAvailability(true)
      try {
        const data = await apiService.getBookingAvailability(selectedDate, selectedService?.id, {
          around_time: preferredTime,
          window_slots: 7
        })
        setDateAvailability(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Error loading date availability:', error)
        setDateAvailability([])
      } finally {
        setLoadingAvailability(false)
      }
    }

    loadAvailability()
  }, [bookingMode, selectedDate, selectedService?.id, preferredTime])

  useEffect(() => {
    if (bookingMode !== 'date_time' || !selectedSlot) return

    async function loadSlotDetails() {
      setLoadingSlotDetails(true)
      try {
        const data = await apiService.getBookingSlotDetails(selectedDate, selectedSlot, selectedService?.id)
        setSelectedSlotDetails(data)
      } catch (error) {
        console.error('Error loading slot details:', error)
        setSelectedSlotDetails(null)
      } finally {
        setLoadingSlotDetails(false)
      }
    }

    loadSlotDetails()
  }, [bookingMode, selectedDate, selectedSlot, selectedService?.id])

  useEffect(() => {
    if (bookingMode !== 'barber' || !selectedStylist) return

    async function loadSchedule() {
      setLoadingSchedule(true)
      try {
        const data = await apiService.getStylistSchedule(selectedStylist.id, {
          start_date: selectedDate,
          days: 10,
          service_id: selectedService?.id
        })
        setStylistSchedule(Array.isArray(data?.dates) ? data.dates : [])
      } catch (error) {
        console.error('Error loading stylist schedule:', error)
        setStylistSchedule([])
      } finally {
        setLoadingSchedule(false)
      }
    }

    loadSchedule()
  }, [bookingMode, selectedStylist?.id, selectedDate, selectedService?.id])

  useEffect(() => {
    if (bookingMode !== 'date_time' || !selectedStylist || !selectedSlotDetails) return

    const stillAvailable = selectedSlotDetails.available_barbers?.some(barber => barber.id === selectedStylist.id)
    if (!stillAvailable) setSelectedStylist(null)
  }, [bookingMode, selectedSlotDetails, selectedStylist])

  useEffect(() => {
    const phoneFromQuery = (searchParams.get('phone') || '').trim()
    if (!/^\d{10}$/.test(phoneFromQuery)) return

    setLookupPhone(phoneFromQuery)
    runLookup(phoneFromQuery)
  }, [searchParams])

  function resetFlow(nextMode = bookingMode) {
    setBookingMode(nextMode)
    setStep(0)
    setSelectedService(null)
    setSelectedStylist(null)
    setSelectedSlot(null)
    setSelectedSlotDetails(null)
    setStylistSchedule([])
    setBooking(null)
    setBookingError('')
    setFormError('')
    setForm({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      reason: ''
    })
  }

  function handleModeChange(mode) {
    if (mode === bookingMode) return
    resetFlow(mode)
  }

  function handleDateChange(value) {
    setSelectedDate(value)
    setSelectedSlot(null)
    setSelectedSlotDetails(null)
    setBookingError('')
    if (bookingMode === 'date_time') setStep(0)
  }

  function handleSelectDateTimeSlot(slot) {
    setSelectedDate(slot.date)
    setSelectedSlot(slot.time_slot)
    setSelectedSlotDetails(slot)
    setSelectedStylist(null)
    setBookingError('')
    setStep(1)
  }

  function handleSelectStylist(stylist) {
    setSelectedStylist(stylist)
    setSelectedSlot(null)
    setSelectedSlotDetails(null)
    setBookingError('')
    if (bookingMode === 'barber') setStep(1)
  }

  function handleSelectService(service) {
    setSelectedService(service)
    setBookingError('')
    if (bookingMode === 'barber') {
      setSelectedSlot(null)
      setSelectedSlotDetails(null)
    }
  }

  function handleSelectScheduleSlot(slot, dateValue) {
    setSelectedDate(dateValue)
    setSelectedSlot(slot.time_slot)
    setSelectedSlotDetails(slot)
    setBookingError('')
  }

  async function handleSubmitBooking(event) {
    event.preventDefault()
    setFormError('')
    setBookingError('')

    if (!selectedService) return setFormError('Please select a service')
    if (!selectedSlot) return setFormError('Please select a time slot')
    if (bookingMode === 'barber' && !selectedStylist) return setFormError('Please select a barber')
    if (!form.customer_name.trim()) return setFormError('Name is required')
    if (!form.customer_phone.trim()) return setFormError('Phone is required')

    setSubmitting(true)
    try {
      const data = await apiService.bookAppointment({
        stylist_id: selectedStylist?.id,
        seat_id: selectedSlotDetails?.seat_summary?.available_seat_ids?.[0],
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email,
        appointment_date: selectedDate,
        appointment_time: selectedSlot,
        service_id: selectedService.id,
        reason: form.reason
      })
      setBooking(data)
      setStep(3)
    } catch (error) {
      const response = error.response?.data
      setBookingError(response?.error || 'Booking failed. Please try again.')
      if (response?.suggestions) {
        setSelectedSlotDetails(current => ({
          ...(current || {}),
          suggestions: response.suggestions
        }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function runLookup(phoneValue) {
    setLookupError('')
    setLookupResults(null)
    const normalizedPhone = phoneValue.trim()

    if (!normalizedPhone) return setLookupError('Please enter a phone number')

    setLookupLoading(true)
    try {
      const data = await apiService.lookupAppointments(normalizedPhone)
      setLookupResults(Array.isArray(data) ? data : [])
    } catch (error) {
      setLookupError(error.response?.data?.error || 'Failed to look up appointments')
    } finally {
      setLookupLoading(false)
    }
  }

  async function handleLookup(event) {
    event.preventDefault()
    await runLookup(lookupPhone)
  }

  const availableBarbers = selectedSlotDetails?.available_barbers || []
  const nearbySlots = (selectedSlotDetails?.nearby_slots || []).filter(slot => slot.time_slot !== selectedSlot)
  const selectedBarberStillAvailable = !selectedStylist || availableBarbers.some(barber => barber.id === selectedStylist.id)
  const canContinueDateTime = Boolean(
    selectedService &&
    selectedSlot &&
    selectedSlotDetails &&
    selectedSlotDetails.status !== 'full' &&
    selectedBarberStillAvailable
  )
  const canContinueBarber = Boolean(selectedStylist && selectedService && selectedSlot)

  return (
    <div className="min-h-screen relative font-sans selection:bg-amber-100 selection:text-amber-900 pb-20 bg-stone-950">
      {/* Cinematic Barbershop Background */}
      <div className="fixed inset-0 z-0 pointer-events-none w-full h-full">
        <div className="absolute inset-0 bg-stone-950/60 mix-blend-multiply z-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950/60 via-stone-950/40 to-stone-950 z-10" />
        <img src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=2500&q=80" alt="Premium Barbershop" className="w-full h-full object-cover opacity-70 scale-105 saturate-100" />
      </div>
      <nav className="relative z-20 bg-stone-950/50 backdrop-blur-xl py-5 px-6 lg:px-8 flex justify-between items-center border-b border-white/10">
        <a className="text-white font-serif font-bold text-2xl tracking-tight flex items-center no-underline group" href="/book">
          <div className="w-8 h-8 bg-stone-800 rounded-lg flex items-center justify-center mr-3 group-hover:scale-105 transition-transform"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg></div>Baalbar.
        </a>
        <Link href="/auth/login" className="inline-flex justify-center items-center gap-2 rounded-full bg-white/10 border border-white/20 px-5 py-2 text-sm font-bold text-white backdrop-blur-md transition-all hover:bg-white/20 active:scale-95">
          <i className="bi bi-person mr-1"></i>Staff Login
        </Link>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12 md:py-16">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium text-white tracking-tight mb-4">Book an Appointment</h1>
          <p className="text-lg text-stone-400 font-light max-w-2xl mx-auto">Choose the booking flow that fits how you want to schedule.</p>
        </div>

        {!booking && (
          <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200/60 overflow-hidden mb-8">
            <div className="p-6 md:p-8">
              <div className="grid md:grid-cols-2 gap-4">
                {BOOKING_MODES.map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`text-left border-2 rounded-xl p-4 transition-all ${
                      bookingMode === mode.id
                        ? 'border-[stone-950] bg-stone-100'
                        : 'border-stone-200 bg-white hover:border-[stone-950]/50'
                    }`}
                    onClick={() => handleModeChange(mode.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          bookingMode === mode.id ? 'bg-[stone-950] text-white' : 'bg-stone-100 text-stone-500'
                        }`}>
                          <i className={`bi ${mode.icon}`}></i>
                        </div>
                        <div>
                          <div className="font-bold text-stone-950">{mode.label}</div>
                          <div className="text-sm text-stone-500">
                            {mode.id === 'date_time' ? 'Pick a slot first, then a service and optional barber.' : 'Start with a barber and browse their upcoming schedule.'}
                          </div>
                        </div>
                      </div>
                      {bookingMode === mode.id && <i className="bi bi-check-circle-fill text-[stone-950] text-xl"></i>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step < 3 && (
          <div className="flex items-center justify-center mb-8 flex-wrap gap-y-2">
            {activeSteps.map((label, index) => (
              <div key={label} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  index < step
                    ? 'bg-[stone-950] text-white'
                    : index === step
                      ? 'bg-[stone-950] text-white ring-4 ring-[stone-950]/30'
                      : 'bg-gray-200 text-stone-500'
                }`}>
                  {index < step ? <i className="bi bi-check"></i> : index + 1}
                </div>
                <span className={`mx-2 text-sm font-medium ${index === step ? 'text-[stone-950]' : 'text-stone-400'}`}>{label}</span>
                {index < activeSteps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 ${index < step ? 'bg-[stone-950]' : 'bg-gray-200'}`}></div>
                )}
              </div>
            ))}
          </div>
        )}

        {bookingMode === 'date_time' && step === 0 && (
          <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200/60 overflow-hidden">
            <div className="p-6 border-b border-stone-100 bg-stone-50/50">
              <h5 className="m-0 font-semibold">Step 1: Choose Date & Time</h5>
            </div>
            <div className="p-6 md:p-8">
              <div className="mb-6">
                <div className="grid gap-4 lg:grid-cols-[max-content_max-content_1fr] lg:items-end">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Select Date</label>
                    <input
                      type="date"
                      className="appearance-none block w-full max-w-xs px-4 py-3 border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 transition-all bg-stone-50/50"
                      value={selectedDate}
                      min={getTodayString()}
                      onChange={event => handleDateChange(event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Preferred Time</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreferredTime(current => shiftTime(current, -30))}
                        className="inline-flex h-[50px] w-[50px] items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:border-stone-950 hover:text-stone-950"
                      >
                        <i className="bi bi-chevron-left"></i>
                      </button>
                      <input
                        type="time"
                        step="1800"
                        className="appearance-none block w-full max-w-xs px-4 py-3 border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 transition-all bg-stone-50/50"
                        value={preferredTime}
                        onChange={event => setPreferredTime(event.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setPreferredTime(current => shiftTime(current, 30))}
                        className="inline-flex h-[50px] w-[50px] items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:border-stone-950 hover:text-stone-950"
                      >
                        <i className="bi bi-chevron-right"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h6 className="font-semibold text-stone-950 mb-1">Time slots around {formatTime(preferredTime)}</h6>
                  <p className="text-sm text-stone-500 m-0">The list is centered around your preferred time so you can compare nearby options instead of scanning the full day.</p>
                </div>
                {selectedService && (
                  <div className="text-sm text-[stone-950] font-medium">
                    Filtered for: {selectedService.name}
                  </div>
                )}
              </div>

              {loadingAvailability ? (
                <div className="loading py-8"><div className="spinner-border"></div></div>
              ) : dateAvailability.length === 0 ? (
                <div className="p-6 text-center text-stone-400 bg-stone-50 rounded-lg">
                  <i className="bi bi-calendar-x text-3xl mb-2 block"></i>
                  No slots available for this date.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {dateAvailability.map(slot => (
                    <button
                      key={`${slot.date}-${slot.time_slot}`}
                      type="button"
                      onClick={() => handleSelectDateTimeSlot(slot)}
                      className={`text-left border-2 rounded-xl p-4 transition-all ${
                        selectedSlot === slot.time_slot
                          ? 'border-[stone-950] bg-white shadow-sm border border-slate-200'
                          : `hover:shadow-sm ${availabilityTone(slot.status)}`
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-bold text-lg">{formatTime(slot.time_slot)}</div>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${availabilityTone(slot.status)}`}>
                          {availabilityLabel(slot.status)}
                        </span>
                      </div>
                      <div className="text-sm text-stone-600 mb-2">
                        Seats: {slot.seat_summary?.occupied_seats || 0}/{slot.seat_summary?.total_seats || 0} booked
                      </div>
                      <div className="text-sm text-stone-600">
                        Available barbers: {slot.available_barber_count || 0}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {bookingMode === 'date_time' && step === 1 && (
          <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200/60 overflow-hidden">
            <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
              <h5 className="m-0 font-semibold">Step 2: Service & Barber</h5>
              <button className="inline-flex justify-center items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-stone-950 shadow-sm transition-all hover:bg-stone-200 hover:scale-[1.02] active:scale-95" onClick={() => setStep(0)}>
                <i className="bi bi-arrow-left mr-1"></i>Back
              </button>
            </div>
            <div className="p-6 md:p-8">
              <div className="mb-5 grid lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 p-4 rounded-xl bg-stone-100">
                  <div className="grid md:grid-cols-2 gap-2 text-sm text-stone-700">
                    <div><strong>Date:</strong> {formatLongDate(selectedDate)}</div>
                    <div><strong>Time:</strong> {formatTime(selectedSlot)}</div>
                    <div><strong>Seat occupancy:</strong> {selectedSlotDetails?.seat_summary?.occupied_seats || 0}/{selectedSlotDetails?.seat_summary?.total_seats || 0}</div>
                    <div><strong>Available barbers:</strong> {selectedSlotDetails?.available_barber_count || 0}</div>
                  </div>
                </div>
                <div className={`p-4 rounded-xl border ${availabilityTone(selectedSlotDetails?.status)}`}>
                  <div className="text-sm font-semibold mb-1">{availabilityLabel(selectedSlotDetails?.status)}</div>
                  <div className="text-sm">
                    {loadingSlotDetails ? 'Refreshing slot details for the selected service...' : 'Service duration and barber availability will be validated again when you confirm.'}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h6 className="font-semibold text-stone-950 mb-3">Choose a Service</h6>
                {loadingServices ? (
                  <div className="loading py-8"><div className="spinner-border"></div></div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {services.map(service => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleSelectService(service)}
                        className={`text-left border-2 rounded-xl p-4 transition-all ${
                          selectedService?.id === service.id
                            ? 'border-[stone-950] bg-stone-100'
                            : 'border-stone-200 bg-white hover:border-[stone-950]/50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-stone-950 mb-1">{service.name}</div>
                            <div className="text-sm text-stone-500 mb-2">{service.description || 'Professional salon service'}</div>
                            <div className="flex gap-3 text-sm">
                              <span className="text-[stone-950] font-semibold">₹{Number(service.price).toLocaleString()}</span>
                              <span className="text-stone-400"><i className="bi bi-clock mr-1"></i>{service.duration_minutes} min</span>
                            </div>
                          </div>
                          {selectedService?.id === service.id && <i className="bi bi-check-circle-fill text-[stone-950] text-xl"></i>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h6 className="font-semibold text-stone-950 m-0">Preferred Barber</h6>
                  <span className="text-sm text-stone-500">Optional. Leave unselected to auto-assign the best available barber.</span>
                </div>
                {loadingSlotDetails ? (
                  <div className="loading py-6"><div className="spinner-border"></div></div>
                ) : availableBarbers.length === 0 ? (
                  <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">
                    No barbers can take this slot right now for the selected criteria.
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setSelectedStylist(null)}
                      className={`text-left border-2 rounded-xl p-4 transition-all ${
                        !selectedStylist
                          ? 'border-[stone-950] bg-stone-100'
                          : 'border-stone-200 bg-white hover:border-[stone-950]/50'
                      }`}
                    >
                      <div className="font-bold text-stone-950 mb-1">Auto-assign barber</div>
                      <div className="text-sm text-stone-500">The system will pick an available barber for this slot.</div>
                    </button>
                    {availableBarbers.map(barber => (
                      <button
                        key={barber.id}
                        type="button"
                        onClick={() => setSelectedStylist(barber)}
                        className={`text-left border-2 rounded-xl p-4 transition-all ${
                          selectedStylist?.id === barber.id
                            ? 'border-[stone-950] bg-stone-100'
                            : 'border-stone-200 bg-white hover:border-[stone-950]/50'
                        }`}
                      >
                        <div className="font-bold text-stone-950 mb-1">{barber.full_name}</div>
                        <div className="text-sm text-[stone-950]">{barber.specialty || 'General Styling'}</div>
                        {barber.experience_years > 0 && (
                          <div className="text-xs text-stone-400 mt-1">{barber.experience_years} years experience</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {bookingError && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium mb-4 flex items-center gap-3">{bookingError}</div>}

              {selectedSlotDetails?.suggestions?.length > 0 && (
                <div className="mb-6">
                  <h6 className="font-semibold text-stone-950 mb-3">Suggested Alternatives</h6>
                  <div className="grid md:grid-cols-2 gap-4">
                    {selectedSlotDetails.suggestions.map(suggestion => (
                      <button
                        key={`${suggestion.label}-${suggestion.date}-${suggestion.time_slot}`}
                        type="button"
                        onClick={() => handleSelectDateTimeSlot(suggestion)}
                        className="text-left border border-stone-200 rounded-xl p-4 hover:border-[stone-950]"
                      >
                        <div className="font-semibold text-stone-950">{suggestion.label}</div>
                        <div className="text-sm text-stone-500">{formatLongDate(suggestion.date)} at {formatTime(suggestion.time_slot)}</div>
                        <div className="text-sm text-[stone-950] mt-1">
                          Seats left: {suggestion.seat_summary?.available_seats || 0} • Barbers: {suggestion.available_barber_count || 0}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {nearbySlots.length > 0 && (
                <div className="mb-6">
                  <h6 className="font-semibold text-stone-950 mb-3">Nearby Same-Day Times</h6>
                  <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {nearbySlots.map(slot => (
                      <button
                        key={`${slot.date}-${slot.time_slot}-nearby`}
                        type="button"
                        onClick={() => handleSelectDateTimeSlot(slot)}
                        className={`text-left border rounded-xl p-4 transition-all hover:border-[stone-950] ${availabilityTone(slot.status)}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-stone-950">{formatTime(slot.time_slot)}</div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${availabilityTone(slot.status)}`}>
                            {availabilityLabel(slot.status)}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-stone-600">
                          Seats left: {slot.seat_summary?.available_seats || 0}
                        </div>
                        <div className="text-sm text-stone-600">
                          Barbers: {slot.available_barber_count || 0}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button className="inline-flex justify-center items-center gap-2 rounded-xl bg-stone-950 px-6 py-3.5 font-bold text-white shadow-md transition-all hover:bg-stone-800 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0" disabled={!canContinueDateTime} onClick={() => setStep(2)}>
                Continue <i className="bi bi-arrow-right ml-2"></i>
              </button>
            </div>
          </div>
        )}

        {bookingMode === 'barber' && step === 0 && (
          <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200/60 overflow-hidden">
            <div className="p-6 border-b border-stone-100 bg-stone-50/50">
              <h5 className="m-0 font-semibold">Step 1: Choose a Barber</h5>
            </div>
            <div className="p-6 md:p-8">
              {loadingStylists ? (
                <div className="loading py-8"><div className="spinner-border"></div></div>
              ) : stylists.length === 0 ? (
                <p className="text-center text-stone-400">No barbers available right now.</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {stylists.map(stylist => (
                    <button
                      key={stylist.id}
                      type="button"
                      onClick={() => handleSelectStylist(stylist)}
                      className={`text-left border-2 rounded-xl p-4 transition-all ${
                        selectedStylist?.id === stylist.id
                          ? 'border-[stone-950] bg-stone-100'
                          : 'border-stone-200 bg-white hover:border-[stone-950]/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-[stone-950] flex items-center justify-center text-white font-bold text-lg">
                          {(stylist.full_name || stylist.username || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h5 className="font-bold text-stone-950 mb-0">{stylist.full_name}</h5>
                          <p className="text-sm text-[stone-950] mb-0">{stylist.specialty || 'General Styling'}</p>
                          {stylist.experience_years > 0 && (
                            <p className="text-xs text-stone-400">{stylist.experience_years} years experience</p>
                          )}
                        </div>
                      </div>
                      {stylist.bio && <p className="text-sm text-stone-500 mt-2 line-clamp-2">{stylist.bio}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {bookingMode === 'barber' && step === 1 && (
          <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200/60 overflow-hidden">
            <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
              <h5 className="m-0 font-semibold">Step 2: Time & Service</h5>
              <button className="inline-flex justify-center items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-stone-950 shadow-sm transition-all hover:bg-stone-200 hover:scale-[1.02] active:scale-95" onClick={() => setStep(0)}>
                <i className="bi bi-arrow-left mr-1"></i>Back
              </button>
            </div>
            <div className="p-6 md:p-8">
              <div className="mb-5 p-4 rounded-xl bg-stone-100">
                <div className="grid md:grid-cols-3 gap-3 text-sm text-stone-700">
                  <div><strong>Barber:</strong> {selectedStylist?.full_name}</div>
                  <div><strong>Specialty:</strong> {selectedStylist?.specialty || 'General Styling'}</div>
                  <div>
                    <strong>Search from:</strong>{' '}
                    <input
                      type="date"
                      className="appearance-none block w-full px-4 py-3 border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 transition-all bg-stone-50/50 mt-2"
                      value={selectedDate}
                      min={getTodayString()}
                      onChange={event => handleDateChange(event.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h6 className="font-semibold text-stone-950 mb-3">Choose a Service</h6>
                {loadingServices ? (
                  <div className="loading py-8"><div className="spinner-border"></div></div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {services.map(service => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleSelectService(service)}
                        className={`text-left border-2 rounded-xl p-4 transition-all ${
                          selectedService?.id === service.id
                            ? 'border-[stone-950] bg-stone-100'
                            : 'border-stone-200 bg-white hover:border-[stone-950]/50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-stone-950 mb-1">{service.name}</div>
                            <div className="text-sm text-stone-500 mb-2">{service.description || 'Professional salon service'}</div>
                            <div className="flex gap-3 text-sm">
                              <span className="text-[stone-950] font-semibold">₹{Number(service.price).toLocaleString()}</span>
                              <span className="text-stone-400"><i className="bi bi-clock mr-1"></i>{service.duration_minutes} min</span>
                            </div>
                          </div>
                          {selectedService?.id === service.id && <i className="bi bi-check-circle-fill text-[stone-950] text-xl"></i>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h6 className="font-semibold text-stone-950 m-0">Available Dates & Time Slots</h6>
                  {selectedService && <span className="text-sm text-[stone-950] font-medium">Filtered for {selectedService.name}</span>}
                </div>
                {loadingSchedule ? (
                  <div className="loading py-8"><div className="spinner-border"></div></div>
                ) : stylistSchedule.length === 0 ? (
                  <div className="p-6 text-center text-stone-400 bg-stone-50 rounded-lg">
                    <i className="bi bi-calendar-x text-3xl mb-2 block"></i>
                    No upcoming slots found for this barber.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {stylistSchedule.map(day => (
                      <div key={day.date} className="border border-stone-200 rounded-xl p-4 bg-white">
                        <div className="font-semibold text-stone-950 mb-3">{formatLongDate(day.date)}</div>
                        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {day.time_slots.map(slot => (
                            <button
                              key={`${day.date}-${slot.time_slot}`}
                              type="button"
                              onClick={() => handleSelectScheduleSlot(slot, day.date)}
                              className={`text-left border-2 rounded-xl p-4 transition-all ${
                                selectedDate === day.date && selectedSlot === slot.time_slot
                                  ? 'border-[stone-950] bg-stone-100'
                                  : `bg-white hover:border-[stone-950]/50 ${availabilityTone(slot.status)}`
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-bold text-stone-950">{formatTime(slot.time_slot)}</div>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${availabilityTone(slot.status)}`}>
                                  {availabilityLabel(slot.status)}
                                </span>
                              </div>
                              <div className="text-sm text-stone-600">
                                Seats: {slot.seat_summary?.occupied_seats || 0}/{slot.seat_summary?.total_seats || 0} booked
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {bookingError && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium mt-6 flex items-center gap-3">{bookingError}</div>}

              <div className="mt-6">
                <button className="inline-flex justify-center items-center gap-2 rounded-xl bg-stone-950 px-6 py-3.5 font-bold text-white shadow-md transition-all hover:bg-stone-800 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0" disabled={!canContinueBarber} onClick={() => setStep(2)}>
                  Continue <i className="bi bi-arrow-right ml-2"></i>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200/60 overflow-hidden">
            <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
              <h5 className="m-0 font-semibold">Step 3: Your Details</h5>
              <button className="inline-flex justify-center items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-stone-950 shadow-sm transition-all hover:bg-stone-200 hover:scale-[1.02] active:scale-95" onClick={() => setStep(1)}>
                <i className="bi bi-arrow-left mr-1"></i>Back
              </button>
            </div>
            <div className="p-6 md:p-8">
              <div className="mb-5 p-4 bg-stone-100 rounded-lg text-sm">
                <div className="grid md:grid-cols-2 gap-2 text-stone-600">
                  <div><strong>Booking mode:</strong> {bookingMode === 'date_time' ? 'By Date & Time' : 'By Barber'}</div>
                  <div><strong>Date:</strong> {formatLongDate(selectedDate)}</div>
                  <div><strong>Time:</strong> {formatTime(selectedSlot)}</div>
                  <div><strong>Service:</strong> {selectedService?.name}</div>
                  <div><strong>Barber:</strong> {selectedStylist?.full_name || 'Auto-assign best available'}</div>
                  <div><strong>Seat availability:</strong> {selectedSlotDetails?.seat_summary?.available_seats || 0} left</div>
                  <div><strong>Price:</strong> ₹{Number(selectedService?.price || 0).toLocaleString()}</div>
                  <div><strong>Duration:</strong> {selectedService?.duration_minutes} min</div>
                </div>
              </div>

              {bookingError && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium mb-4 flex items-center gap-3">{bookingError}</div>}

              {selectedSlotDetails?.suggestions?.length > 0 && (
                <div className="mb-5">
                  <h6 className="font-semibold text-stone-950 mb-3">Suggested Alternatives</h6>
                  <div className="grid md:grid-cols-2 gap-4">
                    {selectedSlotDetails.suggestions.map(suggestion => (
                      <button
                        key={`${suggestion.label}-${suggestion.date}-${suggestion.time_slot}`}
                        type="button"
                        onClick={() => {
                          setSelectedDate(suggestion.date)
                          setSelectedSlot(suggestion.time_slot)
                          setSelectedSlotDetails(suggestion)
                          setStep(1)
                        }}
                        className="text-left border border-stone-200 rounded-xl p-4 hover:border-[stone-950]"
                      >
                        <div className="font-semibold text-stone-950">{suggestion.label}</div>
                        <div className="text-sm text-stone-500">{formatLongDate(suggestion.date)} at {formatTime(suggestion.time_slot)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitBooking}>
                {formError && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium mb-4 flex items-center gap-3">{formError}</div>}
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Your Name *</label>
                    <input
                      type="text"
                      className="appearance-none block w-full px-4 py-3 border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 transition-all bg-stone-50/50"
                      value={form.customer_name}
                      onChange={event => setForm(current => ({ ...current, customer_name: event.target.value }))}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Your Phone *</label>
                    <input
                      type="tel"
                      className="appearance-none block w-full px-4 py-3 border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 transition-all bg-stone-50/50"
                      value={form.customer_phone}
                      onChange={event => setForm(current => ({ ...current, customer_phone: event.target.value }))}
                      placeholder="10-digit number"
                    />
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      digits only — no country code (e.g. 9876543210)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Your Email <span className="text-stone-400 font-normal text-xs">(optional — for booking confirmation)</span></label>
                    <input
                      type="email"
                      className="appearance-none block w-full px-4 py-3 border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 transition-all bg-stone-50/50"
                      value={form.customer_email}
                      onChange={event => setForm(current => ({ ...current, customer_email: event.target.value }))}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-stone-700 mb-2">Notes / Special Requests</label>
                  <textarea
                    className="appearance-none block w-full px-4 py-3 border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 transition-all bg-stone-50/50"
                    rows={2}
                    value={form.reason}
                    onChange={event => setForm(current => ({ ...current, reason: event.target.value }))}
                    placeholder="Any special instructions or requests (optional)"
                  />
                </div>
                <button type="submit" className="inline-flex justify-center items-center gap-2 rounded-xl bg-stone-950 px-6 py-3.5 font-bold text-white shadow-md transition-all hover:bg-stone-800 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 w-full" disabled={submitting}>
                  {submitting && <span className="spinner-border spinner-border-sm mr-2"></span>}
                  <i className="bi bi-calendar-check mr-2"></i>
                  {submitting ? 'Booking...' : 'Confirm Booking'}
                </button>
              </form>
            </div>
          </div>
        )}

        {step === 3 && booking && (
          <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200/60 overflow-hidden">
            <div className="p-6 md:p-10 text-center">
              <i className="bi bi-check-circle-fill text-6xl text-[stone-950] block mb-4"></i>
              <h3 className="text-3xl font-serif text-stone-950 mb-3">Booking Confirmed!</h3>
              <p className="text-stone-500 mb-6">Your appointment has been booked successfully.</p>

              <div className="bg-stone-100 rounded-xl p-5 text-left mb-6 max-w-md mx-auto">
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="font-medium text-stone-500 py-3 border-b border-stone-200/50 w-1/3">Booking ID</td><td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">#{booking.id}</td></tr>
                    <tr><td className="font-medium text-stone-500 py-3 border-b border-stone-200/50 w-1/3">Customer</td><td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{booking.customer_name}</td></tr>
                    <tr><td className="font-medium text-stone-500 py-3 border-b border-stone-200/50 w-1/3">Service</td><td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{booking.service?.name || selectedService?.name}</td></tr>
                    <tr><td className="font-medium text-stone-500 py-3 border-b border-stone-200/50 w-1/3">Barber</td><td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{booking.stylist?.full_name || selectedStylist?.full_name || 'Assigned on booking'}</td></tr>
                    <tr><td className="font-medium text-stone-500 py-3 border-b border-stone-200/50 w-1/3">Date</td><td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{booking.appointment_date}</td></tr>
                    <tr><td className="font-medium text-stone-500 py-3 border-b border-stone-200/50 w-1/3">Time</td><td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{formatTime(booking.appointment_time)}</td></tr>
                    <tr><td className="font-medium text-stone-500 py-3 border-b border-stone-200/50 w-1/3">Seat</td><td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{booking.seat_id || 'TBD'}</td></tr>
                    <tr><td className="font-medium text-stone-500 py-3 border-b border-stone-200/50 w-1/3">Status</td><td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium"><span className="badge badge-booked">Booked</span></td></tr>
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-stone-500 mb-6">
                Save your phone number <strong>{booking.customer_phone}</strong> to look up your appointment later.
              </p>

              <button className="inline-flex justify-center items-center gap-2 rounded-xl bg-stone-950 px-6 py-3.5 font-bold text-white shadow-md transition-all hover:bg-stone-800 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0" onClick={() => resetFlow(bookingMode)}>
                <i className="bi bi-plus-circle mr-2"></i>Book Another Appointment
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200/60 overflow-hidden mt-12">
          <div className="p-6 border-b border-stone-100 bg-stone-50/50"><h5 className="m-0 font-semibold">Look Up My Appointments</h5></div>
          <div className="p-6 md:p-8">
            <p className="text-sm text-stone-500 mb-1">Enter your phone number to view your existing appointments.</p>
            <p className="text-xs text-amber-600 mb-4 flex items-center gap-1">
              Digits only — no country code (e.g. 9876543210)
            </p>
            <form onSubmit={handleLookup}>
              {lookupError && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium mb-4 flex items-center gap-3">{lookupError}</div>}
              <div className="flex gap-3">
                <input
                  type="tel"
                  className="appearance-none block w-full px-4 py-3 border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 transition-all bg-stone-50/50"
                  placeholder="10-digit phone number"
                  value={lookupPhone}
                  onChange={event => setLookupPhone(event.target.value)}
                />
                <button type="submit" className="inline-flex justify-center items-center gap-2 rounded-xl bg-stone-950 px-6 py-3.5 font-bold text-white shadow-md transition-all hover:bg-stone-800 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 whitespace-nowrap" disabled={lookupLoading}>
                  {lookupLoading && <span className="spinner-border spinner-border-sm mr-2"></span>}
                  <i className="bi bi-search mr-1"></i>Search
                </button>
              </div>
            </form>

            {lookupResults !== null && (
              <div className="mt-4">
                {lookupResults.length === 0 ? (
                  <p className="text-center text-stone-400">No appointments found for this number.</p>
                ) : (
                  <table className="table mt-2">
                    <thead>
                      <tr><th>Date</th><th>Time</th><th>Service</th><th>Barber</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {lookupResults.map(appointment => (
                        <tr key={appointment.id}>
                          <td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{appointment.appointment_date || 'Walk-in'}</td>
                          <td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{appointment.appointment_time ? formatTime(appointment.appointment_time) : '—'}</td>
                          <td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{appointment.service?.name || '—'}</td>
                          <td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium">{appointment.stylist?.full_name || '—'}</td>
                          <td className="py-3 border-b border-stone-200/50 text-stone-950 font-medium"><span className={statusBadgeClass(appointment.status)}>{appointment.status}</span></td>
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

export default function BookPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span className="loading"></span></div>}>
      <BookPageContent />
    </Suspense>
  )
}

'use client';

import { useState, useEffect } from 'react';
import StylistCard from '@/components/StylistCard';
import { formatDate, formatTime } from '@/lib/utils';

interface Stylist {
  id: number;
  name: string;
  specialties: string;
  photoUrl?: string | null;
  slotDuration: number;
}

interface Salon {
  id: number;
  name: string;
  openTime: string;
  closeTime: string;
  workDays: string;
}

type BookingStep = 'select-stylist' | 'select-slot' | 'fill-form' | 'confirmation';

const SERVICES_BY_SPECIALTY: Record<string, string[]> = {
  Hair: ['Haircut & Style', 'Blowout'],
  Color: ['Full Color', 'Root Touch-Up'],
  Highlights: ['Partial Highlights', 'Full Highlights'],
  Balayage: ['Balayage', 'Ombre'],
  Beard: ['Beard Trim', 'Beard Shaping'],
  Grooming: ['Full Grooming Package', 'Express Grooming'],
  Haircut: ['Men\'s Haircut', 'Kids Haircut'],
  Shave: ['Hot Towel Shave', 'Traditional Shave'],
  Nails: ['Gel Nails', 'Acrylic Nails', 'Nail Art'],
  Spa: ['Spa Treatment', 'Deep Conditioning'],
  Manicure: ['Classic Manicure', 'Gel Manicure'],
  Pedicure: ['Classic Pedicure', 'Spa Pedicure'],
};

export default function PublicBookingPage() {
  const [salon, setSalon] = useState<Salon | null>(null);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [step, setStep] = useState<BookingStep>('select-stylist');

  const [selectedStylist, setSelectedStylist] = useState<Stylist | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    service: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  interface ConfirmedAppointment {
    id: number;
    customerName: string;
    customerPhone: string;
    service: string;
    startTime: string;
    endTime: string;
    status: string;
    notes?: string | null;
    stylist?: { name: string };
  }
  const [confirmedAppointment, setConfirmedAppointment] = useState<ConfirmedAppointment | null>(null);
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetch('/api/salon').then((r) => r.json()).then(setSalon);
    fetch('/api/stylists').then((r) => r.json()).then(setStylists);
  }, []);

  useEffect(() => {
    if (selectedStylist && selectedDate) {
      setLoadingSlots(true);
      setSelectedSlot('');
      fetch(`/api/stylists/${selectedStylist.id}/availability?date=${selectedDate}`)
        .then((r) => r.json())
        .then((data) => {
          setAvailableSlots(data.slots || []);
          setLoadingSlots(false);
        })
        .catch(() => setLoadingSlots(false));
    }
  }, [selectedStylist, selectedDate]);

  const getServicesForStylist = (stylist: Stylist): string[] => {
    const specialties = stylist.specialties.split(',').map((s) => s.trim());
    const services: string[] = [];
    specialties.forEach((spec) => {
      if (SERVICES_BY_SPECIALTY[spec]) {
        services.push(...SERVICES_BY_SPECIALTY[spec]);
      }
    });
    return services.length > 0 ? services : ['General Service'];
  };

  const handleSelectStylist = (stylist: Stylist) => {
    setSelectedStylist(stylist);
    setStep('select-slot');
    setSelectedDate(today);
  };

  const handleSelectSlot = (slot: string) => {
    setSelectedSlot(slot);
    setStep('fill-form');
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStylist || !selectedDate || !selectedSlot) return;

    setSubmitting(true);
    setError('');

    const [hour, min] = selectedSlot.split(':').map(Number);
    const startTime = new Date(selectedDate);
    startTime.setHours(hour, min, 0, 0);
    const endTime = new Date(startTime.getTime() + selectedStylist.slotDuration * 60 * 1000);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylistId: selectedStylist.id,
          customerName: formData.customerName,
          customerPhone: formData.customerPhone,
          service: formData.service,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          notes: formData.notes || undefined,
          status: 'confirmed',
          isWalkin: false,
        }),
      });

      if (response.status === 409) {
        setError('This slot was just booked by someone else. Please select a different time.');
        setStep('select-slot');
        // Refresh slots
        if (selectedStylist && selectedDate) {
          const slotsRes = await fetch(`/api/stylists/${selectedStylist.id}/availability?date=${selectedDate}`);
          const slotsData = await slotsRes.json();
          setAvailableSlots(slotsData.slots || []);
        }
        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Booking failed');
      }

      const appointment = await response.json();
      setConfirmedAppointment(appointment);
      setStep('confirmation');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartOver = () => {
    setStep('select-stylist');
    setSelectedStylist(null);
    setSelectedDate('');
    setSelectedSlot('');
    setAvailableSlots([]);
    setFormData({ customerName: '', customerPhone: '', service: '', notes: '' });
    setConfirmedAppointment(null);
    setError('');
  };

  const stepIndicators = [
    { key: 'select-stylist', label: 'Choose Stylist', num: 1 },
    { key: 'select-slot', label: 'Pick a Time', num: 2 },
    { key: 'fill-form', label: 'Your Details', num: 3 },
    { key: 'confirmation', label: 'Confirmed', num: 4 },
  ];

  const currentStepIndex = stepIndicators.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-violet-50">
      {/* Hero */}
      <div className="bg-gradient-to-r from-purple-700 to-violet-800 text-white py-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            Book an Appointment at {salon?.name || 'Our Salon'}
          </h1>
          <p className="text-purple-200 text-lg">
            Professional beauty services, easy online booking
          </p>
          {salon && (
            <p className="text-purple-300 text-sm mt-2">
              Open {salon.openTime} – {salon.closeTime} · Mon–Sat
            </p>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Step Indicators */}
        {step !== 'confirmation' && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {stepIndicators.slice(0, 3).map((s, i) => (
              <div key={s.key} className="flex items-center">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  i < currentStepIndex
                    ? 'bg-purple-600 text-white'
                    : i === currentStepIndex
                    ? 'bg-white text-purple-700 shadow-md border-2 border-purple-300'
                    : 'bg-white text-gray-400 border border-gray-200'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < currentStepIndex ? 'bg-white text-purple-600' : ''
                  }`}>
                    {i < currentStepIndex ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      s.num
                    )}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < 2 && <div className={`w-8 h-0.5 mx-1 ${i < currentStepIndex ? 'bg-purple-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Select Stylist */}
        {step === 'select-stylist' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Stylist</h2>
            <p className="text-gray-500 mb-6">Browse our talented team and select who you'd like to book with.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stylists.map((stylist) => (
                <StylistCard key={stylist.id} stylist={stylist} onBook={handleSelectStylist} />
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select Date & Slot */}
        {step === 'select-slot' && selectedStylist && (
          <div>
            <button
              onClick={() => setStep('select-stylist')}
              className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 mb-4 font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-violet-600 flex items-center justify-center text-white text-xl font-bold">
                {selectedStylist.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{selectedStylist.name}</h3>
                <p className="text-sm text-gray-500">{selectedStylist.specialties.split(',').slice(0, 3).join(' · ')}</p>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">Pick a Date & Time</h2>
            <p className="text-gray-500 mb-4">Select your preferred date and available time slot.</p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                min={today}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-gray-900 font-medium"
              />
            </div>

            {selectedDate && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-1">
                  Available Slots for {formatDate(selectedDate + 'T12:00:00')}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {selectedStylist.slotDuration}-minute appointments
                </p>

                {loadingSlots ? (
                  <div className="flex items-center gap-3 text-gray-500 py-8">
                    <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                    <span>Loading availability...</span>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No available slots for this date.</p>
                    <p className="text-sm text-gray-400 mt-1">Please try a different date.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableSlots.map((slot) => {
                      const [h, m] = slot.split(':').map(Number);
                      const d = new Date();
                      d.setHours(h, m, 0, 0);
                      const label = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                      return (
                        <button
                          key={slot}
                          onClick={() => handleSelectSlot(slot)}
                          className="py-2.5 px-2 rounded-xl border-2 text-sm font-medium text-center transition-all border-gray-100 text-gray-700 hover:border-purple-400 hover:text-purple-700 hover:bg-purple-50"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Fill Form */}
        {step === 'fill-form' && selectedStylist && selectedDate && selectedSlot && (
          <div>
            <button
              onClick={() => setStep('select-slot')}
              className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 mb-4 font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="bg-purple-50 rounded-2xl p-4 mb-6 border border-purple-100">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm text-purple-600 font-medium">Booking with {selectedStylist.name}</p>
                  <p className="font-semibold text-gray-900">
                    {formatDate(selectedDate + 'T12:00:00')} at {(() => {
                      const [h, m] = selectedSlot.split(':').map(Number);
                      const d = new Date();
                      d.setHours(h, m, 0, 0);
                      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    })()}
                  </p>
                </div>
                <button
                  onClick={() => setStep('select-slot')}
                  className="text-xs text-purple-600 underline"
                >
                  Change time
                </button>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Details</h2>
            <p className="text-gray-500 mb-6">Almost there! Fill in your details to confirm the booking.</p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmitBooking} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Jane Smith"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  placeholder="555-0100"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Service *</label>
                <select
                  required
                  value={formData.service}
                  onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-gray-900 bg-white"
                >
                  <option value="">Select a service...</option>
                  {getServicesForStylist(selectedStylist).map((service) => (
                    <option key={service} value={service}>{service}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any special requests or information..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-gray-900 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-violet-700 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-violet-800 disabled:opacity-50 transition-all shadow-lg shadow-purple-200 hover:shadow-purple-300"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Booking...
                  </span>
                ) : (
                  'Confirm Booking'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 'confirmation' && confirmedAppointment && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">You're booked!</h2>
            <p className="text-gray-500 mb-8">Your appointment has been confirmed. See you soon!</p>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-left max-w-sm mx-auto mb-6">
              <h3 className="font-semibold text-gray-900 mb-4 text-center">Booking Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Stylist</span>
                  <span className="font-medium text-gray-900 text-sm">{confirmedAppointment.stylist?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Service</span>
                  <span className="font-medium text-gray-900 text-sm">{confirmedAppointment.service}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Date</span>
                  <span className="font-medium text-gray-900 text-sm">{formatDate(confirmedAppointment.startTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Time</span>
                  <span className="font-medium text-gray-900 text-sm">
                    {formatTime(confirmedAppointment.startTime)} – {formatTime(confirmedAppointment.endTime)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Name</span>
                  <span className="font-medium text-gray-900 text-sm">{confirmedAppointment.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Phone</span>
                  <span className="font-medium text-gray-900 text-sm">{confirmedAppointment.customerPhone}</span>
                </div>
                {confirmedAppointment.notes && (
                  <div className="pt-2 border-t border-gray-50">
                    <p className="text-gray-500 text-xs">Notes: {confirmedAppointment.notes}</p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-50 text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  Confirmed
                </span>
              </div>
            </div>

            <button
              onClick={handleStartOver}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-700 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-violet-800 transition-all shadow-lg shadow-purple-200"
            >
              Book Another Appointment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

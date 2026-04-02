'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/Modal';
import AppointmentCard from '@/components/AppointmentCard';
import { formatTime, formatShortDate, toDateString } from '@/lib/utils';

interface Stylist {
  id: number;
  name: string;
  specialties: string;
  photoUrl?: string | null;
  slotDuration: number;
}

interface Appointment {
  id: number;
  stylistId: number;
  customerName: string;
  customerPhone: string;
  service: string;
  startTime: string;
  endTime: string;
  status: string;
  isWalkin: boolean;
  notes?: string | null;
  price?: number | null;
  stylist?: { id: number; name: string; specialties: string };
}

const COMMON_SERVICES = [
  'Haircut', 'Blow Dry', 'Hair Color', 'Highlights', 'Balayage',
  'Beard Trim', 'Shave', 'Manicure', 'Pedicure', 'Nail Art',
  'Facial', 'Massage', 'Waxing', 'Eyebrow Shaping', 'Other',
];

export default function StylistPanel({ params }: { params: { id: string } }) {
  const stylistId = parseInt(params.id);
  const [stylist, setStylist] = useState<Stylist | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showWalkinModal, setShowWalkinModal] = useState(false);
  const [walkinForm, setWalkinForm] = useState({
    customerName: '',
    customerPhone: '',
    service: '',
    startSlot: '',
    notes: '',
    price: '',
  });
  const [walkinSubmitting, setWalkinSubmitting] = useState(false);
  const [walkinError, setWalkinError] = useState('');

  const today = toDateString(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [stylistRes, todayRes, allRes, slotsRes] = await Promise.all([
        fetch(`/api/stylists/${stylistId}`),
        fetch(`/api/appointments?stylistId=${stylistId}&date=${today}`),
        fetch(`/api/appointments?stylistId=${stylistId}`),
        fetch(`/api/stylists/${stylistId}/availability?date=${today}`),
      ]);

      if (stylistRes.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const [stylistData, todayData, allData, slotsData] = await Promise.all([
        stylistRes.json(),
        todayRes.json(),
        allRes.json(),
        slotsRes.json(),
      ]);

      setStylist(stylistData);
      setTodayAppointments(todayData);
      setAvailableSlots(slotsData.slots || []);

      // Past appointments: all before today
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const past = allData.filter((a: Appointment) => {
        const apptDate = new Date(a.startTime);
        return apptDate < now;
      });
      setPastAppointments(past.reverse());
    } catch (err) {
      console.error('Failed to fetch stylist data', err);
    } finally {
      setLoading(false);
    }
  }, [stylistId, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = async (id: number, status: string) => {
    await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchData();
  };

  const handleWalkinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stylist || !walkinForm.startSlot) return;

    setWalkinSubmitting(true);
    setWalkinError('');

    const [hour, min] = walkinForm.startSlot.split(':').map(Number);
    const startTime = new Date();
    startTime.setHours(hour, min, 0, 0);
    const endTime = new Date(startTime.getTime() + stylist.slotDuration * 60 * 1000);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylistId,
          customerName: walkinForm.customerName,
          customerPhone: walkinForm.customerPhone,
          service: walkinForm.service,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          status: 'confirmed',
          isWalkin: true,
          notes: walkinForm.notes || undefined,
          price: walkinForm.price ? parseFloat(walkinForm.price) : undefined,
        }),
      });

      if (response.status === 409) {
        setWalkinError('This time slot is already booked. Please select a different slot.');
        setWalkinSubmitting(false);
        return;
      }

      if (!response.ok) throw new Error('Failed to create walk-in');

      setShowWalkinModal(false);
      setWalkinForm({ customerName: '', customerPhone: '', service: '', startSlot: '', notes: '', price: '' });
      fetchData();
    } catch {
      setWalkinError('Something went wrong. Please try again.');
    } finally {
      setWalkinSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (notFound || !stylist) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">Stylist not found</p>
          <a href="/" className="text-purple-600 hover:underline mt-2 inline-block">Go home</a>
        </div>
      </div>
    );
  }

  const upcomingToday = todayAppointments.filter((a) => {
    const apptTime = new Date(a.startTime);
    return apptTime >= new Date() && a.status !== 'cancelled';
  });

  const completedToday = todayAppointments.filter((a) => a.status === 'completed');
  const todayRevenue = completedToday.reduce((sum, a) => sum + (a.price || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-violet-800 text-white py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white text-2xl font-bold border-2 border-white/30">
                {stylist.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Welcome, {stylist.name.split(' ')[0]}</h1>
                <p className="text-purple-200 mt-0.5 text-sm">
                  {stylist.specialties.split(',').slice(0, 3).join(' · ')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowWalkinModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-purple-700 hover:bg-purple-50 rounded-xl font-semibold text-sm transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Log Walk-in
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-purple-700">{todayAppointments.filter(a => a.status !== 'cancelled').length}</p>
            <p className="text-xs text-gray-500 mt-1">Today's Bookings</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">${todayRevenue.toFixed(0)}</p>
            <p className="text-xs text-gray-500 mt-1">Completed Revenue</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{availableSlots.length}</p>
            <p className="text-xs text-gray-500 mt-1">Open Slots Today</p>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Today's Schedule</h2>
              <p className="text-sm text-gray-500">{formatShortDate(new Date())}</p>
            </div>
          </div>
          <div className="p-6">
            {todayAppointments.filter(a => a.status !== 'cancelled').length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400">No appointments scheduled for today.</p>
                <button
                  onClick={() => setShowWalkinModal(true)}
                  className="mt-3 text-sm text-purple-600 hover:text-purple-800 font-medium underline"
                >
                  Log a walk-in
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments
                  .filter(a => a.status !== 'cancelled')
                  .map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appointment={appt}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Available Slots Today */}
        {availableSlots.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Open Slots Today</h2>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {availableSlots.map((slot) => {
                const [h, m] = slot.split(':').map(Number);
                const d = new Date();
                d.setHours(h, m, 0, 0);
                const isPast = d < new Date();
                return (
                  <div
                    key={slot}
                    className={`py-2 px-2 rounded-xl border text-sm font-medium text-center ${
                      isPast
                        ? 'border-gray-100 text-gray-300 bg-gray-50'
                        : 'border-green-100 text-green-700 bg-green-50'
                    }`}
                  >
                    {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Booking History */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50">
            <h2 className="text-xl font-bold text-gray-900">Booking History</h2>
            <p className="text-sm text-gray-500 mt-0.5">{pastAppointments.length} past appointments</p>
          </div>
          {pastAppointments.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-400">No past appointments yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Service</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date & Time</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pastAppointments.slice(0, 20).map((appt) => (
                    <tr key={appt.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900 text-sm">{appt.customerName}</p>
                        <p className="text-xs text-gray-500">{appt.customerPhone}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{appt.service}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <p>{formatShortDate(appt.startTime)}</p>
                        <p className="text-xs text-gray-500">{formatTime(appt.startTime)}</p>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {appt.price ? `$${appt.price}` : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          appt.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                          appt.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          appt.isWalkin ? 'bg-purple-100 text-purple-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {appt.isWalkin && appt.status !== 'cancelled' ? 'Walk-in' : appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pastAppointments.length > 20 && (
                <p className="text-center text-sm text-gray-400 py-4">
                  Showing 20 of {pastAppointments.length} past appointments
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Walk-in Modal */}
      <Modal
        isOpen={showWalkinModal}
        onClose={() => {
          setShowWalkinModal(false);
          setWalkinError('');
        }}
        title="Log Walk-in Customer"
      >
        <form onSubmit={handleWalkinSubmit} className="space-y-4">
          {walkinError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {walkinError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer Name *</label>
            <input
              type="text"
              required
              value={walkinForm.customerName}
              onChange={(e) => setWalkinForm({ ...walkinForm, customerName: e.target.value })}
              placeholder="John Doe"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number *</label>
            <input
              type="tel"
              required
              value={walkinForm.customerPhone}
              onChange={(e) => setWalkinForm({ ...walkinForm, customerPhone: e.target.value })}
              placeholder="555-0100"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Service *</label>
            <select
              required
              value={walkinForm.service}
              onChange={(e) => setWalkinForm({ ...walkinForm, service: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none bg-white"
            >
              <option value="">Select service...</option>
              {COMMON_SERVICES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Time Slot *</label>
            {availableSlots.length === 0 ? (
              <div>
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
                  No available slots remaining today. All slots are booked.
                </p>
              </div>
            ) : (
              <select
                required
                value={walkinForm.startSlot}
                onChange={(e) => setWalkinForm({ ...walkinForm, startSlot: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none bg-white"
              >
                <option value="">Select a slot...</option>
                {availableSlots.map((slot) => {
                  const [h, m] = slot.split(':').map(Number);
                  const d = new Date();
                  d.setHours(h, m, 0, 0);
                  const label = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                  return <option key={slot} value={slot}>{label}</option>;
                })}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Price (optional)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={walkinForm.price}
                onChange={(e) => setWalkinForm({ ...walkinForm, price: e.target.value })}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={walkinForm.notes}
              onChange={(e) => setWalkinForm({ ...walkinForm, notes: e.target.value })}
              placeholder="Any notes about this walk-in..."
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowWalkinModal(false); setWalkinError(''); }}
              className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={walkinSubmitting || availableSlots.length === 0}
              className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              {walkinSubmitting ? 'Logging...' : 'Log Walk-in'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

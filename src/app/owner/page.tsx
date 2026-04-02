'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/Modal';
import AppointmentCard from '@/components/AppointmentCard';
import { formatTime, formatShortDate, toDateString } from '@/lib/utils';

interface Salon {
  id: number;
  name: string;
  openTime: string;
  closeTime: string;
  workDays: string;
}

interface Stylist {
  id: number;
  name: string;
  specialties: string;
  photoUrl?: string | null;
  slotDuration: number;
  todayAppointmentCount?: number;
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

const WORK_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function OwnerDashboard() {
  const [salon, setSalon] = useState<Salon | null>(null);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddStylist, setShowAddStylist] = useState(false);
  const [editingStylist, setEditingStylist] = useState<Stylist | null>(null);
  const [showSalonSettings, setShowSalonSettings] = useState(false);

  // Forms
  const [stylistForm, setStylistForm] = useState({
    name: '',
    specialties: '',
    photoUrl: '',
    slotDuration: 60,
  });
  const [salonForm, setSalonForm] = useState({
    name: '',
    openTime: '',
    closeTime: '',
    workDays: '',
  });

  const today = toDateString(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [salonRes, stylistsRes, todayRes, allRes] = await Promise.all([
        fetch('/api/salon'),
        fetch('/api/stylists'),
        fetch(`/api/appointments?date=${today}`),
        fetch('/api/appointments'),
      ]);
      const [salonData, stylistsData, todayData, allData] = await Promise.all([
        salonRes.json(),
        stylistsRes.json(),
        todayRes.json(),
        allRes.json(),
      ]);
      setSalon(salonData);
      setSalonForm({
        name: salonData.name,
        openTime: salonData.openTime,
        closeTime: salonData.closeTime,
        workDays: salonData.workDays,
      });
      setStylists(stylistsData);
      setTodayAppointments(todayData);
      setAllAppointments(allData);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = {
    todayBookings: todayAppointments.filter((a) => a.status !== 'cancelled').length,
    todayRevenue: todayAppointments
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + (a.price || 0), 0),
    activeStylists: stylists.length,
    totalAppointments: allAppointments.length,
  };

  const handleStatusChange = async (id: number, status: string) => {
    await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchData();
  };

  const handleDeleteAppointment = async (id: number) => {
    if (!confirm('Delete this appointment?')) return;
    await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const openAddStylist = () => {
    setStylistForm({ name: '', specialties: '', photoUrl: '', slotDuration: 60 });
    setEditingStylist(null);
    setShowAddStylist(true);
  };

  const openEditStylist = (stylist: Stylist) => {
    setStylistForm({
      name: stylist.name,
      specialties: stylist.specialties,
      photoUrl: stylist.photoUrl || '',
      slotDuration: stylist.slotDuration,
    });
    setEditingStylist(stylist);
    setShowAddStylist(true);
  };

  const handleSaveStylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStylist) {
      await fetch(`/api/stylists/${editingStylist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stylistForm),
      });
    } else {
      await fetch('/api/stylists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stylistForm),
      });
    }
    setShowAddStylist(false);
    fetchData();
  };

  const handleDeleteStylist = async (id: number) => {
    if (!confirm('Delete this stylist and all their appointments?')) return;
    await fetch(`/api/stylists/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleSaveSalon = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/salon', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salonForm),
    });
    setShowSalonSettings(false);
    fetchData();
  };

  const toggleWorkDay = (day: number) => {
    const days = salonForm.workDays.split(',').map(Number).filter(Boolean);
    const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    setSalonForm({ ...salonForm, workDays: newDays.join(',') });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-violet-800 text-white py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Owner Dashboard</h1>
              <p className="text-purple-200 mt-1">{salon?.name} · {formatShortDate(new Date())}</p>
            </div>
            <button
              onClick={() => setShowSalonSettings(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors border border-white/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Today's Bookings",
              value: stats.todayBookings,
              icon: '📅',
              color: 'bg-purple-50 border-purple-100',
              valueColor: 'text-purple-700',
            },
            {
              label: "Today's Revenue",
              value: `$${stats.todayRevenue.toFixed(0)}`,
              icon: '💰',
              color: 'bg-green-50 border-green-100',
              valueColor: 'text-green-700',
            },
            {
              label: 'Active Stylists',
              value: stats.activeStylists,
              icon: '✂️',
              color: 'bg-blue-50 border-blue-100',
              valueColor: 'text-blue-700',
            },
            {
              label: 'Total Appointments',
              value: stats.totalAppointments,
              icon: '📊',
              color: 'bg-orange-50 border-orange-100',
              valueColor: 'text-orange-700',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-white rounded-2xl border p-5 ${stat.color}`}
            >
              <p className="text-2xl mb-1">{stat.icon}</p>
              <p className={`text-2xl sm:text-3xl font-bold ${stat.valueColor}`}>{stat.value}</p>
              <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Today's Schedule</h2>
              <p className="text-sm text-gray-500 mt-0.5">{formatShortDate(new Date())}</p>
            </div>
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
              {todayAppointments.filter((a) => a.status !== 'cancelled').length} appointments
            </span>
          </div>
          <div className="p-6">
            {todayAppointments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-lg">No appointments today</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayAppointments.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDeleteAppointment}
                    showStylist
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stylists Management */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Stylists</h2>
              <p className="text-sm text-gray-500 mt-0.5">{stylists.length} team members</p>
            </div>
            <button
              onClick={openAddStylist}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Stylist
            </button>
          </div>
          <div className="p-6">
            {stylists.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400">No stylists yet. Add your first team member!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stylists.map((stylist) => (
                  <div key={stylist.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-violet-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {stylist.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{stylist.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {stylist.slotDuration}-min slots · {stylist.todayAppointmentCount || 0} today
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {stylist.specialties.split(',').slice(0, 3).map((s) => (
                            <span key={s} className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                              {s.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => openEditStylist(stylist)}
                        className="flex-1 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <a
                        href={`/stylist/${stylist.id}`}
                        className="flex-1 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-center"
                      >
                        View Panel
                      </a>
                      <button
                        onClick={() => handleDeleteStylist(stylist.id)}
                        className="py-1.5 px-2.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Operating Hours Info */}
        {salon && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Operating Hours</h2>
              <button
                onClick={() => setShowSalonSettings(true)}
                className="text-sm text-purple-600 hover:text-purple-800 font-medium"
              >
                Edit Settings
              </button>
            </div>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-sm text-gray-500">Hours</p>
                <p className="font-semibold text-gray-900">{salon.openTime} – {salon.closeTime}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Work Days</p>
                <div className="flex gap-1.5 mt-1">
                  {WORK_DAY_LABELS.map((label, i) => {
                    const isWorkDay = salon.workDays.split(',').map(Number).includes(i);
                    return (
                      <span
                        key={i}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                          isWorkDay ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {label[0]}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Stylist Modal */}
      <Modal
        isOpen={showAddStylist}
        onClose={() => setShowAddStylist(false)}
        title={editingStylist ? `Edit ${editingStylist.name}` : 'Add New Stylist'}
      >
        <form onSubmit={handleSaveStylist} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
            <input
              type="text"
              required
              value={stylistForm.name}
              onChange={(e) => setStylistForm({ ...stylistForm, name: e.target.value })}
              placeholder="Alice Johnson"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Specialties * <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              required
              value={stylistForm.specialties}
              onChange={(e) => setStylistForm({ ...stylistForm, specialties: e.target.value })}
              placeholder="Hair, Color, Highlights"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Photo URL (optional)</label>
            <input
              type="url"
              value={stylistForm.photoUrl}
              onChange={(e) => setStylistForm({ ...stylistForm, photoUrl: e.target.value })}
              placeholder="https://example.com/photo.jpg"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Slot Duration</label>
            <select
              value={stylistForm.slotDuration}
              onChange={(e) => setStylistForm({ ...stylistForm, slotDuration: parseInt(e.target.value) })}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none bg-white"
            >
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
              <option value={120}>120 minutes</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddStylist(false)}
              className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors shadow-sm"
            >
              {editingStylist ? 'Save Changes' : 'Add Stylist'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Salon Settings Modal */}
      <Modal
        isOpen={showSalonSettings}
        onClose={() => setShowSalonSettings(false)}
        title="Salon Settings"
      >
        <form onSubmit={handleSaveSalon} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Salon Name</label>
            <input
              type="text"
              value={salonForm.name}
              onChange={(e) => setSalonForm({ ...salonForm, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Open Time</label>
              <input
                type="time"
                value={salonForm.openTime}
                onChange={(e) => setSalonForm({ ...salonForm, openTime: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Close Time</label>
              <input
                type="time"
                value={salonForm.closeTime}
                onChange={(e) => setSalonForm({ ...salonForm, closeTime: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Work Days</label>
            <div className="flex gap-2 flex-wrap">
              {WORK_DAY_LABELS.map((label, i) => {
                const isSelected = salonForm.workDays.split(',').map(Number).includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleWorkDay(i)}
                    className={`w-10 h-10 rounded-xl text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowSalonSettings(false)}
              className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors shadow-sm"
            >
              Save Settings
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

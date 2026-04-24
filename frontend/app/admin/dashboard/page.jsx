'use client'

import { useEffect, useState } from 'react'

import { apiService } from '@/services/api'

function getTodayString() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(0)}%`
}

function occupancyTone(rate) {
  if (rate >= 100) return 'bg-rose-100 text-rose-700 border-rose-200'
  if (rate >= 67) return 'bg-amber-100 text-amber-700 border-amber-200'
  if (rate > 0) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

function SeatAnalyticsTable({ matrix }) {
  if (!matrix?.rows?.length) {
    return <div className="px-6 py-8 text-center text-sm text-slate-400">No seat occupancy data available for this range.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-max w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium min-w-[110px]">Time</th>
            {matrix.columns.map(column => (
              <th key={column.date} className="px-3 py-3 text-center font-medium min-w-[120px]">
                <div className="font-semibold text-slate-700">{column.label}</div>
                <div className="text-xs text-slate-400">{column.sub_label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {matrix.rows.map(row => (
            <tr key={row.time_slot}>
              <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-slate-900">{row.time_slot}</td>
              {row.cells.map(cell => (
                <td key={`${row.time_slot}-${cell.date}`} className="px-3 py-3 align-top">
                  <div className={`rounded-xl border px-3 py-2 ${occupancyTone(cell.occupancy_rate)}`}>
                    <div className="text-base font-bold">{cell.occupied_seats}/{cell.total_seats}</div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide">{formatPercent(cell.occupancy_rate)} occupied</div>
                    <div className="mt-1 text-[11px] opacity-80">
                      Seats: {cell.occupied_seat_ids?.length ? cell.occupied_seat_ids.join(', ') : 'None'}
                    </div>
                    <div className="mt-1 text-[11px] opacity-80">
                      Stylists: {cell.occupied_stylist_count || 0}
                    </div>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StylistOccupancyTable({ summary }) {
  if (!summary?.items?.length) {
    return <div className="px-6 py-8 text-center text-sm text-slate-400">No stylist occupancy data available for this range.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-6 py-3 font-medium">Stylist</th>
            <th className="px-6 py-3 font-medium">Occupied Blocks</th>
            <th className="px-6 py-3 font-medium">Available Blocks</th>
            <th className="px-6 py-3 font-medium">Occupancy</th>
            <th className="px-6 py-3 font-medium">Appointments</th>
            <th className="px-6 py-3 font-medium">Completed</th>
            <th className="px-6 py-3 font-medium">Walk-ins</th>
            <th className="px-6 py-3 font-medium">Scheduled Days</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summary.items.map(item => (
            <tr key={item.stylist_id}>
              <td className="px-6 py-4 font-medium text-slate-900">{item.full_name}</td>
              <td className="px-6 py-4 text-slate-700">{item.occupied_blocks}</td>
              <td className="px-6 py-4 text-slate-700">{item.available_blocks}</td>
              <td className="px-6 py-4">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${occupancyTone(item.occupancy_rate)}`}>
                  {formatPercent(item.occupancy_rate)}
                </span>
              </td>
              <td className="px-6 py-4 text-slate-700">{item.appointments}</td>
              <td className="px-6 py-4 text-slate-700">{item.completed}</td>
              <td className="px-6 py-4 text-slate-700">{item.walkins}</td>
              <td className="px-6 py-4 text-slate-700">{item.scheduled_days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(getTodayString())
  const [seatView, setSeatView] = useState('week')
  const [stylistView, setStylistView] = useState('week')

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true)
      try {
        const data = await apiService.getAdminDashboard(selectedDate)
        setStats(data)
      } catch (error) {
        console.error('Error loading dashboard:', error)
        setStats(null)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [selectedDate])

  const statCards = [
    { label: 'Total Stylists', value: stats?.total_stylists ?? 0 },
    { label: "Today's Appointments", value: stats?.today_appointments ?? 0 },
    { label: 'Completed', value: stats?.completed_appointments ?? 0 },
    { label: 'Seats On Selected Day', value: stats?.selected_date_total_seats ?? 0 },
    { label: 'Total Revenue', value: stats?.total_revenue != null ? `₹${Number(stats.total_revenue).toLocaleString()}` : '₹0' },
  ]

  const seatAnalytics = stats?.seat_analytics?.[seatView]
  const stylistOccupancy = stats?.stylist_occupancy?.[stylistView]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Admin Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">Daily operations, weekly seat-slot occupancy, monthly seat usage, and stylist load in one place.</p>
        </div>
        <div className="w-full xl:w-64">
          <label className="mb-2 block text-sm font-medium text-slate-700">Reference date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={event => setSelectedDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading dashboard...
        </div>
      ) : !stats ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load dashboard data.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {statCards.map(card => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-slate-500">{card.label}</div>
                <div className="mt-3 text-3xl font-bold text-slate-900">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">Appointment Breakdown</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {[
                  ['Total Appointments', stats.total_appointments ?? 0],
                  ['Booked', stats.booked_appointments ?? 0],
                  ['Walk-ins', stats.walkin_appointments ?? 0],
                  ['Completed', stats.completed_appointments ?? 0],
                  ['Cancelled', stats.cancelled_appointments ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-6 py-4 text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-900">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">Daily Slot Overview</h3>
                <p className="mt-1 text-sm text-slate-500">Detailed seat occupancy and stylist assignment for {stats.selected_date}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {(stats.slot_overview || []).length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-slate-400">No slot data available for this date.</div>
                ) : (
                  stats.slot_overview.map(slot => (
                    <div key={slot.time_slot} className="px-6 py-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-base font-semibold text-slate-900">{slot.time_slot}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            Seats occupied: {slot.occupied_seats}/{slot.total_seats} • Occupancy {formatPercent(slot.occupancy_rate)}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            Occupied seats: {slot.occupied_seat_ids?.length ? slot.occupied_seat_ids.join(', ') : 'None'}
                          </div>
                        </div>
                        <div className="flex gap-3 text-xs font-semibold">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Occupied: {slot.occupied_seats}</span>
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Available: {slot.available_seats}</span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {slot.barber_assignments.map(barber => (
                          <div
                            key={`${slot.time_slot}-${barber.stylist_id}`}
                            className={`rounded-xl border px-4 py-3 text-sm ${
                              barber.status === 'occupied'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-emerald-200 bg-emerald-50'
                            }`}
                          >
                            <div className="font-semibold text-slate-900">{barber.barber_name}</div>
                            <div className={`mt-1 font-medium ${barber.status === 'occupied' ? 'text-amber-700' : 'text-emerald-700'}`}>
                              {barber.status === 'occupied' ? 'Occupied' : 'Free'}
                            </div>
                            {barber.customer_name && (
                              <div className="mt-1 text-slate-500">Customer: {barber.customer_name}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Seat Occupancy Analytics</h3>
                <p className="mt-1 text-sm text-slate-500">Seat-slot matrix for the selected week and month. Each cell shows occupancy plus the seats that were taken.</p>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                {['week', 'month'].map(view => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setSeatView(view)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      seatView === view
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {view === 'week' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 text-sm text-slate-500">{seatAnalytics?.label}</div>
            <SeatAnalyticsTable matrix={seatAnalytics} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Stylist Occupancy</h3>
                <p className="mt-1 text-sm text-slate-500">Availability blocks versus occupied blocks so you can spot underused and overloaded stylists.</p>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                {['week', 'month'].map(view => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setStylistView(view)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      stylistView === view
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {view === 'week' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 text-sm text-slate-500">{stylistOccupancy?.label}</div>
            <StylistOccupancyTable summary={stylistOccupancy} />
          </section>
        </>
      )}
    </div>
  )
}

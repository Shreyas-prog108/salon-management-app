'use client'
import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all',   label: 'All Time' },
]

function fmt(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}` }

export default function AnalyticsPage() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]   = useState('month')

  useEffect(() => {
    setLoading(true)
    apiService.getAdminAnalytics(period)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [period])

  if (loading) return <div className="loading"><div className="spinner-border"></div></div>
  if (!data)   return <div className="alert alert-danger">Failed to load analytics.</div>

  const p = data.periods[period]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Sales Analytics</h2>
        {/* Period tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                period === key
                  ? 'bg-[#2f8f57] text-white shadow'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="stat-card warning">
          <div className="stat-number">{fmt(p.revenue)}</div>
          <div className="stat-label">Revenue</div>
        </div>
        <div className="stat-card primary">
          <div className="stat-number">{p.appointments}</div>
          <div className="stat-label">Total Appointments</div>
        </div>
        <div className="stat-card success">
          <div className="stat-number">{p.completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card info">
          <div className="stat-number">{p.bookings}</div>
          <div className="stat-label">Bookings</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff' }}>
          <div className="stat-number">{p.walkins}</div>
          <div className="stat-label">Walk-ins</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Stylist breakdown */}
        <div className="card">
          <div className="card-header"><h5 className="m-0 font-semibold">By Stylist</h5></div>
          <div className="card-body p-0">
            {data.stylist_stats.length === 0 ? (
              <p className="text-center text-gray-400 py-6">No data yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Stylist</th>
                    <th className="text-center">Total</th>
                    <th className="text-center">Done</th>
                    <th className="text-center">Walk-in</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stylist_stats.map((s, i) => (
                    <tr key={i}>
                      <td className="font-medium">{s.name}</td>
                      <td className="text-center">{s.total}</td>
                      <td className="text-center text-green-600">{s.completed}</td>
                      <td className="text-center text-purple-600">{s.walkins}</td>
                      <td className="text-right font-semibold">{fmt(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Service breakdown */}
        <div className="card">
          <div className="card-header"><h5 className="m-0 font-semibold">By Service</h5></div>
          <div className="card-body p-0">
            {data.service_stats.length === 0 ? (
              <p className="text-center text-gray-400 py-6">No data yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th className="text-center">Total</th>
                    <th className="text-center">Done</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.service_stats.map((s, i) => (
                    <tr key={i}>
                      <td className="font-medium">{s.name}</td>
                      <td className="text-center">{s.total}</td>
                      <td className="text-center text-green-600">{s.completed}</td>
                      <td className="text-right font-semibold">{fmt(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Daily trend — last 30 days */}
      <div className="card">
        <div className="card-header"><h5 className="m-0 font-semibold">Daily Trend — Last 30 Days</h5></div>
        <div className="card-body p-0">
          {data.daily_trend.every(d => d.revenue === 0) ? (
            <p className="text-center text-gray-400 py-6">No revenue recorded in the last 30 days.</p>
          ) : (
            <>
              {/* Bar chart */}
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-end gap-0.5 h-24">
                  {(() => {
                    const max = Math.max(...data.daily_trend.map(d => d.revenue), 1)
                    return data.daily_trend.map((d, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center group relative">
                        <div
                          className="w-full bg-[#2f8f57] rounded-t opacity-80 group-hover:opacity-100 transition-all"
                          style={{ height: `${Math.max((d.revenue / max) * 88, d.revenue > 0 ? 4 : 0)}px` }}
                        ></div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                          <div className="bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                            {d.date}<br />{fmt(d.revenue)} · {d.count} appt
                          </div>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{data.daily_trend[0]?.date}</span>
                  <span>{data.daily_trend[data.daily_trend.length - 1]?.date}</span>
                </div>
              </div>

              {/* Table — only days with activity */}
              <div className="max-h-48 overflow-y-auto">
                <table className="table">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th>Date</th>
                      <th className="text-center">Appointments</th>
                      <th className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily_trend.filter(d => d.count > 0 || d.revenue > 0).reverse().map((d, i) => (
                      <tr key={i}>
                        <td>{d.date}</td>
                        <td className="text-center">{d.count}</td>
                        <td className="text-right font-semibold">{fmt(d.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

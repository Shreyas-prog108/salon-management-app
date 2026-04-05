'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiService } from '@/services/api'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await apiService.getAdminDashboard()
        setStats(data)
      } catch (error) {
        console.error('Error loading dashboard:', error)
      } finally {
        setLoading(false)
      }
    }
    loadDashboard()
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Admin Dashboard</h2>

      {loading ? (
        <div className="loading">
          <div className="spinner-border" role="status"></div>
        </div>
      ) : stats ? (
        <div>
          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="stat-card primary">
              <div className="stat-number">{stats.total_stylists ?? 0}</div>
              <div className="stat-label">Total Stylists</div>
            </div>
            <div className="stat-card success">
              <div className="stat-number">{stats.today_appointments ?? 0}</div>
              <div className="stat-label">Today&apos;s Appointments</div>
            </div>
            <div className="stat-card info">
              <div className="stat-number">{stats.completed_appointments ?? 0}</div>
              <div className="stat-label">Completed</div>
            </div>
            <div className="stat-card warning">
              <div className="stat-number">
                {stats.total_revenue != null ? `₹${Number(stats.total_revenue).toLocaleString()}` : '₹0'}
              </div>
              <div className="stat-label">Total Revenue</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card mb-6">
            <div className="card-header"><h5 className="m-0 font-semibold">Quick Actions</h5></div>
            <div className="card-body">
              <div className="grid grid-cols-3 gap-4">
                <Link href="/admin/stylists" className="btn btn-outline-primary py-3 font-semibold">
                  <i className="bi bi-person-badge mr-2"></i>Manage Stylists
                </Link>
                <Link href="/admin/services" className="btn btn-outline-success py-3 font-semibold">
                  <i className="bi bi-scissors mr-2"></i>Manage Services
                </Link>
                <Link href="/admin/appointments" className="btn btn-outline-info py-3 font-semibold">
                  <i className="bi bi-calendar-check mr-2"></i>View Appointments
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Appointment Breakdown */}
            <div className="card">
              <div className="card-header"><h5 className="m-0 font-semibold">Appointment Breakdown</h5></div>
              <div className="card-body p-0">
                <table className="table">
                  <tbody>
                    <tr>
                      <td>Total Appointments</td>
                      <td className="text-right font-semibold text-gray-800">{stats.total_appointments ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Booked</td>
                      <td className="text-right font-semibold text-gray-800">{stats.booked_appointments ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Walk-ins</td>
                      <td className="text-right font-semibold text-gray-800">{stats.walkin_appointments ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Completed</td>
                      <td className="text-right font-semibold text-gray-800">{stats.completed_appointments ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Cancelled</td>
                      <td className="text-right font-semibold text-gray-800">{stats.cancelled_appointments ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stylist Utilization */}
            {stats.stylist_utilization && stats.stylist_utilization.length > 0 && (
              <div className="card">
                <div className="card-header"><h5 className="m-0 font-semibold">Stylist Utilization</h5></div>
                <div className="card-body p-0">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Stylist</th>
                        <th>Appointments</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.stylist_utilization.map((s, i) => (
                        <tr key={i}>
                          <td>{s.full_name || s.name}</td>
                          <td>{s.appointment_count ?? s.appointments ?? 0}</td>
                          <td>{s.revenue != null ? `₹${Number(s.revenue).toLocaleString()}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="alert alert-danger">Failed to load dashboard data.</div>
      )}
    </div>
  )
}

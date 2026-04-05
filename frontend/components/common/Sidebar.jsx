'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { apiService } from '@/services/api'

const adminMenu = [
  { path: '/admin/dashboard',        label: 'Dashboard',       icon: 'bi bi-speedometer2' },
  { path: '/admin/analytics',        label: 'Analytics',       icon: 'bi bi-bar-chart-line' },
  { path: '/admin/stylists',         label: 'Stylists',        icon: 'bi bi-person-badge' },
  { path: '/admin/services',         label: 'Services',        icon: 'bi bi-scissors' },
  { path: '/admin/appointments',     label: 'Appointments',    icon: 'bi bi-calendar-check' },
  { path: '/admin/operating-hours',  label: 'Operating Hours', icon: 'bi bi-clock' },
]

const stylistMenu = [
  { path: '/stylist/appointments', label: 'My Schedule',  icon: 'bi bi-calendar-check' },
  { path: '/stylist/walkin',       label: 'Walk-in',      icon: 'bi bi-person-plus' },
  { path: '/stylist/availability', label: 'Availability', icon: 'bi bi-clock' },
  { path: '/stylist/profile',      label: 'My Profile',   icon: 'bi bi-person' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [role, setRole] = useState(null)

  useEffect(() => {
    setRole(apiService.user?.role || null)
  }, [])

  const menuItems =
    role === 'admin'   ? adminMenu :
    role === 'stylist' ? stylistMenu : []

  return (
    <div className="bg-white min-h-[calc(100vh-56px)] shadow-[2px_0_8px_rgba(0,0,0,0.15)] border-r border-gray-200">
      <nav className="flex flex-col py-4">
        {menuItems.map(item => (
          <Link
            key={item.path}
            href={item.path}
            className={`sidebar-nav-link${pathname === item.path ? ' active' : ''}`}
          >
            <i className={`${item.icon} mr-3`}></i>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

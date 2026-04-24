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

export default function Sidebar({ collapsed = false, onToggleCollapse }) {
  const pathname = usePathname()
  const [role, setRole] = useState(null)

  useEffect(() => {
    setRole(apiService.user?.role || null)
  }, [])

  const menuItems =
    role === 'admin'   ? adminMenu :
    role === 'stylist' ? stylistMenu : []

  return (
    <div className="bg-stone-950/40 backdrop-blur-xl h-full border-r border-white/5 relative z-20">
      <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3'} pt-4 pb-2`}>
        {!collapsed && <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-500">Navigation</div>}
        <button
          type="button"
          onClick={() => onToggleCollapse?.()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-stone-300 transition-all hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <i className={`bi ${collapsed ? 'bi-chevron-double-right' : 'bi-chevron-double-left'} text-sm`}></i>
        </button>
      </div>

      <nav className="flex flex-col py-4 px-3 space-y-1">
        {menuItems.map(item => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              title={collapsed ? item.label : undefined}
              className={`flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent ${
                isActive 
                  ? 'bg-stone-800/80 text-white shadow-lg border-stone-700/50' 
                  : 'text-stone-400 hover:text-white hover:bg-stone-800/40 hover:border-stone-700/30'
              } ${collapsed ? 'justify-center px-3' : ''}`}
            >
              <i className={`${item.icon} ${collapsed ? '' : 'mr-3'} text-lg ${isActive ? 'text-amber-400' : 'opacity-70'}`}></i>
              {!collapsed && item.label}
              {!collapsed && isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_5px_#fbbf24]"></div>}
            </Link>
          )
        })}
      </nav>
      
      <div className={`absolute bottom-6 ${collapsed ? 'left-3 right-3 p-3' : 'left-6 right-6 p-4'} rounded-xl bg-gradient-to-br from-stone-800/50 to-stone-900/50 border border-stone-700/50`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 mb-2'}`}>
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"></div>
          {!collapsed && <span className="text-xs font-bold text-stone-300 uppercase tracking-widest">System Active</span>}
        </div>
        {!collapsed && <p className="text-[10px] text-stone-500 leading-tight">Baalbar OS v2.0</p>}
      </div>
    </div>
  )
}

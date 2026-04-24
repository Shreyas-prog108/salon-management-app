'use client'
import { useEffect, useState } from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

export default function Layout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem('dashboard_sidebar_collapsed') === '1')
    } catch {}
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem('dashboard_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
    } catch {}
  }, [sidebarCollapsed])

  return (
    <div className="min-h-screen bg-stone-900 relative selection:bg-amber-100 selection:text-amber-900">
      {/* Background texture & image */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-stone-950/90 mix-blend-multiply z-10" />
        <div className="absolute inset-0 bg-gradient-to-br from-stone-900 via-stone-950 to-black z-10 opacity-80" />
        <img src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=2000&q=80" alt="Dark Barbershop" className="w-full h-full object-cover opacity-20 grayscale" />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        <Navbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(current => !current)}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className={`${sidebarCollapsed ? 'w-20' : 'w-72'} flex-shrink-0 transition-all duration-300`}>
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(current => !current)}
            />
          </div>
          <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar">
            <div className={`${sidebarCollapsed ? 'max-w-none' : 'max-w-[1500px]'} mx-auto transition-all duration-300`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { apiService } from '@/services/api'

export default function Navbar({ sidebarCollapsed = false, onToggleSidebar }) {
  const [user, setUser] = useState(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => { setUser(apiService.user) }, [])
  useEffect(() => { setIsMenuOpen(false) }, [pathname])

  useEffect(() => {
    function handleDocumentClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  async function handleLogout() {
    setIsMenuOpen(false)
    await apiService.logout()
    router.push('/auth/login')
  }

  return (
    <nav className="bg-stone-950/60 backdrop-blur-2xl border-b border-white/10 px-6 py-4 flex justify-between items-center shadow-lg relative z-50">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onToggleSidebar?.()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-stone-300 transition-all hover:bg-white/10 hover:text-white"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <i className={`bi ${sidebarCollapsed ? 'bi-layout-sidebar-inset-reverse' : 'bi-layout-sidebar-inset'} text-lg`}></i>
        </button>

        <Link href="/" className="flex items-center gap-3 no-underline group">
          <div className="w-9 h-9 bg-stone-900 border border-stone-700 rounded-lg flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
          </div>
          <span className="text-white font-serif font-bold text-xl tracking-tight">Baalbar.</span>
        </Link>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          className="flex items-center gap-3 text-stone-300 hover:text-white bg-white/5 border border-white/10 rounded-full px-4 py-2 cursor-pointer transition-all hover:bg-white/10"
          type="button"
          onClick={() => setIsMenuOpen(o => !o)}
        >
          <div className="w-6 h-6 rounded-full bg-stone-800 flex items-center justify-center text-xs font-bold text-amber-400 border border-stone-700">
            {(user?.full_name || user?.username || 'U').charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium">{user?.full_name || user?.username}</span>
          <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 mt-3 w-56 bg-stone-900 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] z-50 py-2 border border-stone-700 overflow-hidden backdrop-blur-xl">
            <div className="px-5 py-3 text-xs font-bold tracking-widest text-stone-500 uppercase border-b border-stone-800 mb-1">
              Signed in as <span className="text-amber-400 block mt-1">{user?.role}</span>
            </div>
            
            {user?.role === 'stylist' && (
              <Link
                href="/stylist/profile"
                className="flex items-center px-5 py-2.5 text-sm text-stone-300 hover:bg-stone-800 hover:text-white transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                <i className="bi bi-person mr-3 text-lg opacity-70"></i> My Profile
              </Link>
            )}
            
            <a
              className="flex items-center px-5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer mt-1 border-t border-stone-800"
              onClick={e => { e.preventDefault(); handleLogout() }}
            >
              <i className="bi bi-box-arrow-right mr-3 text-lg"></i> Sign out
            </a>
          </div>
        )}
      </div>
    </nav>
  )
}

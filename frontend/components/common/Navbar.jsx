'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { apiService } from '@/services/api'

export default function Navbar() {
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
    <nav className="navbar-custom">
      <a className="text-white font-bold text-lg flex items-center no-underline" href="#">
        <i className="bi bi-scissors mr-2"></i>
        Baalbar
      </a>

      <div className="relative" ref={menuRef}>
        <button
          className="flex items-center text-white/90 hover:text-white bg-transparent border-0 cursor-pointer px-3 py-2"
          type="button"
          onClick={() => setIsMenuOpen(o => !o)}
        >
          <i className="bi bi-person-circle mr-1"></i>
          {user?.full_name || user?.username}
          <i className="bi bi-chevron-down ml-1 text-xs"></i>
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg z-50 py-1 border border-gray-100">
            <div className="px-4 py-2 text-sm text-gray-500 capitalize flex items-center">
              <i className="bi bi-person mr-2"></i>{user?.role}
            </div>
            {user?.role === 'stylist' && (
              <Link
                href="/stylist/profile"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 no-underline flex items-center"
                onClick={() => setIsMenuOpen(false)}
              >
                <i className="bi bi-person mr-2"></i>My Profile
              </Link>
            )}
            <hr className="my-1 border-gray-100" />
            <a
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 no-underline flex items-center cursor-pointer"
              href="#"
              onClick={e => { e.preventDefault(); handleLogout() }}
            >
              <i className="bi bi-box-arrow-right mr-2"></i>Logout
            </a>
          </div>
        )}
      </div>
    </nav>
  )
}

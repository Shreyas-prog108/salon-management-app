'use client'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

export default function Layout({ children }) {
  return (
    <div>
      <Navbar />
      <div className="flex">
        <div className="w-1/6 flex-shrink-0">
          <Sidebar />
        </div>
        <div className="flex-1 p-6 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}

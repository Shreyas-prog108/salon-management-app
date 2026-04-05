'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiService } from '@/services/api'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const router = useRouter()

  function redirectByRole(role) {
    if (role === 'admin') router.push('/admin/dashboard')
    else if (role === 'stylist') router.push('/stylist/appointments')
    else router.push('/book')
  }

  useEffect(() => {
    const existingUser = apiService.user
    if (existingUser?.role) {
      redirectByRole(existingUser.role)
    }
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    const existingUser = apiService.user
    if (existingUser?.role) {
      redirectByRole(existingUser.role)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await apiService.login(email, password)
      redirectByRole(response.user.role)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="w-full max-w-md px-4">
        <div className="card login-card shadow-lg">
          <div className="card-body">
            <div className="text-center mb-6">
              <i className="bi bi-scissors text-7xl text-[#7C3D6B]"></i>
              <h2 className="mt-3 text-2xl font-bold text-gray-800">Baalbar</h2>
              <p className="text-gray-500">Sign in to your account</p>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label htmlFor="email" className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  id="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="Enter email"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  type="password"
                  className="form-control"
                  id="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Enter password"
                />
              </div>

              <button type="submit" className="btn btn-primary w-full mb-4" disabled={loading}>
                {loading && <span className="spinner-border spinner-border-sm mr-2"></span>}
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  )
}

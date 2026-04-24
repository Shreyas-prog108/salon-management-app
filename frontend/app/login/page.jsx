'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-amber-100 selection:text-amber-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex justify-center items-center gap-3 cursor-pointer group mb-8">
          <div className="w-12 h-12 bg-stone-950 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform duration-500 border border-stone-800">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            </svg>
          </div>
        </Link>
        <h2 className="text-center text-3xl font-serif text-stone-950 mb-2">Welcome back</h2>
        <p className="text-center text-sm text-stone-500 font-light mb-8">
          Sign in to your Baalbar account
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-[440px]">
        <div className="bg-white py-10 px-6 sm:rounded-[2rem] sm:px-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-200/60">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 animate-[fadeIn_0.3s_ease-out]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-2">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 border border-stone-200 rounded-xl shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 sm:text-sm transition-all duration-200 bg-stone-50/50"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-2">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 border border-stone-200 rounded-xl shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:border-stone-950 sm:text-sm transition-all duration-200 bg-stone-50/50"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-stone-950 focus:ring-stone-950 border-stone-300 rounded transition-colors"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-stone-600">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <a href="#" className="font-medium text-stone-500 hover:text-stone-900 transition-colors">
                  Forgot password?
                </a>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-stone-950 hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-900 transition-all duration-300 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {loading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Sign in to dashboard'}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center text-sm text-stone-500 font-light">
            Don't have an account?{' '}
            <a href="#" className="font-semibold text-stone-950 hover:underline">
              Contact Sales
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const FLASK = process.env.FLASK_URL || 'http://localhost:5000'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
}

async function proxyToFlask(method, url, { accessToken, body, headers: extraHeaders } = {}) {
  const headers = {}
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  if (extraHeaders) Object.assign(headers, extraHeaders)
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(url, {
    method,
    headers,
    body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    cache: 'no-store',
  })
}

async function handler(request, { params }) {
  const resolvedParams = await params
  const path = resolvedParams.path.join('/')

  const search = new URL(request.url).search
  const flaskUrl = `${FLASK}/api/${path}${search}`

  const cookieStore = await cookies()
  let accessToken = cookieStore.get('access_token')?.value
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (path === 'auth/logout') {
    await proxyToFlask('POST', `${FLASK}/api/auth/logout`, {
      accessToken,
      body: { refresh_token: refreshToken },
    }).catch(() => null)

    const res = NextResponse.json({ message: 'Logged out' })
    res.cookies.delete('access_token')
    res.cookies.delete('refresh_token')
    res.cookies.delete('user')
    return res
  }

  // Parse request body
  let body
  if (!['GET', 'HEAD'].includes(request.method)) {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      body = await request.formData()
    } else {
      const text = await request.text()
      try {
        body = text ? JSON.parse(text) : undefined
      } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
      }
    }
  }

  let flaskRes = await proxyToFlask(request.method, flaskUrl, { accessToken, body })

  // Transparent token refresh on 401
  let newAccessToken = null
  let responseRefreshToken = null
  if (flaskRes.status === 401 && refreshToken) {
    const refreshRes = await proxyToFlask('POST', `${FLASK}/api/auth/refresh`, {
      accessToken: refreshToken,
    })
    if (refreshRes.ok) {
      const refreshData = await refreshRes.json()
      newAccessToken = refreshData.access_token
      const newRefreshToken = refreshData.refresh_token
      accessToken = newAccessToken
      // Retry original request with new token
      flaskRes = await proxyToFlask(request.method, flaskUrl, { accessToken, body })

      if (newRefreshToken) {
        responseRefreshToken = newRefreshToken
      }
    }
  }

  // Parse Flask response
  let data
  const resContentType = flaskRes.headers.get('content-type') || ''
  
  try {
    if (resContentType.includes('application/json')) {
      const text = await flaskRes.text()
      data = text ? JSON.parse(text) : {}
    } else {
      data = { message: await flaskRes.text() }
    }
  } catch (error) {
    console.error('Error parsing Flask response:', error)
    console.error('Response status:', flaskRes.status)
    console.error('Response content-type:', resContentType)
    return NextResponse.json(
      { error: 'Failed to parse response from backend' },
      { status: 500 }
    )
  }

  const response = NextResponse.json(data, { status: flaskRes.status })

  // Set cookies on successful login
  if (path === 'auth/login' && flaskRes.ok && data.access_token) {
    response.cookies.set('access_token', data.access_token, { ...COOKIE_OPTS, maxAge: 900 })
    response.cookies.set('refresh_token', data.refresh_token, { ...COOKIE_OPTS, maxAge: 2592000 })
    // user cookie is non-httpOnly so JS can read role/name
    response.cookies.set('user', JSON.stringify(data.user), {
      ...COOKIE_OPTS,
      httpOnly: false,
      maxAge: 2592000,
    })
  }

  // Persist refreshed access token
  if (newAccessToken) {
    response.cookies.set('access_token', newAccessToken, { ...COOKIE_OPTS, maxAge: 900 })
  }
  if (responseRefreshToken) {
    response.cookies.set('refresh_token', responseRefreshToken, { ...COOKIE_OPTS, maxAge: 2592000 })
  }

  return response
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler

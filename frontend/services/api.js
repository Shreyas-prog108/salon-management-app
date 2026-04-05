const BASE = '/api'

function readUserCookie() {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie.match(/(?:^|;\s*)user=([^;]*)/)
    return match ? JSON.parse(decodeURIComponent(match[1])) : null
  } catch {
    return null
  }
}

class APIService {
  get user() {
    return readUserCookie()
  }

  // Kept for call-site compatibility — user is managed via cookie by the server
  setUser() {}

  async _request(method, path, { body, params, upload } = {}) {
    let url = `${BASE}/${path}`
    if (params) {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
      )
      if (qs.toString()) url += `?${qs}`
    }

    const init = { method, credentials: 'include' }

    if (upload) {
      const form = new FormData()
      form.append('photo', upload)
      init.body = form
    } else if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' }
      init.body = JSON.stringify(body)
    }

    const res = await fetch(url, init)
    const data = await res.json()

    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/auth/login'
      throw { response: { data } }
    }
    if (!res.ok) throw { response: { data } }
    return data
  }

  async login(email, password) {
    return this._request('POST', 'auth/login', {
      body: { email, password },
    })
  }

  logout() {
    return fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
  }

  // ── Admin: Dashboard ──────────────────────────────────────────
  getAdminDashboard() { return this._request('GET', 'admin/dashboard') }
  getAdminAnalytics(period) { return this._request('GET', 'admin/analytics', { params: { period } }) }

  // ── Admin: Services ───────────────────────────────────────────
  getServices() { return this._request('GET', 'admin/services') }
  createService(data) { return this._request('POST', 'admin/services', { body: data }) }
  updateService(id, data) { return this._request('PUT', `admin/services/${id}`, { body: data }) }

  // ── Admin: Stylists ───────────────────────────────────────────
  getStylists(params) { return this._request('GET', 'admin/stylists', { params }) }
  createStylist(data) { return this._request('POST', 'admin/stylists', { body: data }) }
  updateStylist(id, data) { return this._request('PUT', `admin/stylists/${id}`, { body: data }) }
  deleteStylist(id) { return this._request('DELETE', `admin/stylists/${id}`) }
  uploadStylistPhoto(stylistId, file) { return this._request('POST', `admin/stylists/${stylistId}/photo`, { upload: file }) }

  // ── Admin: Appointments ───────────────────────────────────────
  getAdminAppointments(params) { return this._request('GET', 'admin/appointments', { params }) }
  cancelAppointment(id) { return this._request('POST', `admin/appointments/${id}/cancel`, { body: {} }) }

  // ── Admin: Operating Hours ────────────────────────────────────
  getOperatingHours() { return this._request('GET', 'admin/operating-hours') }
  updateOperatingHours(data) { return this._request('PUT', 'admin/operating-hours', { body: data }) }

  // ── Stylist: Appointments ─────────────────────────────────────
  getStylistAppointments(params) { return this._request('GET', 'stylist/appointments', { params }) }
  updateAppointmentStatus(id, status) { return this._request('PUT', `stylist/appointments/${id}/status`, { body: { status } }) }
  addServiceRecord(id, data) { return this._request('POST', `stylist/appointments/${id}/service-record`, { body: data }) }

  // ── Stylist: Availability ─────────────────────────────────────
  getStylistAvailability(params) { return this._request('GET', 'stylist/availability', { params }) }
  addAvailabilitySlot(data) { return this._request('POST', 'stylist/availability', { body: data }) }
  deleteAvailabilitySlot(id) { return this._request('DELETE', `stylist/availability/${id}`) }

  // ── Stylist: Profile ──────────────────────────────────────────
  getStylistProfile() { return this._request('GET', 'stylist/profile') }
  updateStylistProfile(data) { return this._request('PUT', 'stylist/profile', { body: data }) }
  uploadProfilePhoto(file) { return this._request('POST', 'stylist/profile/photo', { upload: file }) }
  changePassword(data) { return this._request('POST', 'auth/change-password', { body: data }) }

  // ── Public Booking ────────────────────────────────────────────
  getPublicServices() { return this._request('GET', 'booking/services') }
  getPublicStylists(params) { return this._request('GET', 'booking/stylists', { params }) }
  getStylistSlots(stylistId, date, serviceId) { return this._request('GET', `booking/stylists/${stylistId}/availability`, { params: { date, service_id: serviceId } }) }
  bookAppointment(data) { return this._request('POST', 'booking/appointments', { body: data }) }
  createWalkin(data) { return this._request('POST', 'booking/walkin', { body: data }) }
  lookupAppointments(phone) { return this._request('GET', 'booking/appointments/lookup', { params: { phone } }) }
}

export const apiService = new APIService()

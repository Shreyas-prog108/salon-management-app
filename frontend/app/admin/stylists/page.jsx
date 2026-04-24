'use client'
import { useState, useEffect, useRef } from 'react'
import { apiService } from '@/services/api'
import { useUI } from '@/context/UIContext'

const BACKEND = 'http://localhost:5000'

const emptyForm = {
  username: '', email: '', password: '', new_password: '', full_name: '', phone: '',
  specialty: '', experience_years: 0, bio: '', service_ids: []
}

function Avatar({ photoUrl, name, size = 9 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (photoUrl) {
    return (
      <img
        src={photoUrl.startsWith('/uploads') ? `${BACKEND}${photoUrl}` : photoUrl}
        alt={name}
        className={`w-${size} h-${size} rounded-full object-cover border-2 border-gray-200`}
      />
    )
  }
  return (
    <div className={`w-${size} h-${size} rounded-full bg-[#2f8f57] text-white flex items-center justify-center font-semibold text-sm`}>
      {initials}
    </div>
  )
}

export default function AdminStylistsPage() {
  const [stylists, setStylists] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formError, setFormError] = useState('')
  const [stylistForm, setStylistForm] = useState(emptyForm)
  const [savedStylistId, setSavedStylistId] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef(null)
  const { alert, confirm } = useUI()

  useEffect(() => { loadStylists(); loadServices() }, [])

  async function loadStylists(search = searchQuery) {
    try {
      const data = await apiService.getStylists({ search })
      setStylists(data)
    } catch (error) {
      console.error('Error loading stylists:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadServices() {
    try {
      const data = await apiService.getServices()
      setServices(data)
    } catch (error) {
      console.error('Error loading services:', error)
    }
  }

  function handleSearchInput(e) {
    const q = e.target.value
    setSearchQuery(q)
    loadStylists(q)
  }

  function openAddModal() {
    setEditMode(false); setFormError(''); setStylistForm(emptyForm)
    setPhotoFile(null); setPhotoPreview(null); setSavedStylistId(null)
    setShowModal(true)
  }

  function editStylist(stylist) {
    setEditMode(true); setFormError('')
    setStylistForm({
      id: stylist.id,
      username: stylist.username || '',
      email: stylist.email || '',
      password: '',
      full_name: stylist.full_name || '',
      phone: stylist.phone || '',
      specialty: stylist.specialty || '',
      experience_years: stylist.experience_years ?? 0,
      bio: stylist.bio || '',
      service_ids: stylist.service_ids || [],
      new_password: ''
    })
    setPhotoFile(null)
    setPhotoPreview(stylist.photo_url
      ? (stylist.photo_url.startsWith('/uploads') ? `${BACKEND}${stylist.photo_url}` : stylist.photo_url)
      : null)
    setSavedStylistId(stylist.id)
    setShowModal(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setStylistForm(f => ({ ...f, [name]: value }))
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function saveStylist(e) {
    e.preventDefault()
    setFormError('')
    if (!editMode && !stylistForm.username?.trim()) return setFormError('Username is required')
    if (!stylistForm.email?.trim()) return setFormError('Email is required')
    if (!editMode && !stylistForm.password?.trim()) return setFormError('Password is required')
    if (!stylistForm.full_name?.trim()) return setFormError('Full name is required')

    const payload = {
      ...stylistForm,
      experience_years: stylistForm.experience_years === '' ? null : Number(stylistForm.experience_years),
      service_ids: stylistForm.service_ids.map(Number)
    }
    if (editMode) {
      delete payload.password
      if (!payload.new_password) delete payload.new_password
    }

    try {
      let saved
      if (editMode) {
        saved = await apiService.updateStylist(stylistForm.id, payload)
      } else {
        saved = await apiService.createStylist(payload)
        setSavedStylistId(saved.id)
      }

      // Upload photo if one was selected
      if (photoFile) {
        const targetId = editMode ? stylistForm.id : saved.id
        setPhotoUploading(true)
        try {
          await apiService.uploadStylistPhoto(targetId, photoFile)
        } catch {
          // Photo upload failed but stylist was saved — non-fatal
        } finally {
          setPhotoUploading(false)
        }
      }

      await loadStylists()
      setShowModal(false)
      await alert({ title: 'Success', message: editMode ? 'Stylist updated.' : 'Stylist added.', tone: 'info' })
    } catch (error) {
      setFormError(error.response?.data?.error || 'Error saving stylist')
    }
  }

  async function handleDeactivate(stylistId) {
    if (await confirm({ title: 'Deactivate Stylist', message: 'Are you sure you want to deactivate this stylist?', confirmText: 'Deactivate' })) {
      try {
        await apiService.deleteStylist(stylistId)
        await loadStylists()
      } catch (error) {
        await alert({ title: 'Error', message: error.response?.data?.error || 'Error deactivating stylist', tone: 'error' })
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Manage Stylists</h2>
        <button className="btn btn-primary" onClick={openAddModal}>
          <i className="bi bi-plus-circle mr-2"></i>Add Stylist
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="mb-4 w-1/2">
            <input type="text" className="form-control" placeholder="Search stylists..."
              value={searchQuery} onChange={handleSearchInput} />
          </div>

          {loading ? (
            <div className="loading"><div className="spinner-border"></div></div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-16">Photo</th>
                    <th className="min-w-[150px]">Name</th>
                    <th className="min-w-[200px]">Email</th>
                    <th className="min-w-[150px]">Phone</th>
                    <th className="min-w-[150px]">Specialty</th>
                    <th className="max-w-[250px]">Service</th>
                    <th className="w-20">Exp</th>
                    <th className="w-24">Status</th>
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stylists.length === 0 ? (
                    <tr><td colSpan={9} className="text-center text-gray-400 py-8">No stylists found.</td></tr>
                  ) : stylists.map(stylist => (
                    <tr key={stylist.id}>
                      <td><Avatar photoUrl={stylist.photo_url} name={stylist.full_name} /></td>
                      <td className="font-medium">{stylist.full_name}</td>
                      <td>{stylist.email}</td>
                      <td>{stylist.phone || '—'}</td>
                      <td>{stylist.specialty || '—'}</td>
                      <td className="text-xs max-w-[250px] truncate" title={stylist.services?.length ? stylist.services.map(s => s.name).join(', ') : '—'}>{stylist.services?.length ? stylist.services.map(s => s.name).join(', ') : '—'}</td>
                      <td>{stylist.experience_years ?? 0} yrs</td>
                      <td>
                        <span className={`badge ${stylist.is_active ? 'bg-success' : 'bg-danger'}`}>
                          {stylist.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-sm btn-outline-primary" onClick={() => editStylist(stylist)}>
                            <i className="bi bi-pencil"></i>
                          </button>
                          {stylist.is_active && (
                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeactivate(stylist.id)}>
                              <i className="bi bi-person-x"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="custom-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editMode ? 'Edit Stylist' : 'Add New Stylist'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <div className="modal-body">
                <form onSubmit={saveStylist} noValidate>
                  {formError && <div className="alert alert-danger">{formError}</div>}

                  {/* Photo upload */}
                  <div className="flex items-center gap-4 mb-5 p-4 bg-gray-50 rounded-lg">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-[#2f8f57]" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                        <i className="bi bi-person text-3xl"></i>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Profile Photo (Optional)</p>
                      <p className="text-xs text-gray-500 mb-2">JPG, PNG or WEBP — you can skip this and add it later</p>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                        className="hidden" onChange={handlePhotoChange} />
                      <button type="button" className="btn btn-sm btn-outline-primary"
                        onClick={() => fileInputRef.current?.click()}>
                        <i className="bi bi-upload mr-1"></i>
                        {photoPreview ? 'Change Photo' : 'Upload Photo'}
                      </button>
                      {photoFile && <span className="ml-2 text-xs text-green-600">{photoFile.name}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="form-label">Username *</label>
                      <input type="text" className="form-control" name="username"
                        value={stylistForm.username} onChange={handleFormChange} disabled={editMode} />
                    </div>
                    <div>
                      <label className="form-label">Email *</label>
                      <input type="email" className="form-control" name="email"
                        value={stylistForm.email} onChange={handleFormChange} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {!editMode ? (
                      <div>
                        <label className="form-label">Password *</label>
                        <input type="password" className="form-control" name="password"
                          value={stylistForm.password} onChange={handleFormChange} />
                      </div>
                    ) : (
                      <div>
                        <label className="form-label">Reset Password <span className="text-gray-400 text-xs font-normal">(leave blank to keep current)</span></label>
                        <input type="password" className="form-control" name="new_password"
                          value={stylistForm.new_password} onChange={handleFormChange}
                          placeholder="New password (min 6 chars)" />
                      </div>
                    )}
                    <div>
                      <label className="form-label">Full Name *</label>
                      <input type="text" className="form-control" name="full_name"
                        value={stylistForm.full_name} onChange={handleFormChange} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="form-label">Phone</label>
                      <input type="tel" className="form-control" name="phone"
                        value={stylistForm.phone} onChange={handleFormChange} placeholder="10-digit number" />
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        Digits only — no country code
                      </p>
                    </div>
                    <div>
                      <label className="form-label">Specialty</label>
                      <input type="text" className="form-control" name="specialty"
                        value={stylistForm.specialty} onChange={handleFormChange} placeholder="e.g. Haircut, Color" />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="form-label">Experience (years)</label>
                    <input type="number" min="0" className="form-control w-40" name="experience_years"
                      value={stylistForm.experience_years} onChange={handleFormChange} />
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="form-label mb-0">Services Offered</label>
                      <div className="flex gap-2">
                        <button type="button" className="btn btn-xs btn-outline-primary text-xs px-2 py-0.5"
                          onClick={() => setStylistForm(f => ({ ...f, service_ids: services.map(s => s.id) }))}>
                          Select All
                        </button>
                        <button type="button" className="btn btn-xs btn-outline-secondary text-xs px-2 py-0.5"
                          onClick={() => setStylistForm(f => ({ ...f, service_ids: [] }))}>
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-white grid grid-cols-2 gap-2">
                      {services.length === 0 ? (
                        <p className="text-sm text-gray-400 col-span-2">No services found.</p>
                      ) : services.map(s => (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:text-[#2f8f57]">
                          <input
                            type="checkbox"
                            className="accent-[#2f8f57]"
                            checked={stylistForm.service_ids.includes(s.id)}
                            onChange={e => {
                              setStylistForm(f => ({
                                ...f,
                                service_ids: e.target.checked
                                  ? [...f.service_ids, s.id]
                                  : f.service_ids.filter(id => id !== s.id)
                              }))
                            }}
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                    {stylistForm.service_ids.length > 0 && (
                      <p className="text-xs text-[#2f8f57] mt-1">{stylistForm.service_ids.length} service(s) selected</p>
                    )}
                  </div>

                  <div className="mb-4">
                    <label className="form-label">Bio</label>
                    <textarea className="form-control" name="bio"
                      value={stylistForm.bio} onChange={handleFormChange} rows={3}
                      placeholder="Short bio about the stylist" />
                  </div>

                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={photoUploading}>
                      {photoUploading && <span className="spinner-border spinner-border-sm mr-2"></span>}
                      {editMode ? 'Update' : 'Add'} Stylist
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

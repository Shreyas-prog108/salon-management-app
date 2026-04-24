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
        className={`w-${size} h-${size} rounded-full object-cover border-2 border-slate-600`}
      />
    )
  }
  return (
    <div className={`w-${size} h-${size} rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold text-sm`}>
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

      if (photoFile) {
        const targetId = editMode ? stylistForm.id : saved.id
        setPhotoUploading(true)
        try {
          await apiService.uploadStylistPhoto(targetId, photoFile)
        } catch {
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
    <div className="bg-slate-900 min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-100">Manage Stylists</h2>
        <button className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-5 py-2.5 rounded-xl transition-all hover:-translate-y-0.5 shadow-lg shadow-amber-500/20" onClick={openAddModal}>
          <i className="bi bi-plus-circle mr-2"></i>Add Stylist
        </button>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-6">
          <div className="mb-4 w-1/2">
            <input type="text" 
              className="w-full px-4 py-3 bg-slate-800/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all"
              placeholder="Search stylists..." value={searchQuery} onChange={handleSearchInput} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-slate-600 border-t-amber-500 rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4">Photo</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4 min-w-[150px]">Name</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4 min-w-[200px]">Email</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4 min-w-[150px]">Phone</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4 min-w-[150px]">Specialty</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4 max-w-[250px]">Services</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4 w-20">Exp</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4 w-24">Status</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 px-4 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stylists.length === 0 ? (
                    <tr><td colSpan={9} className="text-center text-slate-400 py-8">No stylists found.</td></tr>
                  ) : stylists.map(stylist => (
                    <tr key={stylist.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="py-3 px-4"><Avatar photoUrl={stylist.photo_url} name={stylist.full_name} /></td>
                      <td className="py-3 px-4 font-medium text-slate-100">{stylist.full_name}</td>
                      <td className="py-3 px-4 text-slate-300">{stylist.email}</td>
                      <td className="py-3 px-4 text-slate-300">{stylist.phone || '—'}</td>
                      <td className="py-3 px-4 text-slate-300">{stylist.specialty || '—'}</td>
                      <td className="text-xs text-slate-300 py-3 px-4 max-w-[250px] truncate" title={stylist.services?.length ? stylist.services.map(s => s.name).join(', ') : '—'}>{stylist.services?.length ? stylist.services.map(s => s.name).join(', ') : '—'}</td>
                      <td className="py-3 px-4 text-slate-300">{stylist.experience_years ?? 0} yrs</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${stylist.is_active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                          {stylist.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:text-amber-400 hover:bg-slate-700 transition-all" onClick={() => editStylist(stylist)}>
                            <i className="bi bi-pencil"></i>
                          </button>
                          {stylist.is_active && (
                            <button className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:text-red-400 hover:bg-slate-700 transition-all" onClick={() => handleDeactivate(stylist.id)}>
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
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-lg w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-800/80">
                <h5 className="text-xl font-bold text-slate-100">{editMode ? 'Edit Stylist' : 'Add New Stylist'}</h5>
                <button className="w-8 h-8 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center hover:bg-slate-600 hover:text-white transition-all" onClick={() => setShowModal(false)}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                <form onSubmit={saveStylist} noValidate>
                  {formError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm font-medium mb-4">{formError}</div>}

                  <div className="flex items-center gap-4 mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
                        <i className="bi bi-person text-3xl"></i>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-200 mb-1">Profile Photo (Optional)</p>
                      <p className="text-xs text-slate-400 mb-2">JPG, PNG or WEBP</p>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                      <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-all"
                        onClick={() => fileInputRef.current?.click()}>
                        <i className="bi bi-upload mr-1"></i>
                        {photoPreview ? 'Change' : 'Upload'}
                      </button>
                      {photoFile && <span className="ml-2 text-xs text-emerald-400">{photoFile.name}</span>}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Username <span className="text-red-400">*</span></label>
                      <input type="text" className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="username"
                        value={stylistForm.username} onChange={handleFormChange} disabled={editMode} placeholder="Enter username" />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Email <span className="text-red-400">*</span></label>
                      <input type="email" className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="email"
                        value={stylistForm.email} onChange={handleFormChange} placeholder="Enter email address" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {!editMode ? (
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1.5">Password <span className="text-red-400">*</span></label>
                          <input type="password" className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="password"
                            value={stylistForm.password} onChange={handleFormChange} placeholder="Enter password" />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1.5">Reset Password <span className="text-slate-500 text-xs font-normal">(leave blank to keep current)</span></label>
                          <input type="password" className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="new_password"
                            value={stylistForm.new_password} onChange={handleFormChange} placeholder="New password" />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name <span className="text-red-400">*</span></label>
                        <input type="text" className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="full_name"
                          value={stylistForm.full_name} onChange={handleFormChange} placeholder="Enter full name" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
                        <input type="tel" className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="phone"
                          value={stylistForm.phone} onChange={handleFormChange} placeholder="10-digit number" />
                        <p className="text-xs text-amber-500 mt-1">Digits only, no country code</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Specialty</label>
                        <input type="text" className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="specialty"
                          value={stylistForm.specialty} onChange={handleFormChange} placeholder="e.g. Haircut, Color" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Experience (years)</label>
                      <input type="number" min="0" className="w-32 px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="experience_years"
                        value={stylistForm.experience_years} onChange={handleFormChange} />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-slate-300">Services Offered</label>
                        <div className="flex gap-2">
                          <button type="button" className="text-xs px-2 py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all"
                            onClick={() => setStylistForm(f => ({ ...f, service_ids: services.map(s => s.id) }))}>
                            Select All
                          </button>
                          <button type="button" className="text-xs px-2 py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all"
                            onClick={() => setStylistForm(f => ({ ...f, service_ids: [] }))}>
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="border border-slate-600/50 rounded-xl p-3 max-h-48 overflow-y-auto bg-slate-900/50 grid grid-cols-2 gap-2 custom-scrollbar">
                        {services.length === 0 ? (
                          <p className="text-sm text-slate-400 col-span-2">No services found.</p>
                        ) : services.map(s => (
                          <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:text-emerald-400 transition-colors">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
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
                      {stylistForm.service_ids.length > 0 && <p className="text-xs text-emerald-400 mt-1">{stylistForm.service_ids.length} service(s) selected</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Bio</label>
                      <textarea className="w-full px-4 py-3 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all" name="bio"
                        value={stylistForm.bio} onChange={handleFormChange} rows={3} placeholder="Short bio about the stylist" />
                    </div>
                  </div>
                </form>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700/50 bg-slate-800/80">
                <button type="button" className="px-5 py-2.5 rounded-xl font-semibold bg-slate-700 text-slate-200 hover:bg-slate-600 transition-all" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl font-semibold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-all hover:-translate-y-0.5 shadow-lg shadow-amber-500/20" disabled={photoUploading} onClick={saveStylist}>
                  {photoUploading && <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mr-2"></span>}
                  {editMode ? 'Update' : 'Add'} Stylist
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
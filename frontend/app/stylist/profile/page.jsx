'use client'
import { useState, useEffect, useRef } from 'react'
import { apiService } from '@/services/api'
import { useUI } from '@/context/UIContext'

const BACKEND = 'http://localhost:5000'

export default function StylistProfilePage() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', specialty: '', bio: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef(null)
  const { alert } = useUI()

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    try {
      const data = await apiService.getStylistProfile()
      setProfile(data)
      setProfileForm({
        full_name: data.full_name || '',
        phone: data.phone || '',
        specialty: data.specialty || '',
        bio: data.bio || ''
      })
      if (data.photo_url) {
        setPhotoPreview(data.photo_url.startsWith('/uploads') ? `${BACKEND}${data.photo_url}` : data.photo_url)
      }
    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleProfileChange(e) {
    const { name, value } = e.target
    setProfileForm(f => ({ ...f, [name]: value }))
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function uploadPhoto() {
    if (!photoFile) return
    setPhotoUploading(true)
    setProfileMsg(''); setProfileError('')
    try {
      const result = await apiService.uploadProfilePhoto(photoFile)
      setPhotoPreview(result.photo_url.startsWith('/uploads') ? `${BACKEND}${result.photo_url}` : result.photo_url)
      setPhotoFile(null)
      setProfile(p => ({ ...p, photo_url: result.photo_url }))
      setProfileMsg('Photo updated successfully.')
    } catch (error) {
      setProfileError(error.response?.data?.error || 'Failed to upload photo')
    } finally {
      setPhotoUploading(false)
    }
  }

  async function saveProfile(e) {
    e.preventDefault()
    setProfileError(''); setProfileMsg('')
    if (!profileForm.full_name.trim()) return setProfileError('Full name is required')
    setProfileSaving(true)
    try {
      const updated = await apiService.updateStylistProfile(profileForm)
      setProfile(prev => ({ ...prev, ...updated }))
      const user = apiService.user
      if (user) apiService.setUser({ ...user, full_name: profileForm.full_name })
      setProfileMsg('Profile updated successfully.')
    } catch (error) {
      setProfileError(error.response?.data?.error || 'Error saving profile')
    } finally {
      setProfileSaving(false)
    }
  }

  function handlePasswordChange(e) {
    const { name, value } = e.target
    setPasswordForm(f => ({ ...f, [name]: value }))
  }

  async function savePassword(e) {
    e.preventDefault()
    setPasswordError(''); setPasswordMsg('')
    if (!passwordForm.old_password) return setPasswordError('Current password is required')
    if (!passwordForm.new_password) return setPasswordError('New password is required')
    if (passwordForm.new_password.length < 6) return setPasswordError('New password must be at least 6 characters')
    if (passwordForm.new_password !== passwordForm.confirm_password) return setPasswordError('Passwords do not match')
    setPasswordSaving(true)
    try {
      await apiService.changePassword({ old_password: passwordForm.old_password, new_password: passwordForm.new_password })
      setPasswordMsg('Password changed successfully.')
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' })
    } catch (error) {
      setPasswordError(error.response?.data?.error || 'Error changing password')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">My Profile</h2>

      {loading ? (
        <div className="loading"><div className="spinner-border"></div></div>
      ) : (
        <div className="grid grid-cols-2 gap-6">

          {/* Left column: photo + profile form */}
          <div className="flex flex-col gap-6">

            {/* Profile Photo */}
            <div className="card">
              <div className="card-header"><h5 className="m-0 font-semibold">Profile Photo</h5></div>
              <div className="card-body flex flex-col items-center gap-4">
                {photoPreview ? (
                  <img src={photoPreview} alt="Profile" className="w-32 h-32 rounded-full object-cover border-4 border-[#2f8f57] shadow" />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-[#2f8f57] flex items-center justify-center text-white text-4xl font-bold shadow">
                    {(profile?.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                )}

                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                  className="hidden" onChange={handlePhotoChange} />

                <div className="flex gap-2 flex-wrap justify-center">
                  <button type="button" className="btn btn-outline-primary btn-sm"
                    onClick={() => fileInputRef.current?.click()}>
                    <i className="bi bi-camera mr-1"></i>
                    {photoPreview && profile?.photo_url ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  {photoFile && (
                    <button type="button" className="btn btn-primary btn-sm"
                      onClick={uploadPhoto} disabled={photoUploading}>
                      {photoUploading
                        ? <><span className="spinner-border spinner-border-sm mr-1"></span>Uploading…</>
                        : <><i className="bi bi-check2 mr-1"></i>Save Photo</>}
                    </button>
                  )}
                </div>
                {photoFile && !photoUploading && (
                  <p className="text-xs text-gray-500">{photoFile.name} — click Save Photo to apply</p>
                )}
                {profileMsg && !profileSaving && <div className="alert alert-success w-full text-center py-2">{profileMsg}</div>}
                {profileError && !profileSaving && <div className="alert alert-danger w-full text-center py-2">{profileError}</div>}
              </div>
            </div>

            {/* Profile Info */}
            <div className="card">
              <div className="card-header"><h5 className="m-0 font-semibold">Profile Information</h5></div>
              <div className="card-body">
                <form onSubmit={saveProfile}>
                  <div className="mb-4">
                    <label className="form-label">Full Name *</label>
                    <input type="text" className="form-control" name="full_name"
                      value={profileForm.full_name} onChange={handleProfileChange} />
                  </div>
                  <div className="mb-4">
                    <label className="form-label">Phone</label>
                    <input type="tel" className="form-control" name="phone"
                      value={profileForm.phone} onChange={handleProfileChange} placeholder="10-digit number" />
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <i className="bi bi-exclamation-triangle-fill"></i>
                      Digits only — no country code
                    </p>
                  </div>
                  <div className="mb-4">
                    <label className="form-label">Specialty</label>
                    <input type="text" className="form-control" name="specialty"
                      value={profileForm.specialty} onChange={handleProfileChange}
                      placeholder="e.g. Haircut, Color, Styling" />
                  </div>
                  <div className="mb-4">
                    <label className="form-label">Bio</label>
                    <textarea className="form-control" name="bio" rows={4}
                      value={profileForm.bio} onChange={handleProfileChange}
                      placeholder="Tell customers about yourself" />
                  </div>

                  {profile && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                      <div><strong>Username:</strong> {profile.username}</div>
                      <div><strong>Email:</strong> {profile.email}</div>
                      <div><strong>Experience:</strong> {profile.experience_years ?? 0} years</div>
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary" disabled={profileSaving}>
                    {profileSaving && <span className="spinner-border spinner-border-sm mr-2"></span>}
                    <i className="bi bi-save mr-2"></i>Save Profile
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Right column: change password */}
          <div className="card" style={{ alignSelf: 'start' }}>
            <div className="card-header"><h5 className="m-0 font-semibold">Change Password</h5></div>
            <div className="card-body">
              {passwordMsg && <div className="alert alert-success">{passwordMsg}</div>}
              {passwordError && <div className="alert alert-danger">{passwordError}</div>}

              <form onSubmit={savePassword}>
                <div className="mb-4">
                  <label className="form-label">Current Password *</label>
                  <input type="password" className="form-control" name="old_password"
                    value={passwordForm.old_password} onChange={handlePasswordChange} />
                </div>
                <div className="mb-4">
                  <label className="form-label">New Password *</label>
                  <input type="password" className="form-control" name="new_password"
                    value={passwordForm.new_password} onChange={handlePasswordChange} />
                </div>
                <div className="mb-4">
                  <label className="form-label">Confirm New Password *</label>
                  <input type="password" className="form-control" name="confirm_password"
                    value={passwordForm.confirm_password} onChange={handlePasswordChange} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
                  {passwordSaving && <span className="spinner-border spinner-border-sm mr-2"></span>}
                  <i className="bi bi-lock mr-2"></i>Change Password
                </button>
              </form>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

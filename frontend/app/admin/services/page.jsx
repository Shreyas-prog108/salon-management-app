'use client'
import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'
import { useUI } from '@/context/UIContext'

const emptyForm = { name: '', description: '', price: '', duration_minutes: '', is_active: true }

export default function AdminServicesPage() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [serviceForm, setServiceForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const { alert } = useUI()

  useEffect(() => { loadServices() }, [])

  async function loadServices() {
    try {
      const data = await apiService.getServices()
      setServices(data)
    } catch (error) {
      console.error('Error loading services:', error)
    } finally {
      setLoading(false)
    }
  }

  function openAddModal() {
    setEditMode(false); setFormError(''); setServiceForm(emptyForm); setShowModal(true)
  }

  function editService(service) {
    setEditMode(true); setFormError('')
    setServiceForm({
      id: service.id,
      name: service.name || '',
      description: service.description || '',
      price: service.price ?? '',
      duration_minutes: service.duration_minutes ?? '',
      is_active: service.is_active !== false
    })
    setShowModal(true)
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target
    setServiceForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function saveService(e) {
    e.preventDefault()
    setFormError('')
    if (!serviceForm.name?.trim()) return setFormError('Service name is required')
    if (!serviceForm.price && serviceForm.price !== 0) return setFormError('Price is required')
    if (!serviceForm.duration_minutes) return setFormError('Duration is required')

    const payload = {
      name: serviceForm.name,
      description: serviceForm.description,
      price: Number(serviceForm.price),
      duration_minutes: Number(serviceForm.duration_minutes),
      is_active: serviceForm.is_active
    }

    try {
      if (editMode) await apiService.updateService(serviceForm.id, payload)
      else await apiService.createService(payload)
      await loadServices()
      setShowModal(false)
    } catch (error) {
      setFormError(error.response?.data?.error || 'Error saving service')
    }
  }

  async function toggleActive(service) {
    try {
      await apiService.updateService(service.id, { ...service, is_active: !service.is_active })
      await loadServices()
    } catch (error) {
      await alert({ title: 'Error', message: error.response?.data?.error || 'Error updating service', tone: 'error' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Manage Services</h2>
        <button className="btn btn-primary" onClick={openAddModal}>
          <i className="bi bi-plus-circle mr-2"></i>Add Service
        </button>
      </div>

      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="loading"><div className="spinner-border"></div></div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th><th>Description</th><th>Price</th><th>Duration</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-8">No services found.</td></tr>
                ) : services.map(service => (
                  <tr key={service.id}>
                    <td className="font-medium">{service.name}</td>
                    <td className="text-gray-500 max-w-xs truncate">{service.description || '—'}</td>
                    <td>₹{Number(service.price).toLocaleString()}</td>
                    <td>{service.duration_minutes} min</td>
                    <td>
                      <span className={`badge ${service.is_active ? 'bg-success' : 'bg-danger'}`}>
                        {service.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => editService(service)}>
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button
                          className={`btn btn-sm ${service.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                          onClick={() => toggleActive(service)}
                        >
                          <i className={`bi ${service.is_active ? 'bi-toggle-on' : 'bi-toggle-off'}`}></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="custom-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editMode ? 'Edit Service' : 'Add New Service'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <div className="modal-body">
                <form onSubmit={saveService} noValidate>
                  {formError && <div className="alert alert-danger">{formError}</div>}

                  <div className="mb-4">
                    <label className="form-label">Service Name *</label>
                    <input type="text" className="form-control" name="name"
                      value={serviceForm.name} onChange={handleFormChange} placeholder="e.g. Haircut" />
                  </div>

                  <div className="mb-4">
                    <label className="form-label">Description</label>
                    <textarea className="form-control" name="description"
                      value={serviceForm.description} onChange={handleFormChange}
                      rows={2} placeholder="Brief description of the service" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="form-label">Price (₹) *</label>
                      <input type="number" min="0" step="0.01" className="form-control" name="price"
                        value={serviceForm.price} onChange={handleFormChange} />
                    </div>
                    <div>
                      <label className="form-label">Duration (minutes) *</label>
                      <input type="number" min="1" className="form-control" name="duration_minutes"
                        value={serviceForm.duration_minutes} onChange={handleFormChange} />
                    </div>
                  </div>

                  {editMode && (
                    <div className="mb-4 flex items-center gap-2">
                      <input type="checkbox" className="form-check-input" id="is_active"
                        name="is_active" checked={serviceForm.is_active} onChange={handleFormChange} />
                      <label htmlFor="is_active" className="form-label mb-0">Active</label>
                    </div>
                  )}

                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">{editMode ? 'Update' : 'Add'} Service</button>
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

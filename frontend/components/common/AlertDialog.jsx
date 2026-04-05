'use client'

export default function AlertDialog({ show, title, message, buttonText, tone, onClose }) {
  if (!show) return null

  const iconClass =
    tone === 'success' ? 'bi bi-check-circle-fill' :
    tone === 'error'   ? 'bi bi-x-octagon-fill' :
    tone === 'warning' ? 'bi bi-exclamation-triangle-fill' :
                         'bi bi-info-circle-fill'

  const buttonClass = tone === 'error' ? 'btn btn-danger alert-btn' : 'btn btn-primary alert-btn'

  return (
    <div className="alert-overlay" onClick={onClose}>
      <div className={`alert-dialog tone-${tone}`} onClick={e => e.stopPropagation()}>
        <div className="alert-header">
          <div className="alert-badge">
            <i className={iconClass}></i>
          </div>
          <div>
            <h5 className="alert-title">{title}</h5>
          </div>
          <button type="button" className="alert-close" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="alert-body">
          <p className="alert-message">{message}</p>
        </div>
        <div className="alert-actions">
          <button type="button" className={buttonClass} onClick={onClose}>
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  )
}

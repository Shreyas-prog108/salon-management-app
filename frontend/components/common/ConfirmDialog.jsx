'use client'

export default function ConfirmDialog({
  show, title, subtitle, message, confirmText, cancelText, tone, onCancel, onConfirm
}) {
  if (!show) return null

  const confirmClass = tone === 'danger' ? 'btn btn-danger confirm-btn' : 'btn btn-primary confirm-btn'

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-header">
          <div>
            <h5 className="confirm-title">{title}</h5>
            {subtitle && <p className="confirm-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="confirm-close" onClick={onCancel}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="confirm-body">
          <p className="confirm-message">{message}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-light confirm-btn" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

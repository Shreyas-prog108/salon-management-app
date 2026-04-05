'use client'
import { createContext, useContext, useState, useRef, useCallback } from 'react'
import AlertDialog from '@/components/common/AlertDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'

const UIContext = createContext(null)

const defaultAlert = { show: false, title: 'Notice', message: '', buttonText: 'OK', tone: 'info' }
const defaultConfirm = {
  show: false, title: 'Confirm Action', subtitle: '',
  message: 'Are you sure you want to continue?',
  confirmText: 'Confirm', cancelText: 'Cancel', tone: 'danger'
}

export function UIProvider({ children }) {
  const [alertState, setAlertState] = useState(defaultAlert)
  const [confirmState, setConfirmState] = useState(defaultConfirm)
  const alertResolver = useRef(null)
  const confirmResolver = useRef(null)

  const showAlert = useCallback(({
    title = 'Notice', message = '', buttonText = 'OK', tone = 'info'
  } = {}) => {
    return new Promise((resolve) => {
      alertResolver.current = resolve
      setAlertState({ show: true, title, message, buttonText, tone })
    })
  }, [])

  const showConfirm = useCallback(({
    title = 'Confirm Action', subtitle = '',
    message = 'Are you sure you want to continue?',
    confirmText = 'Confirm', cancelText = 'Cancel', tone = 'danger'
  } = {}) => {
    return new Promise((resolve) => {
      confirmResolver.current = resolve
      setConfirmState({ show: true, title, subtitle, message, confirmText, cancelText, tone })
    })
  }, [])

  const closeAlert = useCallback(() => {
    if (alertResolver.current) alertResolver.current(true)
    alertResolver.current = null
    setAlertState(defaultAlert)
  }, [])

  const closeConfirm = useCallback((result) => {
    if (confirmResolver.current) confirmResolver.current(result)
    confirmResolver.current = null
    setConfirmState(defaultConfirm)
  }, [])

  return (
    <UIContext.Provider value={{ alert: showAlert, confirm: showConfirm }}>
      {children}
      <AlertDialog
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        buttonText={alertState.buttonText}
        tone={alertState.tone}
        onClose={closeAlert}
      />
      <ConfirmDialog
        show={confirmState.show}
        title={confirmState.title}
        subtitle={confirmState.subtitle}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        tone={confirmState.tone}
        onCancel={() => closeConfirm(false)}
        onConfirm={() => closeConfirm(true)}
      />
    </UIContext.Provider>
  )
}

export const useUI = () => useContext(UIContext)

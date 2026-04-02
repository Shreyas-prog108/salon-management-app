'use client';

import { formatTime } from '@/lib/utils';

interface Appointment {
  id: number;
  customerName: string;
  customerPhone: string;
  service: string;
  startTime: string | Date;
  endTime: string | Date;
  status: string;
  isWalkin: boolean;
  notes?: string | null;
  price?: number | null;
  stylist?: {
    id: number;
    name: string;
    specialties: string;
  };
}

interface AppointmentCardProps {
  appointment: Appointment;
  onStatusChange?: (id: number, status: string) => void;
  onDelete?: (id: number) => void;
  showStylist?: boolean;
  compact?: boolean;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800 border border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-800 border border-red-200' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-800 border border-blue-200' },
  walkin: { label: 'Walk-in', className: 'bg-purple-100 text-purple-800 border border-purple-200' },
};

export default function AppointmentCard({
  appointment,
  onStatusChange,
  onDelete,
  showStylist = false,
  compact = false,
}: AppointmentCardProps) {
  const statusInfo = statusConfig[appointment.status] || {
    label: appointment.status,
    className: 'bg-gray-100 text-gray-800 border border-gray-200',
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 hover:border-purple-200 hover:shadow-sm transition-all">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
          <span className="text-purple-700 font-semibold text-sm">
            {appointment.customerName.charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{appointment.customerName}</p>
          <p className="text-xs text-gray-500">
            {formatTime(appointment.startTime)} · {appointment.service}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
          {appointment.isWalkin ? 'Walk-in' : statusInfo.label}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-violet-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {appointment.customerName.charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{appointment.customerName}</h3>
              <p className="text-sm text-gray-500">{appointment.customerPhone}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
              {appointment.isWalkin ? 'Walk-in' : statusInfo.label}
            </span>
            {appointment.price && (
              <span className="text-sm font-semibold text-gray-900">${appointment.price}</span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span>{appointment.service}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}</span>
          </div>
          {showStylist && appointment.stylist && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>{appointment.stylist.name}</span>
            </div>
          )}
          {appointment.notes && (
            <div className="flex items-start gap-2 text-sm text-gray-500 mt-2 bg-gray-50 rounded-lg p-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <span>{appointment.notes}</span>
            </div>
          )}
        </div>

        {(onStatusChange || onDelete) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
            {onStatusChange && appointment.status === 'confirmed' && (
              <>
                <button
                  onClick={() => onStatusChange(appointment.id, 'completed')}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Mark Complete
                </button>
                <button
                  onClick={() => onStatusChange(appointment.id, 'cancelled')}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
            {onStatusChange && appointment.status === 'completed' && (
              <span className="text-xs text-gray-400 italic">Appointment completed</span>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(appointment.id)}
                className="ml-auto p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

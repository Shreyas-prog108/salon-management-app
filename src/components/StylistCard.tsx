'use client';

interface Stylist {
  id: number;
  name: string;
  specialties: string;
  photoUrl?: string | null;
  slotDuration: number;
  todayAppointmentCount?: number;
}

interface StylistCardProps {
  stylist: Stylist;
  onBook?: (stylist: Stylist) => void;
  selected?: boolean;
}

export default function StylistCard({ stylist, onBook, selected }: StylistCardProps) {
  const specialties = stylist.specialties.split(',').map((s) => s.trim()).filter(Boolean);

  const initials = stylist.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`bg-white rounded-2xl border-2 shadow-sm hover:shadow-lg transition-all cursor-pointer group ${
        selected
          ? 'border-purple-500 shadow-purple-100'
          : 'border-gray-100 hover:border-purple-200'
      }`}
      onClick={() => onBook && onBook(stylist)}
    >
      <div className="p-6">
        <div className="flex flex-col items-center text-center mb-4">
          <div className="relative mb-3">
            {stylist.photoUrl ? (
              <img
                src={stylist.photoUrl}
                alt={stylist.name}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-md"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 to-violet-600 flex items-center justify-center text-white text-2xl font-bold shadow-md ring-4 ring-white">
                {initials}
              </div>
            )}
            {selected && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center shadow-sm">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-lg">{stylist.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {stylist.slotDuration}-min slots
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 justify-center mb-4">
          {specialties.slice(0, 4).map((specialty) => (
            <span
              key={specialty}
              className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100"
            >
              {specialty}
            </span>
          ))}
          {specialties.length > 4 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500">
              +{specialties.length - 4}
            </span>
          )}
        </div>

        {onBook && (
          <button
            className={`w-full py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${
              selected
                ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white hover:shadow-md hover:shadow-purple-200 group-hover:bg-purple-600 group-hover:text-white'
            }`}
          >
            {selected ? 'Selected' : 'Book with ' + stylist.name.split(' ')[0]}
          </button>
        )}
      </div>
    </div>
  );
}

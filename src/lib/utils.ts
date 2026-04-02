import { prisma } from './prisma';

/**
 * Given a stylist and date, return array of available time strings ["09:00", "10:00", ...]
 * based on salon hours, stylist slot duration, and existing confirmed appointments.
 */
export async function getAvailableSlots(
  stylistId: number,
  date: string // YYYY-MM-DD
): Promise<string[]> {
  // Get salon config
  const salon = await prisma.salon.findFirst();
  if (!salon) return [];

  const stylist = await prisma.stylist.findUnique({ where: { id: stylistId } });
  if (!stylist) return [];

  // Check if the day is a work day
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay(); // 0=Sun, 1=Mon, ...6=Sat
  const workDays = salon.workDays.split(',').map(Number);
  if (!workDays.includes(dayOfWeek)) return [];

  // Parse open/close times
  const [openHour, openMin] = salon.openTime.split(':').map(Number);
  const [closeHour, closeMin] = salon.closeTime.split(':').map(Number);

  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;
  const slotDuration = stylist.slotDuration;

  // Generate all slots
  const allSlots: string[] = [];
  for (let m = openMinutes; m + slotDuration <= closeMinutes; m += slotDuration) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    allSlots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }

  // Get existing confirmed/completed appointments for this stylist on this date
  const startOfDay = new Date(date + 'T00:00:00.000Z');
  // Adjust to local midnight
  const localStart = new Date(date);
  localStart.setHours(0, 0, 0, 0);
  const localEnd = new Date(date);
  localEnd.setHours(23, 59, 59, 999);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      stylistId,
      status: { in: ['confirmed', 'completed'] },
      startTime: {
        gte: localStart,
        lte: localEnd,
      },
    },
  });

  // Filter out booked slots
  const availableSlots = allSlots.filter((slot) => {
    const [h, min] = slot.split(':').map(Number);
    const slotStart = new Date(date);
    slotStart.setHours(h, min, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

    // Check if any existing appointment overlaps with this slot
    const isBooked = existingAppointments.some((appt) => {
      const apptStart = new Date(appt.startTime);
      const apptEnd = new Date(appt.endTime);
      // Overlap check: slotStart < apptEnd && slotEnd > apptStart
      return slotStart < apptEnd && slotEnd > apptStart;
    });

    return !isBooked;
  });

  return availableSlots;
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'completed':
      return 'bg-blue-100 text-blue-800';
    case 'walkin':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

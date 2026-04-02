import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stylists = await prisma.stylist.findMany({
      include: {
        appointments: {
          where: {
            startTime: { gte: today, lt: tomorrow },
            status: { not: 'cancelled' },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const stylistsWithCount = stylists.map((s) => ({
      ...s,
      todayAppointmentCount: s.appointments.length,
      appointments: undefined,
    }));

    return NextResponse.json(stylistsWithCount);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stylists' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name || !body.specialties) {
      return NextResponse.json({ error: 'Name and specialties are required' }, { status: 400 });
    }

    const stylist = await prisma.stylist.create({
      data: {
        name: body.name,
        specialties: body.specialties,
        photoUrl: body.photoUrl || null,
        slotDuration: body.slotDuration || 60,
      },
    });

    return NextResponse.json(stylist, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create stylist' }, { status: 500 });
  }
}

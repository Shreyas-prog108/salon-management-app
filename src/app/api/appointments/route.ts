import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stylistId = searchParams.get('stylistId');
    const date = searchParams.get('date');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};

    if (stylistId) {
      where.stylistId = parseInt(stylistId);
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.startTime = { gte: startOfDay, lte: endOfDay };
    }

    if (status) {
      where.status = status;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        stylist: {
          select: { id: true, name: true, specialties: true },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return NextResponse.json(appointments);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      stylistId,
      customerName,
      customerPhone,
      service,
      startTime,
      endTime,
      status = 'confirmed',
      isWalkin = false,
      notes,
      price,
    } = body;

    if (!stylistId || !customerName || !customerPhone || !service || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // Check for conflicts (double-booking prevention)
    const conflict = await prisma.appointment.findFirst({
      where: {
        stylistId: parseInt(stylistId),
        status: { in: ['confirmed', 'completed'] },
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } },
        ],
      },
    });

    if (conflict) {
      return NextResponse.json(
        { error: 'This time slot is already booked for this stylist' },
        { status: 409 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        stylistId: parseInt(stylistId),
        customerName,
        customerPhone,
        service,
        startTime: start,
        endTime: end,
        status,
        isWalkin,
        notes: notes || null,
        price: price ? parseFloat(price) : null,
      },
      include: {
        stylist: {
          select: { id: true, name: true, specialties: true },
        },
      },
    });

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}

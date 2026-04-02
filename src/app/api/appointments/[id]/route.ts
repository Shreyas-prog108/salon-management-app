import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        stylist: { select: { id: true, name: true, specialties: true } },
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    return NextResponse.json(appointment);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch appointment' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: body.status !== undefined ? body.status : undefined,
        customerName: body.customerName !== undefined ? body.customerName : undefined,
        customerPhone: body.customerPhone !== undefined ? body.customerPhone : undefined,
        service: body.service !== undefined ? body.service : undefined,
        notes: body.notes !== undefined ? body.notes : undefined,
        price: body.price !== undefined ? parseFloat(body.price) : undefined,
        isWalkin: body.isWalkin !== undefined ? body.isWalkin : undefined,
      },
      include: {
        stylist: { select: { id: true, name: true, specialties: true } },
      },
    });

    return NextResponse.json(appointment);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    await prisma.appointment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    let salon = await prisma.salon.findFirst();
    if (!salon) {
      salon = await prisma.salon.create({
        data: {
          name: 'Glamour Studio',
          openTime: '09:00',
          closeTime: '18:00',
          workDays: '1,2,3,4,5,6',
        },
      });
    }
    return NextResponse.json(salon);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch salon' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const salon = await prisma.salon.findFirst();

    if (!salon) {
      const newSalon = await prisma.salon.create({ data: body });
      return NextResponse.json(newSalon);
    }

    const updated = await prisma.salon.update({
      where: { id: salon.id },
      data: {
        name: body.name !== undefined ? body.name : undefined,
        openTime: body.openTime !== undefined ? body.openTime : undefined,
        closeTime: body.closeTime !== undefined ? body.closeTime : undefined,
        workDays: body.workDays !== undefined ? body.workDays : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update salon' }, { status: 500 });
  }
}

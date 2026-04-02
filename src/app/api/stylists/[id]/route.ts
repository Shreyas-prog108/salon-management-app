import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const stylist = await prisma.stylist.findUnique({ where: { id } });

    if (!stylist) {
      return NextResponse.json({ error: 'Stylist not found' }, { status: 404 });
    }

    return NextResponse.json(stylist);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stylist' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();

    const stylist = await prisma.stylist.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name : undefined,
        specialties: body.specialties !== undefined ? body.specialties : undefined,
        photoUrl: body.photoUrl !== undefined ? body.photoUrl : undefined,
        slotDuration: body.slotDuration !== undefined ? body.slotDuration : undefined,
      },
    });

    return NextResponse.json(stylist);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update stylist' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    await prisma.stylist.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete stylist' }, { status: 500 });
  }
}

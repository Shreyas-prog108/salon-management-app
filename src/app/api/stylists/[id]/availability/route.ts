import { NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/utils';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'date query parameter is required (YYYY-MM-DD)' }, { status: 400 });
    }

    const stylistId = parseInt(params.id);
    const slots = await getAvailableSlots(stylistId, date);

    return NextResponse.json({ slots, date, stylistId });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create salon config
  await prisma.salon.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Glamour Studio',
      openTime: '09:00',
      closeTime: '18:00',
      workDays: '1,2,3,4,5,6',
    },
  });

  // Create stylists
  const alice = await prisma.stylist.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Alice Johnson',
      specialties: 'Hair,Color,Highlights,Balayage',
      photoUrl: null,
      slotDuration: 60,
    },
  });

  const bob = await prisma.stylist.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'Bob Martinez',
      specialties: 'Beard,Grooming,Haircut,Shave',
      photoUrl: null,
      slotDuration: 30,
    },
  });

  const carol = await prisma.stylist.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: 'Carol Williams',
      specialties: 'Nails,Spa,Manicure,Pedicure',
      photoUrl: null,
      slotDuration: 60,
    },
  });

  // Create sample appointments — some today, some past
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const makeDate = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // Today's appointments
  await prisma.appointment.createMany({
    data: [
      {
        stylistId: alice.id,
        customerName: 'Emma Thompson',
        customerPhone: '555-0101',
        service: 'Balayage',
        startTime: makeDate(0, 9, 0),
        endTime: makeDate(0, 10, 0),
        status: 'confirmed',
        price: 120,
        notes: 'Wants natural-looking highlights',
      },
      {
        stylistId: alice.id,
        customerName: 'Sophie Chen',
        customerPhone: '555-0102',
        service: 'Color',
        startTime: makeDate(0, 11, 0),
        endTime: makeDate(0, 12, 0),
        status: 'confirmed',
        price: 95,
      },
      {
        stylistId: bob.id,
        customerName: 'Marcus Davis',
        customerPhone: '555-0103',
        service: 'Beard Trim & Shave',
        startTime: makeDate(0, 9, 0),
        endTime: makeDate(0, 9, 30),
        status: 'completed',
        price: 35,
      },
      {
        stylistId: bob.id,
        customerName: 'James Wilson',
        customerPhone: '555-0104',
        service: 'Haircut',
        startTime: makeDate(0, 10, 0),
        endTime: makeDate(0, 10, 30),
        status: 'confirmed',
        price: 45,
        isWalkin: true,
      },
      {
        stylistId: carol.id,
        customerName: 'Olivia Brown',
        customerPhone: '555-0105',
        service: 'Manicure & Pedicure',
        startTime: makeDate(0, 10, 0),
        endTime: makeDate(0, 11, 0),
        status: 'confirmed',
        price: 75,
      },
      {
        stylistId: carol.id,
        customerName: 'Isabella Garcia',
        customerPhone: '555-0106',
        service: 'Spa Treatment',
        startTime: makeDate(0, 13, 0),
        endTime: makeDate(0, 14, 0),
        status: 'confirmed',
        price: 110,
      },
    ],
    skipDuplicates: true,
  });

  // Past appointments
  await prisma.appointment.createMany({
    data: [
      {
        stylistId: alice.id,
        customerName: 'Mia Johnson',
        customerPhone: '555-0201',
        service: 'Highlights',
        startTime: makeDate(-1, 10, 0),
        endTime: makeDate(-1, 11, 0),
        status: 'completed',
        price: 105,
      },
      {
        stylistId: alice.id,
        customerName: 'Ava Williams',
        customerPhone: '555-0202',
        service: 'Haircut & Style',
        startTime: makeDate(-2, 14, 0),
        endTime: makeDate(-2, 15, 0),
        status: 'completed',
        price: 80,
      },
      {
        stylistId: bob.id,
        customerName: 'Liam Brown',
        customerPhone: '555-0203',
        service: 'Grooming Package',
        startTime: makeDate(-1, 11, 0),
        endTime: makeDate(-1, 11, 30),
        status: 'completed',
        price: 55,
      },
      {
        stylistId: carol.id,
        customerName: 'Charlotte Davis',
        customerPhone: '555-0204',
        service: 'Pedicure',
        startTime: makeDate(-3, 15, 0),
        endTime: makeDate(-3, 16, 0),
        status: 'completed',
        price: 45,
      },
      {
        stylistId: alice.id,
        customerName: 'Noah Taylor',
        customerPhone: '555-0205',
        service: 'Color',
        startTime: makeDate(-1, 9, 0),
        endTime: makeDate(-1, 10, 0),
        status: 'cancelled',
        price: 95,
      },
    ],
    skipDuplicates: true,
  });

  // Future appointments
  await prisma.appointment.createMany({
    data: [
      {
        stylistId: alice.id,
        customerName: 'Grace Lee',
        customerPhone: '555-0301',
        service: 'Balayage',
        startTime: makeDate(1, 10, 0),
        endTime: makeDate(1, 11, 0),
        status: 'confirmed',
        price: 120,
      },
      {
        stylistId: bob.id,
        customerName: 'Ethan Moore',
        customerPhone: '555-0302',
        service: 'Haircut',
        startTime: makeDate(1, 9, 0),
        endTime: makeDate(1, 9, 30),
        status: 'confirmed',
        price: 45,
      },
      {
        stylistId: carol.id,
        customerName: 'Zoe Anderson',
        customerPhone: '555-0303',
        service: 'Manicure',
        startTime: makeDate(2, 14, 0),
        endTime: makeDate(2, 15, 0),
        status: 'confirmed',
        price: 40,
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed data created successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

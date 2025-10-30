const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const keys = Object.keys(prisma).filter(k => !k.startsWith('$'));
    console.log(keys.sort().join(','));
  } finally {
    await prisma.$disconnect();
  }
})();
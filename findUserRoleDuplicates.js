const { prisma } = require('./src/server/lib/prisma');

async function findUserRoleDuplicates() {
  const all = await prisma.userRole.findMany();
  const map = new Map();

  for (const ur of all) {
    const key = `${ur.userId}-${ur.roleId}-${ur.companyId ?? 'null'}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ur.id);
  }

  let found = false;
  for (const [key, ids] of map.entries()) {
    if (ids.length > 1) {
      found = true;
      console.log(`Doublon : ${key} → IDs: ${ids.join(', ')}`);
    }
  }
  if (!found) {
    console.log('Aucun doublon UserRole trouvé.');
  }
  await prisma.$disconnect();
}

findUserRoleDuplicates();

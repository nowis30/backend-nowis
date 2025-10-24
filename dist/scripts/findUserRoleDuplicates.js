"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../server/lib/prisma");
async function findUserRoleDuplicates() {
    const all = await prisma_1.prisma.userRole.findMany();
    const map = new Map();
    for (const ur of all) {
        const key = `${ur.userId}-${ur.roleId}-${ur.companyId ?? 'null'}`;
        if (!map.has(key))
            map.set(key, []);
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
    await prisma_1.prisma.$disconnect();
}
findUserRoleDuplicates();

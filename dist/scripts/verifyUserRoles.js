"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../server/lib/prisma");
async function main() {
    const users = await prisma_1.prisma.user.findMany({
        include: {
            roles: {
                include: { role: true, company: true }
            }
        }
    });
    for (const user of users) {
        console.log(`User: ${user.email}`);
        if (!user.roles.length) {
            console.log('  No roles assigned');
            continue;
        }
        for (const link of user.roles) {
            const scope = link.company ? `company ${link.company.name}` : 'global';
            console.log(`  Role: ${link.role.name} (${scope})`);
        }
    }
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});

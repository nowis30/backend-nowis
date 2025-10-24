/*
  Warnings:

  - A unique constraint covering the columns `[userId,roleId,companyId]` on the table `UserRole` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_companyId_key" ON "UserRole"("userId", "roleId", "companyId");

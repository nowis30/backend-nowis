-- CreateEnum
CREATE TYPE "AdvisorExpert" AS ENUM ('FISCALISTE', 'COMPTABLE', 'PLANIFICATEUR', 'AVOCAT');

-- CreateEnum
CREATE TYPE "AdvisorConversationRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AdvisorConversationStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "AdvisorConversation" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "expert" "AdvisorExpert" NOT NULL,
    "status" "AdvisorConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdvisorConversationStep" (
    "id" SERIAL PRIMARY KEY,
    "conversationId" INTEGER NOT NULL,
    "role" "AdvisorConversationRole" NOT NULL,
    "message" TEXT NOT NULL,
    "snapshot" JSONB,
    "updates" JSONB,
    "nextQuestion" JSONB,
    "completed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AdvisorConversation_userId_idx" ON "AdvisorConversation"("userId");
CREATE INDEX "AdvisorConversation_userId_expert_idx" ON "AdvisorConversation"("userId", "expert");
CREATE INDEX "AdvisorConversationStep_conversationId_idx" ON "AdvisorConversationStep"("conversationId");

-- AddForeignKey
ALTER TABLE "AdvisorConversation"
  ADD CONSTRAINT "AdvisorConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "AdvisorConversationStep"
  ADD CONSTRAINT "AdvisorConversationStep_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdvisorConversation"("id") ON DELETE CASCADE;

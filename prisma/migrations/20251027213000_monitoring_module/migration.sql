-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertEventStatus" AS ENUM ('TRIGGERED', 'RESOLVED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WEBHOOK', 'LOG');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable AlertRule
CREATE TABLE "AlertRule" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
  "triggerType" TEXT NOT NULL,
  "condition" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for AlertRule
CREATE INDEX "AlertRule_userId_isActive_idx" ON "AlertRule"("userId", "isActive");
CREATE INDEX "AlertRule_userId_triggerType_idx" ON "AlertRule"("userId", "triggerType");

-- Foreign Keys for AlertRule
ALTER TABLE "AlertRule"
  ADD CONSTRAINT "AlertRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- CreateTable AlertEvent
CREATE TABLE "AlertEvent" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "ruleId" INTEGER NOT NULL,
  "status" "AlertEventStatus" NOT NULL DEFAULT 'TRIGGERED',
  "payload" JSONB,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for AlertEvent
CREATE INDEX "AlertEvent_userId_ruleId_idx" ON "AlertEvent"("userId", "ruleId");
CREATE INDEX "AlertEvent_userId_status_idx" ON "AlertEvent"("userId", "status");
CREATE INDEX "AlertEvent_triggeredAt_idx" ON "AlertEvent"("triggeredAt");

-- Foreign Keys for AlertEvent
ALTER TABLE "AlertEvent"
  ADD CONSTRAINT "AlertEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "AlertEvent"
  ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE;

-- CreateTable Notification
CREATE TABLE "Notification" (
  "id" SERIAL PRIMARY KEY,
  "eventId" INTEGER NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "target" TEXT,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Notification
CREATE INDEX "Notification_eventId_status_idx" ON "Notification"("eventId", "status");

-- Foreign Keys for Notification
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AlertEvent"("id") ON DELETE CASCADE;

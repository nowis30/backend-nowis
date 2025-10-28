-- Add demographic fields to Shareholder for personal profile
ALTER TABLE "Shareholder"
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gender" TEXT;

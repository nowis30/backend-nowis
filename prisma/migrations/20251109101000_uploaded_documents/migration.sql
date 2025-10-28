-- Create table for generic uploaded documents
CREATE TABLE "UploadedDocument" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "domain" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "notes" TEXT,
  "originalName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "checksum" TEXT,
  "taxYear" INTEGER,
  "shareholderId" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "UploadedDocument_userId_domain_idx" ON "UploadedDocument" ("userId", "domain");
CREATE INDEX "UploadedDocument_userId_taxYear_idx" ON "UploadedDocument" ("userId", "taxYear");

ALTER TABLE "UploadedDocument"
  ADD CONSTRAINT "UploadedDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UploadedDocument"
  ADD CONSTRAINT "UploadedDocument_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UploadedDocument" ALTER COLUMN "updatedAt" DROP DEFAULT;

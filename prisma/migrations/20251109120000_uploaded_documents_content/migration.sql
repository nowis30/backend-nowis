-- Add content column to persist uploaded file data for resilience
ALTER TABLE "UploadedDocument" ADD COLUMN "content" BYTEA;
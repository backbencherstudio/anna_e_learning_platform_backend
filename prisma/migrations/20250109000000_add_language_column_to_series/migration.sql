-- Drop foreign key constraint if it exists
ALTER TABLE "series" DROP CONSTRAINT IF EXISTS "series_language_id_fkey";

-- Drop the language_id column if it exists
ALTER TABLE "series" DROP COLUMN IF EXISTS "language_id";

-- Add the language column as TEXT
ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "language" TEXT;


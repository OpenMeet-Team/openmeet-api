-- Matrix Data Cleanup Script
-- This script will clear all Matrix-related data from the OpenMeet database

-- Option 1: Full cleanup (removes all Matrix data)
-- Uncomment this section to run a complete cleanup

/*
-- 1. Clean up junction table first (due to foreign key constraints)
DELETE FROM "tenant_lsdfaopkljdfs"."userChatRooms";

-- 2. Clean up chatRooms table
DELETE FROM "tenant_lsdfaopkljdfs"."chatRooms";

-- 3. Remove Matrix fields from users table
UPDATE "tenant_lsdfaopkljdfs"."users"
SET "matrixUserId" = NULL,
    "matrixAccessToken" = NULL,
    "matrixDeviceId" = NULL,
    "preferences" = "preferences" - 'matrix'
WHERE "matrixUserId" IS NOT NULL 
   OR "matrixAccessToken" IS NOT NULL 
   OR "matrixDeviceId" IS NOT NULL
   OR ("preferences" IS NOT NULL AND "preferences" ? 'matrix');

-- 4. Clear Matrix room IDs from events
UPDATE "tenant_lsdfaopkljdfs"."events"
SET "matrixRoomId" = NULL
WHERE "matrixRoomId" IS NOT NULL;

-- 5. Clear Matrix room IDs from groups
UPDATE "tenant_lsdfaopkljdfs"."groups"
SET "matrixRoomId" = NULL
WHERE "matrixRoomId" IS NOT NULL;
*/

-- Option 2: Reset invalid credentials only (keeps room structures but resets user auth)
-- This is the recommended approach when Matrix tokens become invalid

-- First, make a backup of current credentials
CREATE TABLE IF NOT EXISTS "tenant_lsdfaopkljdfs".matrix_credentials_backup AS
SELECT id, "matrixUserId", "matrixAccessToken", "matrixDeviceId" 
FROM "tenant_lsdfaopkljdfs"."users"
WHERE "matrixUserId" IS NOT NULL;

-- Only reset Matrix credentials for users
UPDATE "tenant_lsdfaopkljdfs"."users" 
SET 
  "matrixUserId" = NULL,
  "matrixAccessToken" = NULL, 
  "matrixDeviceId" = NULL,
  "preferences" = jsonb_set(
    CASE WHEN "preferences" IS NULL THEN '{}'::jsonb ELSE "preferences" END,
    '{matrix}',
    '{"connected": false}'::jsonb
  )
WHERE "matrixUserId" IS NOT NULL;

-- Show counts for verification
SELECT COUNT(*) AS "Users with matrix credentials cleared" FROM "tenant_lsdfaopkljdfs"."users" WHERE "matrixUserId" IS NULL;
SELECT COUNT(*) AS "Backup records" FROM "tenant_lsdfaopkljdfs".matrix_credentials_backup;
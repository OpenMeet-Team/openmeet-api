-- Matrix Data Cleanup Script
-- This script will clear all Matrix-related data from the OpenMeet database

schema = 'tenant_lsdfaopkljdfs';

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
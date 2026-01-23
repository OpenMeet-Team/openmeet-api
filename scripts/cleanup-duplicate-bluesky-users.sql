-- Cleanup script: Remove duplicate Bluesky users with same DID
-- Run this script in each environment (local, dev, prod)
--
-- Issue: Some Bluesky users have duplicate accounts with the same DID.
-- This happened when the same Bluesky login created a new user instead of
-- logging into the existing one.
--
-- This script:
-- 1. Finds duplicate DID users (same socialId, provider='bluesky')
-- 2. Keeps the older user (more likely to have activity)
-- 3. Deletes the newer duplicate (after removing related records)

-- Set the schema (change for each tenant)
-- For local/dev: tenant_lsdfaopkljdfs
-- For prod: tenant_openmeet (or appropriate tenant)

\echo '=== Duplicate Bluesky User Cleanup ==='

-- Step 1: Find duplicates (dry run - review before proceeding)
\echo ''
\echo '--- Step 1: Finding duplicate DID users ---'
SELECT
  u."socialId" as did,
  COUNT(*) as user_count,
  array_agg(u.id ORDER BY u."createdAt") as user_ids,
  array_agg(u.email ORDER BY u."createdAt") as emails,
  array_agg(u."createdAt"::date ORDER BY u."createdAt") as created_dates
FROM tenant_lsdfaopkljdfs.users u
WHERE u.provider = 'bluesky'
  AND u."socialId" IS NOT NULL
  AND u."deletedAt" IS NULL
GROUP BY u."socialId"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- Step 2: For each duplicate set, identify the user to DELETE (newer one with less activity)
-- In this case: user 20 is newer and has no activity
\echo ''
\echo '--- Step 2: User 20 related data check ---'
SELECT 'sessions' as table_name, COUNT(*) as count
FROM tenant_lsdfaopkljdfs.sessions WHERE "userId" = 20;

-- Step 3: Delete related records first (sessions)
\echo ''
\echo '--- Step 3: Deleting sessions for user 20 ---'
DELETE FROM tenant_lsdfaopkljdfs.sessions WHERE "userId" = 20;

-- Step 4: Delete the duplicate user
\echo ''
\echo '--- Step 4: Deleting duplicate user 20 ---'
DELETE FROM tenant_lsdfaopkljdfs.users WHERE id = 20;

-- Step 5: Verify cleanup
\echo ''
\echo '--- Step 5: Verification - should return 0 rows ---'
SELECT
  u."socialId" as did,
  COUNT(*) as user_count
FROM tenant_lsdfaopkljdfs.users u
WHERE u.provider = 'bluesky'
  AND u."socialId" IS NOT NULL
  AND u."deletedAt" IS NULL
GROUP BY u."socialId"
HAVING COUNT(*) > 1;

\echo ''
\echo '=== Cleanup Complete ==='

-- Report the take-ownership marker state of custodial AT Protocol identities.
-- Read only. This script runs SELECT statements and nothing else.
--
-- Why this exists:
-- When a custodial user resets their PDS password, the API has to end custody
-- and clear the stored credential in the same request. If it does not, the API
-- keeps an old password that no longer works, and that user's events stop
-- publishing. The takeOwnershipStatus column records how far a reset got:
--
--   pending    a reset was prepared. This records intent only. It is not proof
--              that the PDS ever received the request.
--   ambiguous  the PDS gave no clear answer, such as a timeout or a 5xx. The
--              reset may have committed with the response lost, or it may never
--              have arrived.
--   confirmed  the PDS acknowledged the reset, but ending custody in the same
--              request failed. Custody still needs to be ended.
--   null       no reset has been seen through this path.
--
-- How to read the output:
-- A non-zero confirmed count means the automatic repair is not draining, and
-- that is a defect worth raising on its own.
--
-- A null count is not a count of broken accounts. The column was added after
-- the fix shipped, and only the new code path writes it, so every identity
-- that predates the fix reads null whether it is healthy or not. A healthy
-- custodial row and a stranded one look identical in this schema. The only
-- thing that tells them apart is whether the stored credential still works at
-- the PDS, and we do not record that. Do not read the null count as damage.
--
-- Usage:
--   psql -U <user> -d <database> -f scripts/atproto-custodial-marker-counts.sql
--
-- The script finds every tenant schema itself, so it does not need editing when
-- a tenant is added.
--
-- Note on privacy: pdsCredentials holds an encrypted password. It is only ever
-- tested for null here. Its value is never selected.

\echo ''
\echo '=== Custodial identities by take-ownership marker, per tenant ==='
\echo ''

SELECT string_agg(
         format(
           $q$SELECT %L::text AS tenant,
       count(*) FILTER (WHERE "isCustodial")                                        AS custodial_total,
       count(*) FILTER (WHERE "isCustodial" AND "takeOwnershipStatus" = 'pending')   AS marker_pending,
       count(*) FILTER (WHERE "isCustodial" AND "takeOwnershipStatus" = 'ambiguous') AS marker_ambiguous,
       count(*) FILTER (WHERE "isCustodial" AND "takeOwnershipStatus" = 'confirmed') AS marker_confirmed,
       count(*) FILTER (WHERE "isCustodial" AND "takeOwnershipStatus" IS NULL)       AS marker_null,
       count(*) FILTER (WHERE "isCustodial" AND "pdsCredentials" IS NOT NULL)        AS custodial_with_credential,
       count(*) FILTER (WHERE NOT "isCustodial")                                     AS non_custodial
  FROM %I."userAtprotoIdentities"$q$,
           nspname, nspname),
         E'\nUNION ALL\n' ORDER BY nspname)
       || E'\nORDER BY 1'
  FROM pg_namespace
 WHERE nspname LIKE 'tenant\_%'
   AND EXISTS (SELECT 1
                 FROM information_schema.tables t
                WHERE t.table_schema = nspname
                  AND t.table_name = 'userAtprotoIdentities')
\gexec

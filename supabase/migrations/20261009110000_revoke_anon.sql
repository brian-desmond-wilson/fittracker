-- 20261009110000_revoke_anon.sql  (OPTIONAL — defence in depth, see report §4)
-- The anon key is public, and today the anon role holds every table
-- privilege on all 121 public relations (Supabase's default grants). RLS is
-- what actually stops it: the per-user tables' policies compare to
-- auth.uid(), which is NULL for anon, so anon reads nothing there. But 35
-- reference tables carry USING (true) SELECT policies with no TO clause,
-- so anyone holding the public key can list the exercise catalog, muscle
-- regions, equipment, food categories, WOD formats and so on without
-- signing in.
--
-- Nothing in the app reads before sign-in (app/(auth)/sign-in.tsx and
-- app/index.tsx make no table calls), the edge functions use the anon key
-- only for auth.getUser() (GoTrue, not PostgREST), and the agent gateway
-- runs as service_role. So anon needs no table access at all. This revokes
-- it outright — simpler and stronger than editing 35 policies — and stops
-- future tables inheriting it.
--
-- Rollback if anything unexpected breaks:
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Future objects created by migrations (role postgres) stay closed to anon.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

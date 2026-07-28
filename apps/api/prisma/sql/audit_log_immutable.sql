-- Run once via `prisma migrate dev --create-only --name add_audit_log_immutability`
-- after the initial migration, then paste this body into the generated migration.sql.
-- docs/03-modele-donnees.md §14 — audit_log is append-only, enforced in the database, not just in application code.

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

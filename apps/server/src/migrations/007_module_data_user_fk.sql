-- Add missing foreign key on module_data.user_id so that ON DELETE CASCADE
-- cleans up synced module data when a user deletes their account.
-- Without this constraint the rows would be permanently orphaned.

-- Remove any existing orphaned rows first (user was deleted manually or
-- via a previous partial flow) so the ALTER TABLE does not fail.
DELETE FROM module_data
WHERE user_id NOT IN (SELECT id FROM "user");

ALTER TABLE module_data
  ADD CONSTRAINT module_data_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

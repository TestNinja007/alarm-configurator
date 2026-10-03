-- Alarms without a folder, and alarms that remove themselves.
--
-- Until now an alarm belonged to a user only through its folder: every query
-- reached the owner with JOIN folders ON folders.id = alarms.folder_id. That
-- made a folder compulsory, because an alarm without one would have had no
-- owner at all. The owner moves onto the alarm itself here, which is the thing
-- that makes "no folder yet" expressible.

ALTER TABLE alarms ADD COLUMN user_id uuid REFERENCES users (id) ON DELETE CASCADE;

UPDATE alarms a SET user_id = f.user_id FROM folders f WHERE f.id = a.folder_id;

ALTER TABLE alarms ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX alarms_user_id_idx ON alarms (user_id);

-- A folder is optional from here. Deleting a folder still takes its alarms
-- with it: that was the behaviour before and nothing here asks to change it.
ALTER TABLE alarms ALTER COLUMN folder_id DROP NOT NULL;

-- R-09 in two halves. Postgres treats NULLs as distinct, so the old index
-- would have allowed any number of unfiled alarms with the same name. Unfiled
-- alarms get the scope they behave like: one bucket, per user.
DROP INDEX alarms_folder_name_key;

CREATE UNIQUE INDEX alarms_folder_name_key
    ON alarms (folder_id, lower(btrim(name)))
    WHERE folder_id IS NOT NULL;

CREATE UNIQUE INDEX alarms_unfiled_name_key
    ON alarms (user_id, lower(btrim(name)))
    WHERE folder_id IS NULL;

-- For the alarm that exists for one specific moment. It is removed once it has
-- no occurrence left to fire, which for a one-off is just after it fires.
ALTER TABLE alarms ADD COLUMN self_destruct boolean NOT NULL DEFAULT false;

CREATE INDEX alarms_self_destruct_idx ON alarms (user_id) WHERE self_destruct = true;

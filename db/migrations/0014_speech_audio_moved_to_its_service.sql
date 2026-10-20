-- Generated speech moved to its own service, which keeps its own copy of this
-- table in its own schema (src/speech/migrations). This database no longer
-- holds speech data at all.
--
-- Dropped rather than copied across, deliberately: every row is a cache entry
-- that regenerates on demand from the words that produced it. Nothing here is
-- the only copy of anything, so moving it would be moving rubbish.
--
-- IF EXISTS so a database created after the extraction - which never had the
-- table - migrates cleanly too.

DROP TABLE IF EXISTS speech_audio;

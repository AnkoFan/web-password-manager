DROP TABLE IF EXISTS demo_fields;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (2, 'remove_prototype_data', CAST(unixepoch('subsec') * 1000 AS INTEGER));

PRAGMA user_version = 2;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL CHECK (version > 0),
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
);

CREATE TABLE vault_meta (
  id BLOB PRIMARY KEY NOT NULL CHECK (length(id) = 16),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  data_model_version INTEGER NOT NULL CHECK (data_model_version > 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
);

CREATE TABLE deletion_groups (
  id BLOB PRIMARY KEY NOT NULL CHECK (length(id) = 16),
  root_entity_type TEXT NOT NULL
    CHECK (root_entity_type IN ('category', 'website', 'account')),
  root_entity_id BLOB NOT NULL CHECK (length(root_entity_id) = 16),
  deleted_at INTEGER NOT NULL CHECK (deleted_at >= 0)
);

CREATE TABLE categories (
  id BLOB PRIMARY KEY NOT NULL CHECK (length(id) = 16),
  vault_id BLOB NOT NULL CHECK (length(vault_id) = 16),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  name_key TEXT NOT NULL CHECK (length(name_key) > 0),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  deleted_at INTEGER CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  deletion_group_id BLOB,
  UNIQUE (id, vault_id),
  FOREIGN KEY (vault_id) REFERENCES vault_meta(id) ON DELETE RESTRICT,
  FOREIGN KEY (deletion_group_id) REFERENCES deletion_groups(id) ON DELETE RESTRICT,
  CHECK (
    (deleted_at IS NULL AND deletion_group_id IS NULL)
    OR (deleted_at IS NOT NULL AND deletion_group_id IS NOT NULL)
  )
);

CREATE TABLE websites (
  id BLOB PRIMARY KEY NOT NULL CHECK (length(id) = 16),
  vault_id BLOB NOT NULL CHECK (length(vault_id) = 16),
  category_id BLOB NOT NULL CHECK (length(category_id) = 16),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  name_key TEXT NOT NULL CHECK (length(name_key) > 0),
  primary_url TEXT,
  icon_ref TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  deleted_at INTEGER CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  deletion_group_id BLOB,
  UNIQUE (id, vault_id),
  FOREIGN KEY (category_id, vault_id)
    REFERENCES categories(id, vault_id) ON DELETE RESTRICT,
  FOREIGN KEY (deletion_group_id) REFERENCES deletion_groups(id) ON DELETE RESTRICT,
  CHECK (
    (deleted_at IS NULL AND deletion_group_id IS NULL)
    OR (deleted_at IS NOT NULL AND deletion_group_id IS NOT NULL)
  )
);

CREATE TABLE accounts (
  id BLOB PRIMARY KEY NOT NULL CHECK (length(id) = 16),
  vault_id BLOB NOT NULL CHECK (length(vault_id) = 16),
  website_id BLOB NOT NULL CHECK (length(website_id) = 16),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  display_name_key TEXT NOT NULL CHECK (length(display_name_key) > 0),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  deleted_at INTEGER CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  deletion_group_id BLOB,
  UNIQUE (id, vault_id),
  FOREIGN KEY (website_id, vault_id)
    REFERENCES websites(id, vault_id) ON DELETE RESTRICT,
  FOREIGN KEY (deletion_group_id) REFERENCES deletion_groups(id) ON DELETE RESTRICT,
  CHECK (
    (deleted_at IS NULL AND deletion_group_id IS NULL)
    OR (deleted_at IS NOT NULL AND deletion_group_id IS NOT NULL)
  )
);

CREATE TABLE account_fields (
  id BLOB PRIMARY KEY NOT NULL CHECK (length(id) = 16),
  account_id BLOB NOT NULL CHECK (length(account_id) = 16),
  system_role TEXT
    CHECK (system_role IS NULL OR system_role IN ('username', 'password', 'email', 'note')),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  label_key TEXT NOT NULL CHECK (length(label_key) > 0),
  field_type TEXT NOT NULL
    CHECK (field_type IN ('text', 'password', 'email', 'url', 'multiline')),
  value TEXT NOT NULL,
  is_sensitive INTEGER NOT NULL CHECK (is_sensitive IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK (
    (system_role = 'password' OR field_type = 'password')
      IS NOT TRUE
    OR is_sensitive = 1
  )
);

CREATE UNIQUE INDEX ux_categories_active_name
  ON categories(vault_id, name_key)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_accounts_active_name
  ON accounts(website_id, display_name_key)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_account_fields_label
  ON account_fields(account_id, label_key);

CREATE UNIQUE INDEX ux_account_fields_system_role
  ON account_fields(account_id, system_role)
  WHERE system_role IS NOT NULL;

CREATE INDEX ix_categories_list
  ON categories(vault_id, deleted_at, sort_order);

CREATE INDEX ix_websites_list
  ON websites(category_id, deleted_at, sort_order);

CREATE INDEX ix_websites_name
  ON websites(name_key);

CREATE INDEX ix_accounts_list
  ON accounts(website_id, deleted_at, sort_order);

CREATE INDEX ix_accounts_name
  ON accounts(display_name_key);

CREATE INDEX ix_account_fields_list
  ON account_fields(account_id, sort_order);

CREATE INDEX ix_account_fields_role
  ON account_fields(system_role);

CREATE INDEX ix_deletion_groups_time
  ON deletion_groups(deleted_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (1, 'phase2_core', 0);

PRAGMA user_version = 1;

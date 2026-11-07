# Live public schema catalog — metadata-only export

**Captured:** 7 November 2026  
**Source:** read-only PostgreSQL catalog and information_schema queries against the linked REFLINK Supabase project.  
**Scope:** public table columns, owners, RLS flags, policy expressions, constraints, indexes, triggers, views and table grants.  
**Data exclusion:** no application table rows, patient records, auth-user records, secrets or storage object contents were selected.

> **Not a migration or a database restore artifact. Do not execute this document.** It is a metadata snapshot for historical baseline reconciliation. It does not include table data, extension-owned objects, every schema outside public, all grants outside table-level grants, or complete DDL for every dependency. Compare it with a schema-only dump and the recorded migration history before constructing a baseline.

## Tables (162 records)


```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "bigint",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "a",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "actor_user_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "action",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "table_name",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "record_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "old_data",
  "data_type": "jsonb",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "new_data",
  "data_type": "jsonb",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "client_ip",
  "data_type": "inet",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 9,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "referral_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "receiving_user_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "final_diagnosis",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "treatment_provided",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "outcome",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "follow_up_instructions",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "referred_further_to",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 9,
  "column_name": "additional_notes",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 10,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "diagnosis_categories",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "diagnosis_categories",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "name",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "diagnosis_categories",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "is_active",
  "data_type": "boolean",
  "nullable": false,
  "default_expression": "true",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "diagnosis_categories",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "name",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "facility_type",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "address",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "state",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "lga",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "phone",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "email",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 9,
  "column_name": "is_active",
  "data_type": "boolean",
  "nullable": true,
  "default_expression": "true",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 10,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 11,
  "column_name": "referral_notification_phone",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "referral_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "provided_by",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "clinical_feedback",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "outcome",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "follow_up_required",
  "data_type": "boolean",
  "nullable": false,
  "default_expression": "false",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "follow_up_notes",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "full_name",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "phone",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "role",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "facility_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "updated_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "must_change_password",
  "data_type": "boolean",
  "nullable": false,
  "default_expression": "false",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": "When true, the user is required to replace the temporary password after sign-in."
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "user_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "facility_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "draft_data",
  "data_type": "jsonb",
  "nullable": false,
  "default_expression": "'{}'::jsonb",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "updated_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "referral_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "event_type",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "event_description",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "performed_by",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "referral_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "receiving_facility_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "diagnosis",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "investigations_done",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "treatment_provided",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "outcome",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "follow_up_required",
  "data_type": "boolean",
  "nullable": true,
  "default_expression": "false",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 9,
  "column_name": "feedback_notes",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 10,
  "column_name": "submitted_by",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 11,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "referral_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "notification_type",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "channel",
  "data_type": "text",
  "nullable": false,
  "default_expression": "'sms'::text",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "recipient_phone",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "provider",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "provider_message_id",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "status",
  "data_type": "text",
  "nullable": false,
  "default_expression": "'queued'::text",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 9,
  "column_name": "error_message",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 10,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 11,
  "column_name": "sent_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "bigint",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "a",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "referral_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "printed_by",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "copy_label",
  "data_type": "text",
  "nullable": false,
  "default_expression": "'REFERRAL COPY'::text",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "print_number",
  "data_type": "integer",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "referral_id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "updated_by",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "status",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "notes",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "referral_number",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "patient_identifier",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "patient_age_months",
  "data_type": "integer",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "patient_sex",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "chief_complaint",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "clinical_summary",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "physical_findings",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 9,
  "column_name": "provisional_diagnosis",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 10,
  "column_name": "investigations",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 11,
  "column_name": "treatment_given",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 12,
  "column_name": "referral_reason",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 13,
  "column_name": "urgency",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 14,
  "column_name": "referring_facility_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 15,
  "column_name": "receiving_facility_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 16,
  "column_name": "referring_user_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 17,
  "column_name": "status",
  "data_type": "text",
  "nullable": false,
  "default_expression": "'sent'::text",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 18,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 19,
  "column_name": "acknowledged_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 20,
  "column_name": "patient_arrived_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 21,
  "column_name": "completed_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 22,
  "column_name": "assessment_findings",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 23,
  "column_name": "final_diagnosis",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 24,
  "column_name": "treatment_provided",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 25,
  "column_name": "procedures_performed",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 26,
  "column_name": "clinical_feedback",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 27,
  "column_name": "disposition",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 28,
  "column_name": "assessment_completed_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 29,
  "column_name": "discharged_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 30,
  "column_name": "admission_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 31,
  "column_name": "ward_unit",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 32,
  "column_name": "admission_diagnosis",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 33,
  "column_name": "clinical_progress",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 34,
  "column_name": "inpatient_treatment",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 35,
  "column_name": "discharge_diagnosis",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 36,
  "column_name": "condition_at_discharge",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 37,
  "column_name": "discharge_medications",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 38,
  "column_name": "follow_up_plan",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 39,
  "column_name": "patient_phone",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 40,
  "column_name": "patient_address",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 41,
  "column_name": "relative_name",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 42,
  "column_name": "relative_relationship",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 43,
  "column_name": "relative_phone",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 44,
  "column_name": "diagnosis_status",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 45,
  "column_name": "diagnosis_records",
  "data_type": "jsonb",
  "nullable": false,
  "default_expression": "'[]'::jsonb",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": "JSON array of diagnosis objects: [{status, category, diagnosis}]"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 46,
  "column_name": "investigation_categories",
  "data_type": "jsonb",
  "nullable": false,
  "default_expression": "'[]'::jsonb",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": "JSON array of selected investigation category names"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 47,
  "column_name": "investigation_records",
  "data_type": "jsonb",
  "nullable": false,
  "default_expression": "'[]'::jsonb",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": "JSON array of investigation objects: [{category, investigation}]"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 48,
  "column_name": "diagnosis_category",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 49,
  "column_name": "investigation_category",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 50,
  "column_name": "is_test",
  "data_type": "boolean",
  "nullable": false,
  "default_expression": "false",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 51,
  "column_name": "offline_client_id",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 52,
  "column_name": "sync_source",
  "data_type": "text",
  "nullable": true,
  "default_expression": "'online'::text",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 53,
  "column_name": "ack_due_at",
  "data_type": "timestamp with time zone",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 54,
  "column_name": "chief_complaint_category",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 55,
  "column_name": "chief_complaint_other",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 56,
  "column_name": "physical_findings_structured",
  "data_type": "jsonb",
  "nullable": true,
  "default_expression": "'[]'::jsonb",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 57,
  "column_name": "treatment_given_structured",
  "data_type": "jsonb",
  "nullable": true,
  "default_expression": "'[]'::jsonb",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 58,
  "column_name": "diagnosis_category_other",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 1,
  "column_name": "id",
  "data_type": "uuid",
  "nullable": false,
  "default_expression": "gen_random_uuid()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 2,
  "column_name": "full_name",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 3,
  "column_name": "email",
  "data_type": "text",
  "nullable": false,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 4,
  "column_name": "phone",
  "data_type": "text",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 5,
  "column_name": "role",
  "data_type": "text",
  "nullable": false,
  "default_expression": "'referrer'::text",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 6,
  "column_name": "facility_id",
  "data_type": "uuid",
  "nullable": true,
  "default_expression": null,
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 7,
  "column_name": "status",
  "data_type": "text",
  "nullable": false,
  "default_expression": "'active'::text",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "owner_name": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "ordinal_position": 8,
  "column_name": "created_at",
  "data_type": "timestamp with time zone",
  "nullable": false,
  "default_expression": "now()",
  "identity_generation": "",
  "generated_kind": "",
  "column_comment": null
}
```

## Policies (30 records)


```json
{
  "schemaname": "public",
  "tablename": "audit_log",
  "policyname": "Administrators can view audit log",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "is_administrator()",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "counter_referrals",
  "policyname": "Participants can view counter referrals",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(is_administrator() OR (EXISTS ( SELECT 1\n   FROM referrals r\n  WHERE ((r.id = counter_referrals.referral_id) AND ((r.referring_user_id = auth.uid()) OR (r.receiving_facility_id = ( SELECT p.facility_id\n           FROM profiles p\n          WHERE (p.id = auth.uid()))))))))",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "counter_referrals",
  "policyname": "Receiving staff can create counter referrals",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "((receiving_user_id = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN referrals r ON ((r.id = counter_referrals.referral_id)))\n  WHERE ((p.id = auth.uid()) AND (p.role = 'receiving_staff'::text) AND (p.facility_id = r.receiving_facility_id)))))"
}
```

```json
{
  "schemaname": "public",
  "tablename": "diagnosis_categories",
  "policyname": "Authenticated users can view diagnosis categories",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(is_active = true)",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "facilities",
  "policyname": "Administrators can add facilities",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "(EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'administrator'::text))))"
}
```

```json
{
  "schemaname": "public",
  "tablename": "facilities",
  "policyname": "Administrators can delete facilities",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "DELETE",
  "qual": "(EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'administrator'::text))))",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "facilities",
  "policyname": "Administrators can update facilities",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "(EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'administrator'::text))))",
  "with_check": "(EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'administrator'::text))))"
}
```

```json
{
  "schemaname": "public",
  "tablename": "facilities",
  "policyname": "Authenticated users can view facilities",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "true",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "feedback",
  "policyname": "Users can submit referral feedback",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "((provided_by = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM referrals r\n  WHERE ((r.id = feedback.referral_id) AND ((r.referring_user_id = auth.uid()) OR (r.receiving_facility_id = ( SELECT p.facility_id\n           FROM profiles p\n          WHERE (p.id = auth.uid()))))))))"
}
```

```json
{
  "schemaname": "public",
  "tablename": "feedback",
  "policyname": "Users can view referral feedback",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(EXISTS ( SELECT 1\n   FROM referrals r\n  WHERE ((r.id = feedback.referral_id) AND ((r.referring_user_id = auth.uid()) OR (r.receiving_facility_id = ( SELECT p.facility_id\n           FROM profiles p\n          WHERE (p.id = auth.uid())))))))",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "profiles",
  "policyname": "Administrators can create profiles",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "is_administrator()"
}
```

```json
{
  "schemaname": "public",
  "tablename": "profiles",
  "policyname": "Administrators can update profiles",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "is_administrator()",
  "with_check": "is_administrator()"
}
```

```json
{
  "schemaname": "public",
  "tablename": "profiles",
  "policyname": "Administrators can view all profiles",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(is_administrator() OR (id = auth.uid()))",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "profiles",
  "policyname": "Users can clear own password change flag",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "(id = auth.uid())",
  "with_check": "(id = auth.uid())"
}
```

```json
{
  "schemaname": "public",
  "tablename": "profiles",
  "policyname": "Users can view their own profile",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(id = auth.uid())",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_drafts",
  "policyname": "Users can create their own referral drafts",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "(( SELECT auth.uid() AS uid) = user_id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_drafts",
  "policyname": "Users can delete their own referral drafts",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "DELETE",
  "qual": "(( SELECT auth.uid() AS uid) = user_id)",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_drafts",
  "policyname": "Users can update their own referral drafts",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "(( SELECT auth.uid() AS uid) = user_id)",
  "with_check": "(( SELECT auth.uid() AS uid) = user_id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_drafts",
  "policyname": "Users can view their own referral drafts",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(( SELECT auth.uid() AS uid) = user_id)",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_notifications",
  "policyname": "Admins can view notification log",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "is_administrator()",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_notifications",
  "policyname": "Referral participants can view notification log",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(EXISTS ( SELECT 1\n   FROM referrals r\n  WHERE ((r.id = referral_notifications.referral_id) AND ((r.referring_user_id = auth.uid()) OR (r.receiving_facility_id = ( SELECT p.facility_id\n           FROM profiles p\n          WHERE (p.id = auth.uid())))))))",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_print_events",
  "policyname": "Participants can view print history",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(is_administrator() OR (EXISTS ( SELECT 1\n   FROM referrals r\n  WHERE ((r.id = referral_print_events.referral_id) AND ((r.referring_user_id = auth.uid()) OR (r.receiving_facility_id = ( SELECT p.facility_id\n           FROM profiles p\n          WHERE (p.id = auth.uid()))))))))",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_updates",
  "policyname": "Users can view referral updates",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(EXISTS ( SELECT 1\n   FROM referrals r\n  WHERE ((r.id = referral_updates.referral_id) AND ((r.referring_user_id = auth.uid()) OR (r.receiving_facility_id = ( SELECT p.facility_id\n           FROM profiles p\n          WHERE (p.id = auth.uid())))))))",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referrals",
  "policyname": "PHC staff can create referrals",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "((referring_user_id = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND (p.facility_id = referrals.referring_facility_id) AND (p.role = 'phc_staff'::text)))))"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referrals",
  "policyname": "PHC staff can view their referrals",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(referring_user_id = auth.uid())",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referrals",
  "policyname": "Receiving facilities can view assigned referrals",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(receiving_facility_id = ( SELECT profiles.facility_id\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))",
  "with_check": null
}
```

```json
{
  "schemaname": "public",
  "tablename": "referrals",
  "policyname": "Receiving staff can update assigned referrals",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "(receiving_facility_id = ( SELECT profiles.facility_id\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'receiving_staff'::text))))",
  "with_check": "(receiving_facility_id = ( SELECT profiles.facility_id\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'receiving_staff'::text))))"
}
```

```json
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Administrators can insert users",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "is_administrator()"
}
```

```json
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Administrators can update users",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "is_administrator()",
  "with_check": "is_administrator()"
}
```

```json
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Administrators can view users",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "is_administrator()",
  "with_check": null
}
```

## Constraints (52 records)


```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "conname": "audit_log_action_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (action = ANY (ARRAY['CREATE'::text, 'READ'::text, 'UPDATE'::text, 'DELETE'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "conname": "audit_log_actor_user_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (actor_user_id) REFERENCES auth.users(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "audit_log",
  "conname": "audit_log_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "conname": "counter_referrals_outcome_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (outcome = ANY (ARRAY['recovered'::text, 'improved'::text, 'referred_further'::text, 'died'::text, 'other'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "conname": "counter_referrals_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "conname": "counter_referrals_receiving_user_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (receiving_user_id) REFERENCES auth.users(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "conname": "counter_referrals_referral_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "counter_referrals",
  "conname": "counter_referrals_referral_id_key",
  "constraint_type": "UNIQUE",
  "definition": "UNIQUE (referral_id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "diagnosis_categories",
  "conname": "diagnosis_categories_name_key",
  "constraint_type": "UNIQUE",
  "definition": "UNIQUE (name)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "diagnosis_categories",
  "conname": "diagnosis_categories_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "facilities",
  "conname": "facilities_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "conname": "feedback_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "conname": "feedback_provided_by_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (provided_by) REFERENCES profiles(id) ON DELETE SET NULL"
}
```

```json
{
  "schema_name": "public",
  "table_name": "feedback",
  "conname": "feedback_referral_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "conname": "profiles_facility_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "conname": "profiles_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "conname": "profiles_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "profiles",
  "conname": "profiles_role_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (role = ANY (ARRAY['phc_staff'::text, 'receiving_staff'::text, 'administrator'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "conname": "referral_drafts_facility_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "conname": "referral_drafts_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_drafts",
  "conname": "referral_drafts_user_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "conname": "referral_events_performed_by_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (performed_by) REFERENCES profiles(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "conname": "referral_events_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_events",
  "conname": "referral_events_referral_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "conname": "referral_feedback_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "conname": "referral_feedback_receiving_facility_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (receiving_facility_id) REFERENCES facilities(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "conname": "referral_feedback_referral_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_feedback",
  "conname": "referral_feedback_submitted_by_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (submitted_by) REFERENCES profiles(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "conname": "referral_notifications_channel_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (channel = ANY (ARRAY['sms'::text, 'dashboard'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "conname": "referral_notifications_notification_type_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (notification_type = ANY (ARRAY['referral_sent'::text, 'referral_acknowledged'::text, 'sla_escalation'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "conname": "referral_notifications_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "conname": "referral_notifications_referral_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_notifications",
  "conname": "referral_notifications_status_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'skipped'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "conname": "referral_print_events_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "conname": "referral_print_events_printed_by_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (printed_by) REFERENCES auth.users(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_print_events",
  "conname": "referral_print_events_referral_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "conname": "referral_updates_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "conname": "referral_updates_referral_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referral_updates",
  "conname": "referral_updates_updated_by_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_diagnosis_status_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (diagnosis_status IS NULL OR (diagnosis_status = ANY (ARRAY['suspected'::text, 'provisional'::text, 'confirmed'::text])))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_disposition_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (disposition IS NULL OR (disposition = ANY (ARRAY['admitted'::text, 'discharged'::text, 'referred_again'::text, 'observation'::text])))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_patient_sex_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (patient_sex = ANY (ARRAY['male'::text, 'female'::text, 'other'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_receiving_facility_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (receiving_facility_id) REFERENCES facilities(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_referral_number_key",
  "constraint_type": "UNIQUE",
  "definition": "UNIQUE (referral_number)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_referring_facility_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referring_facility_id) REFERENCES facilities(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_referring_user_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (referring_user_id) REFERENCES profiles(id)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_status_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'acknowledged'::text, 'patient_arrived'::text, 'under_assessment'::text, 'admitted'::text, 'discharged'::text, 'referred_again'::text, 'completed'::text, 'cancelled'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "referrals",
  "conname": "referrals_urgency_check",
  "constraint_type": "CHECK",
  "definition": "CHECK (urgency = ANY (ARRAY['routine'::text, 'urgent'::text, 'emergency'::text]))"
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "conname": "users_email_key",
  "constraint_type": "UNIQUE",
  "definition": "UNIQUE (email)"
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "conname": "users_facility_id_fkey",
  "constraint_type": "FOREIGN KEY",
  "definition": "FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL"
}
```

```json
{
  "schema_name": "public",
  "table_name": "users",
  "conname": "users_pkey",
  "constraint_type": "PRIMARY KEY",
  "definition": "PRIMARY KEY (id)"
}
```

## Indexes (28 records)


```json
{
  "schemaname": "public",
  "tablename": "audit_log",
  "indexname": "audit_log_actor_idx",
  "indexdef": "CREATE INDEX audit_log_actor_idx ON public.audit_log USING btree (actor_user_id, created_at DESC)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "audit_log",
  "indexname": "audit_log_pkey",
  "indexdef": "CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "audit_log",
  "indexname": "audit_log_record_idx",
  "indexdef": "CREATE INDEX audit_log_record_idx ON public.audit_log USING btree (table_name, record_id, created_at DESC)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "counter_referrals",
  "indexname": "counter_referrals_pkey",
  "indexdef": "CREATE UNIQUE INDEX counter_referrals_pkey ON public.counter_referrals USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "counter_referrals",
  "indexname": "counter_referrals_referral_id_key",
  "indexdef": "CREATE UNIQUE INDEX counter_referrals_referral_id_key ON public.counter_referrals USING btree (referral_id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "counter_referrals",
  "indexname": "counter_referrals_referral_idx",
  "indexdef": "CREATE INDEX counter_referrals_referral_idx ON public.counter_referrals USING btree (referral_id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "diagnosis_categories",
  "indexname": "diagnosis_categories_name_key",
  "indexdef": "CREATE UNIQUE INDEX diagnosis_categories_name_key ON public.diagnosis_categories USING btree (name)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "diagnosis_categories",
  "indexname": "diagnosis_categories_pkey",
  "indexdef": "CREATE UNIQUE INDEX diagnosis_categories_pkey ON public.diagnosis_categories USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "facilities",
  "indexname": "facilities_pkey",
  "indexdef": "CREATE UNIQUE INDEX facilities_pkey ON public.facilities USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "feedback",
  "indexname": "feedback_pkey",
  "indexdef": "CREATE UNIQUE INDEX feedback_pkey ON public.feedback USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "profiles",
  "indexname": "profiles_pkey",
  "indexdef": "CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_drafts",
  "indexname": "referral_drafts_facility_id_idx",
  "indexdef": "CREATE INDEX referral_drafts_facility_id_idx ON public.referral_drafts USING btree (facility_id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_drafts",
  "indexname": "referral_drafts_pkey",
  "indexdef": "CREATE UNIQUE INDEX referral_drafts_pkey ON public.referral_drafts USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_drafts",
  "indexname": "referral_drafts_updated_at_idx",
  "indexdef": "CREATE INDEX referral_drafts_updated_at_idx ON public.referral_drafts USING btree (updated_at DESC)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_drafts",
  "indexname": "referral_drafts_user_id_idx",
  "indexdef": "CREATE INDEX referral_drafts_user_id_idx ON public.referral_drafts USING btree (user_id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_events",
  "indexname": "referral_events_pkey",
  "indexdef": "CREATE UNIQUE INDEX referral_events_pkey ON public.referral_events USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_feedback",
  "indexname": "referral_feedback_pkey",
  "indexdef": "CREATE UNIQUE INDEX referral_feedback_pkey ON public.referral_feedback USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_notifications",
  "indexname": "referral_notifications_pkey",
  "indexdef": "CREATE UNIQUE INDEX referral_notifications_pkey ON public.referral_notifications USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_notifications",
  "indexname": "referral_notifications_referral_idx",
  "indexdef": "CREATE INDEX referral_notifications_referral_idx ON public.referral_notifications USING btree (referral_id, created_at DESC)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_print_events",
  "indexname": "referral_print_events_pkey",
  "indexdef": "CREATE UNIQUE INDEX referral_print_events_pkey ON public.referral_print_events USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_print_events",
  "indexname": "referral_print_events_referral_idx",
  "indexdef": "CREATE INDEX referral_print_events_referral_idx ON public.referral_print_events USING btree (referral_id, created_at DESC)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referral_updates",
  "indexname": "referral_updates_pkey",
  "indexdef": "CREATE UNIQUE INDEX referral_updates_pkey ON public.referral_updates USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referrals",
  "indexname": "referrals_ack_due_at_idx",
  "indexdef": "CREATE INDEX referrals_ack_due_at_idx ON public.referrals USING btree (ack_due_at) WHERE (status = 'sent'::text)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referrals",
  "indexname": "referrals_offline_client_id_uidx",
  "indexdef": "CREATE UNIQUE INDEX referrals_offline_client_id_uidx ON public.referrals USING btree (offline_client_id) WHERE (offline_client_id IS NOT NULL)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referrals",
  "indexname": "referrals_pkey",
  "indexdef": "CREATE UNIQUE INDEX referrals_pkey ON public.referrals USING btree (id)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "referrals",
  "indexname": "referrals_referral_number_key",
  "indexdef": "CREATE UNIQUE INDEX referrals_referral_number_key ON public.referrals USING btree (referral_number)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "users",
  "indexname": "users_email_key",
  "indexdef": "CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)"
}
```

```json
{
  "schemaname": "public",
  "tablename": "users",
  "indexname": "users_pkey",
  "indexdef": "CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)"
}
```

## Triggers (9 records)


```json
{
  "table_schema": "public",
  "table_name": "counter_referrals",
  "trigger_name": "counter_referrals_audit_mutation",
  "definition": "CREATE TRIGGER counter_referrals_audit_mutation AFTER INSERT OR DELETE OR UPDATE ON counter_referrals FOR EACH ROW EXECUTE FUNCTION audit_referral_mutation()",
  "function_signature": "audit_referral_mutation()"
}
```

```json
{
  "table_schema": "public",
  "table_name": "profiles",
  "trigger_name": "guard_profile_security_fields",
  "definition": "CREATE TRIGGER guard_profile_security_fields BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_security_fields()",
  "function_signature": "guard_profile_security_fields()"
}
```

```json
{
  "table_schema": "public",
  "table_name": "referral_drafts",
  "trigger_name": "referral_draft_updated_at",
  "definition": "CREATE TRIGGER referral_draft_updated_at BEFORE UPDATE ON referral_drafts FOR EACH ROW EXECUTE FUNCTION update_referral_draft_timestamp()",
  "function_signature": "update_referral_draft_timestamp()"
}
```

```json
{
  "table_schema": "public",
  "table_name": "referrals",
  "trigger_name": "referral_ack_due_at_trigger",
  "definition": "CREATE TRIGGER referral_ack_due_at_trigger BEFORE INSERT OR UPDATE OF urgency, created_at ON referrals FOR EACH ROW EXECUTE FUNCTION set_referral_ack_due_at()",
  "function_signature": "set_referral_ack_due_at()"
}
```

```json
{
  "table_schema": "public",
  "table_name": "referrals",
  "trigger_name": "referral_counter_referral_guard",
  "definition": "CREATE TRIGGER referral_counter_referral_guard BEFORE UPDATE OF status ON referrals FOR EACH ROW EXECUTE FUNCTION require_counter_referral_before_completion()",
  "function_signature": "require_counter_referral_before_completion()"
}
```

```json
{
  "table_schema": "public",
  "table_name": "referrals",
  "trigger_name": "referral_entry_validation_trigger",
  "definition": "CREATE TRIGGER referral_entry_validation_trigger BEFORE INSERT OR UPDATE ON referrals FOR EACH ROW EXECUTE FUNCTION validate_referral_entry()",
  "function_signature": "validate_referral_entry()"
}
```

```json
{
  "table_schema": "public",
  "table_name": "referrals",
  "trigger_name": "referral_status_audit_trigger",
  "definition": "CREATE TRIGGER referral_status_audit_trigger AFTER UPDATE OF status ON referrals FOR EACH ROW EXECUTE FUNCTION log_referral_status_change()",
  "function_signature": "log_referral_status_change()"
}
```

```json
{
  "table_schema": "public",
  "table_name": "referrals",
  "trigger_name": "referral_status_transition_validation",
  "definition": "CREATE TRIGGER referral_status_transition_validation BEFORE UPDATE OF status ON referrals FOR EACH ROW EXECUTE FUNCTION validate_referral_status_transition()",
  "function_signature": "validate_referral_status_transition()"
}
```

```json
{
  "table_schema": "public",
  "table_name": "referrals",
  "trigger_name": "referrals_audit_mutation",
  "definition": "CREATE TRIGGER referrals_audit_mutation AFTER INSERT OR DELETE OR UPDATE ON referrals FOR EACH ROW EXECUTE FUNCTION audit_referral_mutation()",
  "function_signature": "audit_referral_mutation()"
}
```

## Views (2 records)


```json
{
  "view_name": "referral_analytics",
  "owner_name": "postgres",
  "reloptions": null,
  "definition": " SELECT id,\n    referral_number,\n    patient_identifier,\n    status,\n    urgency,\n    referring_facility_id,\n    receiving_facility_id,\n    provisional_diagnosis,\n    final_diagnosis,\n    diagnosis_category,\n    diagnosis_status,\n    created_at,\n    acknowledged_at,\n    patient_arrived_at,\n    assessment_completed_at,\n    admission_at,\n    discharged_at,\n    completed_at,\n        CASE\n            WHEN acknowledged_at IS NOT NULL THEN EXTRACT(epoch FROM acknowledged_at - created_at) / 3600::numeric\n            ELSE NULL::numeric\n        END AS hours_to_acknowledge,\n        CASE\n            WHEN acknowledged_at IS NOT NULL AND patient_arrived_at IS NOT NULL THEN EXTRACT(epoch FROM patient_arrived_at - acknowledged_at) / 3600::numeric\n            ELSE NULL::numeric\n        END AS hours_to_patient_arrival,\n        CASE\n            WHEN patient_arrived_at IS NOT NULL AND assessment_completed_at IS NOT NULL THEN EXTRACT(epoch FROM assessment_completed_at - patient_arrived_at) / 3600::numeric\n            ELSE NULL::numeric\n        END AS hours_to_assessment,\n        CASE\n            WHEN COALESCE(completed_at, discharged_at) IS NOT NULL THEN EXTRACT(epoch FROM COALESCE(completed_at, discharged_at) - created_at) / 3600::numeric\n            ELSE NULL::numeric\n        END AS total_episode_hours\n   FROM referrals r\n  WHERE COALESCE(is_test, false) = false;",
  "anon_select": false,
  "authenticated_select": false,
  "service_role_select": true
}
```

```json
{
  "view_name": "referral_analytics_summary",
  "owner_name": "postgres",
  "reloptions": null,
  "definition": " SELECT count(*) AS total_referrals,\n    count(*) FILTER (WHERE status = ANY (ARRAY['sent'::text, 'acknowledged'::text, 'patient_arrived'::text, 'under_assessment'::text])) AS active_referrals,\n    count(*) FILTER (WHERE status = 'admitted'::text) AS admitted_referrals,\n    count(*) FILTER (WHERE status = 'discharged'::text) AS discharged_referrals,\n    count(*) FILTER (WHERE status = 'completed'::text) AS completed_referrals,\n    count(*) FILTER (WHERE status = 'referred_again'::text) AS referred_again,\n    count(*) FILTER (WHERE status = 'cancelled'::text) AS cancelled_referrals,\n    count(*) FILTER (WHERE diagnosis_category IS NOT NULL AND TRIM(BOTH FROM diagnosis_category) <> ''::text) AS classified_referrals,\n    count(*) FILTER (WHERE diagnosis_category IS NULL OR TRIM(BOTH FROM diagnosis_category) = ''::text) AS unclassified_referrals,\n    round(count(*) FILTER (WHERE diagnosis_category IS NOT NULL AND TRIM(BOTH FROM diagnosis_category) <> ''::text)::numeric * 100.0 / NULLIF(count(*), 0)::numeric, 1) AS diagnosis_classification_percentage,\n    count(*) FILTER (WHERE hours_to_acknowledge IS NOT NULL) AS acknowledgement_cases,\n    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (hours_to_acknowledge::double precision))::numeric, 2) AS median_hours_to_acknowledge,\n    count(*) FILTER (WHERE hours_to_patient_arrival IS NOT NULL) AS patient_arrival_cases,\n    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (hours_to_patient_arrival::double precision))::numeric, 2) AS median_hours_to_patient_arrival,\n    count(*) FILTER (WHERE hours_to_assessment IS NOT NULL) AS assessment_cases,\n    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (hours_to_assessment::double precision))::numeric, 2) AS median_hours_to_assessment,\n    count(*) FILTER (WHERE total_episode_hours IS NOT NULL) AS completed_episode_cases,\n    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (total_episode_hours::double precision))::numeric, 2) AS median_total_episode_hours\n   FROM referral_analytics;",
  "anon_select": false,
  "authenticated_select": false,
  "service_role_select": true
}
```

## Grants (305 records)


```json
{
  "table_name": "audit_log",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "audit_log",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "counter_referrals",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "diagnosis_categories",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "facilities",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "feedback",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "profiles",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_analytics_summary",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_drafts",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_events",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_feedback",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_notifications",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_print_events",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referral_updates",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "referrals",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "authenticated",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "authenticated",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "authenticated",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "authenticated",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "authenticated",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "authenticated",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "authenticated",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "postgres",
  "privilege_type": "DELETE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "users",
  "grantee": "postgres",
  "privilege_type": "INSERT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "users",
  "grantee": "postgres",
  "privilege_type": "REFERENCES",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "users",
  "grantee": "postgres",
  "privilege_type": "SELECT",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "users",
  "grantee": "postgres",
  "privilege_type": "TRIGGER",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "users",
  "grantee": "postgres",
  "privilege_type": "TRUNCATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "users",
  "grantee": "postgres",
  "privilege_type": "UPDATE",
  "is_grantable": "YES"
}
```

```json
{
  "table_name": "users",
  "grantee": "service_role",
  "privilege_type": "DELETE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "service_role",
  "privilege_type": "INSERT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "service_role",
  "privilege_type": "REFERENCES",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "service_role",
  "privilege_type": "SELECT",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "service_role",
  "privilege_type": "TRIGGER",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "service_role",
  "privilege_type": "TRUNCATE",
  "is_grantable": "NO"
}
```

```json
{
  "table_name": "users",
  "grantee": "service_role",
  "privilege_type": "UPDATE",
  "is_grantable": "NO"
}
```


## Public sequences (2 records)

```json
{
  "schema": "public",
  "sequence": "audit_log_id_seq",
  "data_type": "bigint",
  "start": 1,
  "minimum": 1,
  "maximum": "9223372036854775807",
  "increment": 1,
  "cycle": false,
  "owner": "postgres",
  "owned_by": "public.audit_log.id"
}
```

```json
{
  "schema": "public",
  "sequence": "referral_print_events_id_seq",
  "data_type": "bigint",
  "start": 1,
  "minimum": 1,
  "maximum": "9223372036854775807",
  "increment": 1,
  "cycle": false,
  "owner": "postgres",
  "owned_by": "public.referral_print_events.id"
}
```

## Non-system schema inventory

The catalog contained these non-system schemas and object counts. These counts are for boundary identification only; Supabase-managed schemas are not part of the REFLINK public-schema baseline and must not be recreated or modified as part of an application baseline migration.

| Schema | Tables | Views | Sequences | Routines | User-defined enum/domain/range types |
|---|---:|---:|---:|---:|---:|
| auth | 27 | 0 | 1 | 4 | 9 |
| extensions | 0 | 2 | 0 | 55 | 0 |
| graphql | 0 | 0 | 0 | 0 | 0 |
| graphql_public | 0 | 0 | 0 | 1 | 0 |
| pgbouncer | 0 | 0 | 0 | 1 | 0 |
| public | 14 | 2 | 2 | 16 | 0 |
| realtime | 9 | 0 | 1 | 18 | 2 |
| storage | 10 | 0 | 0 | 24 | 1 |
| supabase_migrations | 1 | 0 | 0 | 0 | 0 |
| vault | 1 | 1 | 0 | 5 | 0 |

## Installed extensions

| Extension | Version | Schema | Owner |
|---|---:|---|---|
| pg_stat_statements | 1.11 | extensions | postgres |
| pgcrypto | 1.3 | extensions | postgres |
| plpgsql | 1.0 | pg_catalog | supabase_admin |
| supabase_vault | 0.3.1 | vault | supabase_admin |
| uuid-ossp | 1.1 | extensions | postgres |

The Supabase-managed `auth`, `storage`, `realtime`, `vault`, `extensions`, `graphql`, `graphql_public`, `pgbouncer` and `supabase_migrations` schemas must be treated as platform-managed dependencies. The REFLINK baseline package should describe its dependencies on them, not attempt to recreate their objects.

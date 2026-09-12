# Backend data export

These CSV files were exported from `tracker-backend/database/database.sqlite` on 2026-09-12:

- `users.csv`: 21 users
- `projects.csv`: 4 projects
- `task_submissions.csv`: 300 submissions
- `weekly_targets.csv`: empty
- `resources.csv`: 8 resources
- `house_rules.csv`: 14 house rules

The CSV files are intentionally ignored by Git because they contain personal and operational data.

## Import order

1. Create the users in Supabase Authentication. Supabase generates a UUID for each user; the old SQLite integer IDs cannot be used as `profiles.id`.
2. Insert each user's profile using the generated Auth UUID, preserving `name`, `email`, `role`, `shift`, `meet_link`, and `is_active` from `users.csv`.
3. Import `projects.csv`, preserving the `id` values if the Supabase `projects` table is empty.
4. Import `resources.csv` and `house_rules.csv`.
5. Import `task_submissions.csv` only after replacing its old integer `user_id` values with the matching Supabase profile UUIDs. Preserve `project_id` if project IDs were preserved.

The old Laravel password hashes are not included. Supabase Auth passwords must be set when creating the Auth users or reset afterward from the Supabase dashboard.

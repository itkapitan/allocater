# Repository Rules

## SQLite Database
- **DO NOT** wipe out, delete, or reset the local `database.sqlite` file during updates, bug fixes, or enhancements.
- If changes to the database schema or architecture are required:
  - **MUST** write a migration script (e.g., a JavaScript file under a `migrations/` folder or integrated directly into the `server.cjs` startup flow) to automatically migrate data from the existing database schema to the new schema.
  - Ensure all existing user records, roles, project memberships, allocations, capacities, and uploaded avatar images are preserved and migrated without any data loss.

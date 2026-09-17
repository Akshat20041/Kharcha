## Change and verification

Describe the user-visible change and checks run.

## Release safety

- [ ] No secrets, production data, or backups are included.
- [ ] Existing frontend/API versions remain compatible during independent deployments.
- [ ] No database change, OR new migrations and the rollout plan below are reviewed.

For database changes: list the new migration files, old/new app compatibility, lock/data-loss risks, backup timestamp and restore drill, deployment order, and recovery plan. **Destructive SQL requires the owner's explicit written approval before execution.** Never edit an applied migration or run a reset/db push in production. See `Docs/STAGE_6.md`.

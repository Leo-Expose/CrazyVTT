# CrazyVTT Upgrade Guide

## Existing installations

1. Back up the database and `backend/uploads` before upgrading.
2. Deploy the application code and run the migrations from the backend image:

   ```bash
   docker compose run --rm backend npx prisma migrate deploy
   docker compose run --rm backend npx prisma generate
   ```

3. Restart the backend and verify `/health` before allowing players into a live table.
4. Existing campaigns are unchanged. New campaigns receive the default D&D 5e and Pathfinder 2e spell templates; existing campaigns can create templates from the spell tools.

The migration is additive: rulebooks, collaboration, map layers/tiles, shops, inventory/currency, spell templates, DM overrides, and dice decks are introduced without dropping existing campaign data. Run `npx prisma migrate status` against the deployment database to confirm the migration chain is complete.

## Rollback

Prisma migrations are forward-only. If the application must be rolled back, restore the database backup into a separate database first, validate the previous application version, and switch traffic only after the health check passes. Do not delete rows or edit `_prisma_migrations` by hand.

## Validation checklist

- `npx prisma validate`
- `npx prisma migrate status`
- backend and frontend typechecks
- `docker compose config --quiet`
- shop purchase/sale, inventory transfer, spell review, and DM override smoke flows

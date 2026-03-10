## Summary

- refresh the issue branch onto current `origin/main` so it matches the shipped queue code
- extend the Pages smoke test to verify `/api/requests` returns usable queue data

## Testing

- `bun run check`
- `bun run smoke:pages -- --base-url https://openreactor.net --cleanup`

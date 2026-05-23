# Frontend Mock Mode

This folder is the single source of truth for frontend mock mode.

## Toggle

Set this in root `.env`:

`NEXT_PUBLIC_MOCK_MODE=true`

When enabled, MSW intercepts frontend HTTP calls and returns local mock responses.

## Structure

- `data/`: domain fixtures used by handlers and local mock flows.
- `handlers/`: MSW endpoint handlers grouped by feature domain.
- `browser.ts`: MSW worker setup.
- `index.ts`: convenience exports.

## Where to edit data

- Dashboard live scans/stats: `data/dashboard.ts`
- Reports list/analytics: `data/reports.ts`
- User management/devices: `data/users.ts`
- Settings/schedules/screensaver: `data/settings.ts`, `data/screensaver.ts`
- Auth/profile: `data/auth.ts`

## Notes

- Keep response shapes aligned with current frontend consumers.
- Use this folder for all new mock data to avoid scattered fixtures.

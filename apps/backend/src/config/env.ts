import * as dotenv from 'dotenv';
import * as path from 'path';

// Loaded as the very first import in main.ts: every other module reads
// process.env at import time (module decorators), so the root .env must be in
// place before any of them is required. Same path resolution as data-source.ts.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.JWT_SECRET) {
    throw new Error(
      'FATAL: JWT_SECRET is not set. The backend refuses to start without it — ' +
        'tokens would otherwise be signed with an unpredictable or known key. ' +
        'Set JWT_SECRET in the repository-root .env file.',
    );
  }
}

if (process.env.NODE_ENV !== 'test') {
  try {
    assertRequiredEnv();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

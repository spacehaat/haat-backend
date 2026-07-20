import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { ensureBootstrapAdmin } from './modules/auth/auth.service.js';
import { startLeadReminderScheduler } from './modules/leads/lead-reminders.scheduler.js';

async function main() {
  await connectDb();
  await ensureBootstrapAdmin();
  startLeadReminderScheduler();
  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[backend] listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[backend] failed to start', err);
  process.exit(1);
});


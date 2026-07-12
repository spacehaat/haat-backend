import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { hashPassword, verifyPassword } from '../modules/auth/auth.service.js';
import { User } from '../modules/users/users.model.js';
import mongoose from 'mongoose';

async function main() {
  await connectDb();

  const email = env.ADMIN_EMAIL.toLowerCase().trim();
  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);

  const existing = await User.findOne({ email }).select('+passwordHash').exec();
  if (existing) {
    existing.name = env.ADMIN_NAME;
    existing.phone = env.ADMIN_PHONE;
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    existing.status = 'active';
    await existing.save();
    // eslint-disable-next-line no-console
    console.log(`[seed-admin] updated admin: ${email}`);
  } else {
    await User.create({
      name: env.ADMIN_NAME,
      email,
      phone: env.ADMIN_PHONE,
      gender: 'unspecified',
      passwordHash,
      role: 'admin',
      permissions: [],
      cities: [],
      status: 'active',
    });
    // eslint-disable-next-line no-console
    console.log(`[seed-admin] created admin: ${email}`);
  }

  const doc = await User.findOne({ email }).select('+passwordHash').exec();
  const ok = doc ? await verifyPassword(env.ADMIN_PASSWORD, doc.passwordHash) : false;
  // eslint-disable-next-line no-console
  console.log(`[seed-admin] db=${mongoose.connection.name} verified=${ok}`);

  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-admin] failed', err);
  process.exit(1);
});

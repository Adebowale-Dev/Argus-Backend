import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { seedAdmin } from "./admin.seed.js";
import { seedSettings } from "./settings.seed.js";
import { seedSampleData } from "./sampleData.seed.js";
import mongoose from "mongoose";

try {
  await connectDatabase();
  await mongoose.connection.db.dropDatabase();
  const admin = await seedAdmin();
  await seedSettings();
  await seedSampleData(admin);
  console.info(`Seed complete. Default super admin: ${admin.email}`);
  await disconnectDatabase();
  process.exit(0);
} catch (error) {
  console.error("Seed failed", error);
  await disconnectDatabase();
  process.exit(1);
}

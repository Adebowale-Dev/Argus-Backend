import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/modules/users/user.model.js";

jest.setTimeout(300000);
let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await User.create({ fullName: "Admin User", email: "admin@gmail.com", password: "123456789", role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: true });
});
describe("authentication", () => {
  test("logs in and issues a protected refresh cookie", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({ email: "admin@gmail.com", password: "123456789" }).expect(200);
    expect(response.body.data.user.role).toBe("SUPER_ADMIN");
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
  });
  test("rejects blocked users", async () => {
    await User.updateOne({ email: "admin@gmail.com" }, { status: "BLOCKED" });
    await request(app).post("/api/v1/auth/login").send({ email: "admin@gmail.com", password: "123456789" }).expect(403);
  });
  test("isolates failed-login limits by identifier", async () => {
    const target = "rate-limit-target@gmail.com";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post("/api/v1/auth/login").send({ email: target, password: "incorrect-password" }).expect(401);
    }

    await request(app).post("/api/v1/auth/login").send({ email: target, password: "incorrect-password" }).expect(429);
    await request(app).post("/api/v1/auth/login").send({ email: "different-user@gmail.com", password: "incorrect-password" }).expect(401);
  });
});

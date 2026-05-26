import { Server } from "socket.io";
import { verifyAccessToken } from "../utils/generateToken.js";
import { User } from "../modules/users/user.model.js";
import { Exam } from "../modules/exams/exam.model.js";
import { ExamAttempt } from "../modules/attempts/attempt.model.js";
import { ROLES } from "../constants/roles.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { env } from "../config/env.js";
import { setSocketServer } from "./emitter.js";

export const initializeSockets = (server) => {
  const io = new Server(server, { cors: { origin: env.CLIENT_URL, credentials: true } });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      if (!user || user.status !== "ACTIVE") throw new Error();
      socket.user = user;
      next();
    } catch { next(new Error("Socket authentication failed.")); }
  });
  io.on("connection", (socket) => {
    socket.on("candidate:join-exam", async ({ attemptId }) => {
      if (socket.user.role !== ROLES.CANDIDATE) return;
      const attempt = await ExamAttempt.findOne({ _id: attemptId, candidate: socket.user._id, status: "IN_PROGRESS" });
      if (attempt) { socket.join(`attempt:${attemptId}`); socket.join(`exam:${attempt.exam}`); }
    });
    socket.on("examiner:join-monitoring", async ({ examId }) => {
      const permitted = socket.user.role === ROLES.SUPER_ADMIN ||
        (socket.user.role === ROLES.SUB_ADMIN && socket.user.permissions.includes(PERMISSIONS.VIEW_REPORTS)) ||
        (socket.user.role === ROLES.EXAMINER && await Exam.exists({ _id: examId, createdBy: socket.user._id }));
      if (permitted) socket.join(`exam:${examId}`);
    });
    socket.on("platform:join-monitoring", () => {
      if (socket.user.role === ROLES.SUPER_ADMIN || (socket.user.role === ROLES.SUB_ADMIN && socket.user.permissions.includes(PERMISSIONS.VIEW_REPORTS))) socket.join("platform:monitoring");
    });
    socket.on("disconnect", () => io.to("platform:monitoring").emit("exam:candidate-disconnected", { userId: socket.user.id }));
  });
  setSocketServer(io);
  return io;
};

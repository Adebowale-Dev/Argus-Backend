import crypto from "crypto";

export const generateExamCodeCandidate = () => `AR${crypto.randomInt(1000, 10000)}`;

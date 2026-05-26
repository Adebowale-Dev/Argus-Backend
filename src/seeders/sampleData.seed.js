import { QuestionBank } from "../modules/question-banks/questionBank.model.js";

export const seedSampleData = async (admin) => {
  if (process.env.SEED_SAMPLE_DATA !== "true") return;
  await QuestionBank.updateOne(
    { title: "Sample Assessment Bank", owner: admin._id },
    { $setOnInsert: { title: "Sample Assessment Bank", description: "Starter question bank for ARGUS demos.", owner: admin._id, tags: ["sample", "demo"] } },
    { upsert: true }
  );
};

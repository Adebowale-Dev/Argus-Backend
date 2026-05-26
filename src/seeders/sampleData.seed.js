import { Department } from "../modules/departments/department.model.js";
import { Course } from "../modules/courses/course.model.js";

export const seedSampleData = async (admin) => {
  if (process.env.SEED_SAMPLE_DATA !== "true") return;
  const department = await Department.findOneAndUpdate({ code: "CSC" }, { $setOnInsert: { name: "Computer Science", code: "CSC", description: "Sample department", createdBy: admin._id } }, { upsert: true, new: true });
  await Course.updateOne({ code: "CSC101" }, { $setOnInsert: { title: "Introduction to Computing", code: "CSC101", department: department._id, createdBy: admin._id } }, { upsert: true });
};

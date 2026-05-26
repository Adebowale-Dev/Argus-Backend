import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../config/env.js";

const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");
const fill = (html, data) => html.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => String(data[key] ?? ""));

export const renderEmail = async (templateName, variables = {}) => {
  const common = { appName: env.EMAIL_TEMPLATE_BRAND_NAME, supportEmail: env.EMAIL_TEMPLATE_SUPPORT_EMAIL, ...variables };
  const [layout, template] = await Promise.all([
    readFile(path.join(templateDir, "base.layout.html"), "utf8"),
    readFile(path.join(templateDir, `${templateName}.html`), "utf8")
  ]);
  return fill(layout, { ...common, content: fill(template, common) });
};

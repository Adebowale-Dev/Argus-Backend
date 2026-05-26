import * as Brevo from "@getbrevo/brevo";
import { env } from "./env.js";

const api = new Brevo.TransactionalEmailsApi();
if (env.BREVO_API_KEY) {
  api.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, env.BREVO_API_KEY);
}

export const brevoClient = api;
export const sender = { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME };

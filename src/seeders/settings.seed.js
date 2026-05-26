import { Setting } from "../modules/settings/setting.model.js";
import { antiCheatDefaults } from "../utils/antiCheatDefaults.js";

export const seedSettings = async () => {
  const defaults = antiCheatDefaults();
  await Promise.all(Object.entries(defaults).map(([key, value]) => Setting.updateOne(
    { key: `antiCheat.${key}` },
    { $setOnInsert: { key: `antiCheat.${key}`, value, description: `Default anti-cheat value for ${key}.`, category: "ANTI_CHEAT", isPublic: false } },
    { upsert: true }
  )));
};

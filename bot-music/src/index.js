import "./ipv4-only.js";

import { config } from "./config.js";
import { Bot } from "./bot.js";

process.on("unhandledRejection", (reason) => {
  console.error("[index] unhandledRejection (ignorado, bot segue):", reason?.stack ?? reason);
});
process.on("uncaughtException", (err) => {
  console.error("[index] uncaughtException (ignorado, bot segue):", err?.stack ?? err);
});

const bot = new Bot(config);
bot.start();

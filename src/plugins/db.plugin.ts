import fp from "fastify-plugin";
import { db } from "../config/db.ts";

export const dbPlugin = fp(async function dbPlugin(app) {
  app.decorate("db", db);

  app.addHook("onClose", async () => {
    await db.destroy();
  });
});

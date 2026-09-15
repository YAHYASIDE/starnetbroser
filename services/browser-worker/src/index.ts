import { config } from "./config";
import { SessionManager } from "./browser/sessionManager";
import { createServer } from "./api/server";

const sessions = new SessionManager();
const app = createServer(sessions);

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`browser-worker listening on :${config.port}`);
});

async function shutdown() {
  server.close();
  await sessions.stopAll();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

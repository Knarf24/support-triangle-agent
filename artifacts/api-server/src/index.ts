import app from "./app";
import { logger } from "./lib/logger";
import { runKbUrlMigration } from "./lib/kb-url-migration";
import { setMigrationFailed } from "./lib/migration-status";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function notifySlack(message: string): Promise<void> {
  const webhookUrl = process.env["SLACK_WEBHOOK_URL"];
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Slack webhook returned non-OK status");
    }
  } catch (slackErr) {
    logger.warn({ err: slackErr }, "Failed to send Slack alert");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  if (!process.env["SLACK_WEBHOOK_URL"]) {
    logger.warn("SLACK_WEBHOOK_URL is not set — Slack alerting is disabled. Migration failures will only surface via the UI banner.");
  }

  runKbUrlMigration().catch((migrationErr) => {
    logger.error({ err: migrationErr }, "KB URL migration failed on startup");
    setMigrationFailed(migrationErr);

    const errorMessage = migrationErr instanceof Error ? migrationErr.message : String(migrationErr);
    const alertText = `:rotating_light: *KB URL migration failed on startup*\n\`\`\`${errorMessage}\`\`\`\nTickets may have missing URL metadata. Check server logs for details.`;

    notifySlack(alertText);
  });
});

const app = require("./app");
const config = require("../config/config");
const logger = require("../config/logger");
const supabase = require("../config/supabase");
const { syncPlansFromStripe } = require("../seeders/stripePlanSeeder");

let server;

// Verify Supabase connection
const startServer = async () => {
  try {
    // Quick health check — query a simple table
    const { error } = await supabase.from("roles").select("id", { count: "exact", head: true });
    if (error) {
      logger.warn(`Supabase connection warning: ${error.message}`);
    } else {
      logger.info("Connected to Supabase");
    }

    // Seed Stripe plans into subscriptions table
    syncPlansFromStripe().catch((e) => logger.warn("Plan sync skipped:", e.message));

    server = app.listen(config.port, () => {
      logger.info(`Listening to port ${config.port}`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

startServer();

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info("Server closed");
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);

process.on("SIGTERM", () => {
  logger.info("SIGTERM received");
  if (server) {
    server.close();
  }
});

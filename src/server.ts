import { run } from "probot";
import app from "./app";

// Starts the webhook server. With no APP_ID/PRIVATE_KEY/WEBHOOK_SECRET set,
// Probot launches its setup flow to register the GitHub App for you.
run(app);

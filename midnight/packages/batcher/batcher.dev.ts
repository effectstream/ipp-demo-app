import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig } from "@effectstream/batcher-sdk";
import { createMidnightBalancingAdapter } from "./midnight-balancing.ts";
import { startReadServer } from "./read-server.ts";

const batchIntervalMs = 1000;
// 3335 so the IPP backend (on 3334) can call this batcher.
const port = Number(process.env.BATCHER_PORT ?? "3335");

const midnight = createMidnightBalancingAdapter({
  syncProtocolName: "parallelMidnight",
});

const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { midnight },
  defaultTarget: "midnight",
  namespace: "",
  batchingCriteria: {
    midnight: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);

main(function* () {
  console.log("Starting IPP Anchor Batcher...");

  // Read-only verification endpoint (GET /anchor/:keyHex) on its own port.
  // Non-blocking — comes up alongside the batcher so the IPP backend's
  // /verify route can read the anchors ledger back from chain.
  startReadServer();

  try {
    batcher.addStateTransition("startup", ({ publicConfig }) => {
      const banner =
        `IPP Anchor Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms\n` +
        `      | Default Target: ${publicConfig.defaultTarget}\n` +
        `      | Blockchain Adapter Targets: ${
          publicConfig.adapterTargets.join(", ")
        }\n` +
        `      | Batching Criteria: ${
          Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
            `${target}=${type}`
          ).join(", ")
        }\n`;
      console.log(banner);
    });

    batcher.addStateTransition("http:start", ({ port }) => {
      const publicConfig = batcher.getPublicConfig();
      const httpInfo = `HTTP Server ready\n` +
        `      | URL: http://localhost:${port}\n` +
        `      | Confirmation: ${publicConfig.confirmationLevel}\n` +
        `      | Events Enabled: ${publicConfig.enableEventSystem}\n` +
        `      | Polling: ${publicConfig.pollingIntervalMs} ms`;
      console.log(httpInfo);
    });

    yield* batcher.runBatcher();
  } catch (error) {
    console.error("Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }

  yield* suspend();
});

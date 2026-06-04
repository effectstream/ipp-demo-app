import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;
const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    ...launchMidnight("@ipp/contracts-midnight", { cwd: path.join(root, "packages/contracts-midnight") }, {
      env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
    }),

    {
      name: "batcher",
      description: "Anchor batcher (Midnight)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3335",
      env: { BATCHER_PORT: "3335" },
      stopProcessAtPort: [3335],
      dependsOn: [...midnightDeps],
    },
  ],
} satisfies OrchestratorConfig;

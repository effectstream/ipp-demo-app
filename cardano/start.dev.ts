import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite().map((p) =>
      p.name === "pglite"
        ? { ...p, env: { ...p.env, DEBUG_PGLITE: "0" } }
        : p,
    ),
    ...launchCardano("@cardano-delegation/contracts-cardano", {
      cwd: path.join(root, "packages/contracts-cardano"),
    }).filter((p) => p.name !== CardanoNames.CARDANO_SUBMIT_TX),

    {
      name: "sync",
      description: "IPP Cardano anchor sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", MQTT_BROKER: "false" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        CardanoNames.DOLOS_MINIBF_WAIT,
      ],
    },
  ],
} satisfies OrchestratorConfig;

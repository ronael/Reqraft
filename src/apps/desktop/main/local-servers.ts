import { totalmem } from "node:os";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import {
  EmptyRequestSchema,
  type LocalServersDetectResponse,
} from "@/apps/desktop/shared/ipc-contract.js";
import { recommendLocalModel } from "@/models/local-recommendation.js";
import { detectLocalServers, type DetectedLocalServer } from "@/providers/local-servers.js";
import type { IpcMainLike } from "./ipc.js";
import { sanitizeModelCatalog } from "./model-catalog.js";

export interface LocalServersHandlerDependencies {
  ipcMain: IpcMainLike;
  detectLocalServers?: () => Promise<DetectedLocalServer[]>;
  totalMemoryBytes?: () => number;
}

/**
 * What the onboarding shows of the model servers on this machine.
 *
 * The addresses come from `providers/local-endpoint.ts`, never from the
 * renderer. Each model list goes through `sanitizeModelCatalog` like any
 * other catalogue, since whatever listens on those ports decides what it
 * answers.
 */
export function registerLocalServersHandler(dependencies: LocalServersHandlerDependencies): void {
  dependencies.ipcMain.handle(IPC_CHANNELS.localServersDetect, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    const detected = await (dependencies.detectLocalServers ?? detectLocalServers)();
    const advice = recommendLocalModel((dependencies.totalMemoryBytes ?? totalmem)());
    const response: LocalServersDetectResponse = {
      servers: detected.map((server) => ({
        kind: server.kind,
        label: server.label,
        baseUrl: server.baseUrl,
        reachable: server.reachable,
        models: sanitizeModelCatalog(server.models.map((id) => ({ id }))).models,
      })),
      recommendation: {
        model: advice.id,
        sizeGb: advice.sizeGb,
        memoryGb: advice.memoryGb,
        pullCommand: advice.pullCommand,
        searchTerm: advice.searchTerm,
      },
    };
    return response;
  });
}

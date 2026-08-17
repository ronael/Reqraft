/* @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { KeymapProvider, createReqraftKeymap } from "../src/opentui/keymap.js";
import { LabApp } from "./ui-lab/lab-app.js";
import { LAB_SCENES } from "./ui-lab/scenes.js";

/**
 * The Reqraft UI Lab.
 *
 * Mounts the UI primitives standalone — no providers, no configuration, no
 * conversation, no API. Every scene is a component in one of its states,
 * driven at the keyboard and the mouse, so a primitive can be verified
 * without launching Reqraft.
 *
 *   bun run ui:lab              # the scene navigator
 *   bun run ui:lab TextInput    # jump straight to a component
 *
 * Must run under Bun: OpenTUI's native FFI has no Node build.
 */

const requested = process.argv[2]?.toLowerCase();
const initialIndex = requested
  ? Math.max(
      0,
      LAB_SCENES.findIndex((scene) => scene.component.toLowerCase() === requested),
    )
  : 0;

const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: true });
const keymap = createReqraftKeymap(renderer);

createRoot(renderer).render(
  <KeymapProvider keymap={keymap}>
    <LabApp scenes={LAB_SCENES} initialIndex={initialIndex} />
  </KeymapProvider>,
);

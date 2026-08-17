/* @jsxImportSource @opentui/react */
import type { CliRenderer } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import type { Keymap } from "@opentui/keymap";
import type { Renderable } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { KeymapProvider, useBindings, useKeymap } from "@opentui/keymap/react";
import { useRef } from "react";
import {
  BASE_LAYER_PRIORITY,
  createBaseBindings,
  type KeymapActions,
  type KeymapConditions,
} from "../ui/interaction/keys.js";

/**
 * The keymap is created once per renderer, outside the React tree, and shared
 * through `KeymapProvider`. `createDefaultOpenTuiKeymap` wires the keymap to
 * the renderer's key input *before* the focused renderable sees the event,
 * with `enabled` conditions evaluated on every keypress — that is the whole
 * context mechanism:
 *
 * - base layer (registered by `useBaseKeymap`): global shortcuts, inert while
 *   a modal is open;
 * - modal layer (registered by the Modal component): Escape, above base;
 * - anything the keymap does not claim reaches the focused renderable — that
 *   is how typing reaches the prompt without special-casing.
 */

export type ReqraftKeymap = Keymap<Renderable, KeyEvent>;

export function createReqraftKeymap(renderer: CliRenderer): ReqraftKeymap {
  return createDefaultOpenTuiKeymap(renderer);
}

export { KeymapProvider, useKeymap };

/**
 * Registers the base layer once. Actions and conditions are read through
 * refs on every keypress, so the layer never needs re-registering as the app
 * state changes.
 */
export function useBaseKeymap(actions: KeymapActions, conditions: KeymapConditions): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const conditionsRef = useRef(conditions);
  conditionsRef.current = conditions;

  useBindings(
    () => ({
      priority: BASE_LAYER_PRIORITY,
      bindings: createBaseBindings(
        {
          interruptOrExit: () => actionsRef.current.interruptOrExit(),
          exit: () => actionsRef.current.exit(),
          moveFocus: () => actionsRef.current.moveFocus(),
          generate: () => actionsRef.current.generate(),
          openProfile: () => actionsRef.current.openProfile(),
          openLevel: () => actionsRef.current.openLevel(),
          openProvider: () => actionsRef.current.openProvider(),
          openModel: () => actionsRef.current.openModel(),
          toggleDiff: () => actionsRef.current.toggleDiff(),
          showExplain: () => actionsRef.current.showExplain(),
          copyResult: () => actionsRef.current.copyResult(),
          reset: () => actionsRef.current.reset(),
          openHelp: () => actionsRef.current.openHelp(),
          pasteFromClipboard: () => actionsRef.current.pasteFromClipboard(),
          closeModal: () => actionsRef.current.closeModal(),
        },
        {
          modalOpen: () => conditionsRef.current.modalOpen(),
          hasResult: () => conditionsRef.current.hasResult(),
          inputEmpty: () => conditionsRef.current.inputEmpty(),
        },
      ),
    }),
    [],
  );
}

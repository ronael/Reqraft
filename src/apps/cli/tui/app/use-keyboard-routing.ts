import { useKeyboard } from "@opentui/react";
import { routeKey, type RoutingContext } from "@/apps/cli/tui/model/keymap.js";
import { toKeyPress, type TerminalKeyEvent } from "./keyboard.js";
import type { CommandId } from "@/apps/cli/tui/model/commands.js";

/**
 * The single place real key events enter the application.
 *
 * A hook rather than a component: it renders nothing, so a component would be
 * the wrong shape for it. Deliberately thin — translate, route, dispatch. What
 * a key *means* is decided by `routeKey`, which is pure; this exists only
 * because that decision needs a terminal event to react to.
 */
export function useKeyboardRouting(
  context: RoutingContext,
  onCommand: (id: CommandId) => void,
): void {
  useKeyboard((event: TerminalKeyEvent) => {
    const route = routeKey(toKeyPress(event), context);
    if (route.kind === "command") {
      onCommand(route.id);
    }
    // `insert` and `ignored` are deliberately not handled: the focused
    // textarea consumes its own keys, and a key an overlay swallows must not
    // fall through to anything else.
  });
}

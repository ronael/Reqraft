/* @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core";
import React from "react";

import type { Translator } from "../i18n/translate.js";
import type { Layout } from "./layout.js";
import { COLOR } from "./theme.js";

export function HelpOverlay({
  layout,
  t,
}: Readonly<{ layout: Layout; t: Translator }>): React.ReactNode {
  return (
    <box
      style={{
        position: "absolute",
        top: layout.pickerTop,
        left: layout.pickerLeft,
        width: layout.pickerWidth,
        border: true,
        borderStyle: "double",
        borderColor: COLOR.accent,
        backgroundColor: COLOR.panelSoft,
        padding: 1,
        zIndex: 10,
        flexDirection: "column",
        rowGap: 1,
      }}
    >
      <text attributes={TextAttributes.BOLD}>{t("tui.helpTitle")}</text>
      <text>{t("tui.helpGenerate")}</text>
      <text>{t("tui.helpPickers")}</text>
      <text>{t("tui.helpViews")}</text>
      <text>{t("tui.helpFocus")}</text>
      <text attributes={TextAttributes.DIM}>{t("tui.helpClose")}</text>
    </box>
  );
}

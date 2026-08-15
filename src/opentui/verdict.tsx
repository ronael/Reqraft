/* @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core";
import type { RepromptResult } from "../core/types.js";
import type { Translator } from "../i18n/translate.js";
import { expansionGaugeModel, formatRatio } from "../ui/expansion-gauge.js";
import { COLOR } from "./theme.js";

/**
 * Fidelity verdict + expansion gauge (CLI v2, docs/design/cli-v2.md): the
 * verdict and its gauge render BEFORE the result text — that is the product's
 * identity, not an annotation. An expansion warning flips the gauge to amber
 * and leads the action hints (lower the level first, scenario 7).
 */

const GAUGE_WIDTH = 34;

interface VerdictModel {
  color: string;
  label: string;
  detail: string | null;
}

function describeVerdict(
  result: RepromptResult,
  ratio: number,
  hasExpansion: boolean,
  t: Translator,
): VerdictModel {
  if (result.quality.status === "good" && !hasExpansion) {
    return {
      color: COLOR.success,
      label: `✓ ${t("tui.verdictFaithful")}`,
      detail: t("tui.verdictNoInvention"),
    };
  }
  if (hasExpansion) {
    return {
      color: COLOR.warning,
      label: `! ${t("tui.verdictExpansion")} ${formatRatio(ratio)}`,
      detail: t("tui.verdictUnrequested"),
    };
  }
  return {
    color: result.quality.status === "review" ? COLOR.warning : COLOR.error,
    label: `! ${t("quality.review")}`,
    detail: null,
  };
}

export function FidelityVerdict({
  result,
  t,
}: Readonly<{ result: RepromptResult; t: Translator }>): React.ReactNode {
  const model = expansionGaugeModel(result.original, result.rewritten, result.level);
  const hasExpansion = result.quality.signals.some(
    (signal) => signal.code === "disproportionate_expansion",
  );
  const verdict = describeVerdict(result, model.ratio, hasExpansion, t);

  return (
    <box style={{ flexDirection: "column", rowGap: 0 }}>
      <text>
        <span fg={verdict.color} attributes={TextAttributes.BOLD}>
          {verdict.label}
        </span>
        {verdict.detail !== null && <span fg={COLOR.muted}> · {verdict.detail}</span>}
      </text>
      <ExpansionGauge
        ratio={model.ratio}
        fillRatio={model.fillRatio}
        exceeded={model.exceeded}
        threshold={model.threshold}
        t={t}
      />
    </box>
  );
}

function ExpansionGauge({
  ratio,
  fillRatio,
  exceeded,
  threshold,
  t,
}: Readonly<{
  ratio: number;
  fillRatio: number;
  exceeded: boolean;
  threshold: number;
  t: Translator;
}>): React.ReactNode {
  const fillCount = Math.round(fillRatio * GAUGE_WIDTH);
  const thresholdColumn = Math.round(0.8 * GAUGE_WIDTH);
  const fillColor = exceeded ? COLOR.warning : COLOR.success;

  const cells: React.ReactNode[] = [];
  for (let column = 0; column < GAUGE_WIDTH; column++) {
    if (column === thresholdColumn) {
      cells.push(
        <span key={column} fg={COLOR.subtle}>
          │
        </span>,
      );
    } else if (column < fillCount) {
      cells.push(
        <span key={column} fg={fillColor}>
          █
        </span>,
      );
    } else {
      cells.push(
        <span key={column} fg={COLOR.borderSoft}>
          ░
        </span>,
      );
    }
  }

  return (
    <box style={{ flexDirection: "column" }}>
      <box
        style={{ flexDirection: "row", justifyContent: "space-between", width: GAUGE_WIDTH + 14 }}
      >
        <text fg={COLOR.muted} attributes={TextAttributes.DIM}>
          {t("tui.expansionRatio", { ratio: formatRatio(ratio) })}
        </text>
        <text fg={COLOR.muted} attributes={TextAttributes.DIM}>
          {t("tui.expansionThreshold", { threshold: formatRatio(threshold) })}
        </text>
      </box>
      <text>{cells}</text>
    </box>
  );
}

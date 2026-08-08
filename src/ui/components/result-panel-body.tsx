import { Box, Text } from "ink";
import React from "react";

import { previewRewritten } from "../../core/stream-preview.js";
import type { RepromptResult } from "../../core/types.js";
import type { ViewMode } from "../app-state.js";
import type { UiError } from "../errors.js";
import { formatResultView } from "../result-view.js";
import { getEmptyStateTitle } from "../view-labels.js";
import { clipLines, clipTailLines } from "../viewport.js";
import { EmptyState } from "./empty-state.js";
import { ErrorState } from "./error-state.js";
import { MetaRow } from "./meta-row.js";
import { QualityNotice } from "./quality-notice.js";
import { Spinner } from "./spinner.js";

interface ResultPanelBodyProps {
  isLoading: boolean;
  error: UiError | null;
  result: RepromptResult | null;
  view: ViewMode;
  /** Rows the panel may use for the text itself. */
  maxLines: number;
  /** Raw provider output received so far while a stream is in flight. */
  partialText?: string;
}

/**
 * Order matters: a failure hides a stale result, and the spinner wins over
 * both so a retry never shows the previous run as if it were current.
 */
export function ResultPanelBody({
  isLoading,
  error,
  result,
  view,
  maxLines,
  partialText = "",
}: Readonly<ResultPanelBodyProps>): React.JSX.Element {
  if (isLoading) {
    return <StreamingBody partialText={partialText} maxLines={maxLines} />;
  }
  if (error) {
    return <ErrorState error={error} />;
  }
  if (result) {
    const clipped = clipLines(formatResultView(result, view), maxLines);
    return (
      <Box>
        <Text wrap="wrap">{clipped.lines.join("\n")}</Text>
        {clipped.hiddenBelow > 0 && (
          <Text dimColor>
            … {String(clipped.hiddenBelow)} lignes masquées · ^Y copie le résultat complet
          </Text>
        )}
        <MetaRow result={result} />
        <QualityNotice quality={result.quality} />
      </Box>
    );
  }
  return (
    <EmptyState
      title={getEmptyStateTitle(view)}
      action="Appuie sur Entrée pour générer une reformulation."
    />
  );
}

/**
 * What the panel shows while the provider is answering.
 *
 * Once text starts arriving the spinner gives way to the text itself: seeing
 * the answer form is the whole point of streaming. Providers that cannot
 * stream never send a fragment, so they keep the spinner.
 */
function StreamingBody({
  partialText,
  maxLines,
}: Readonly<{ partialText: string; maxLines: number }>): React.JSX.Element {
  const preview = previewRewritten(partialText);
  if (preview.kind === "pending" || preview.text === "") {
    return <Spinner label="Reformulation en cours" />;
  }

  // The tail is what matters while text streams in: clipping the head would
  // freeze the view as soon as the answer passes the budget.
  const clipped = clipTailLines(preview.text, maxLines);
  return <Text wrap="wrap">{clipped.lines.join("\n")}</Text>;
}

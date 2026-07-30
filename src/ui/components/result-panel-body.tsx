import { Text } from "ink";
import React from "react";

import type { RepromptResult } from "../../core/types.js";
import type { ViewMode } from "../app-state.js";
import { formatResultView } from "../result-view.js";
import { clipLines } from "../viewport.js";
import { getEmptyStateTitle } from "../view-labels.js";
import type { UiError } from "../errors.js";
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
}: Readonly<ResultPanelBodyProps>): React.JSX.Element {
  if (isLoading) {
    return <Spinner />;
  }
  if (error) {
    return <ErrorState error={error} />;
  }
  if (result) {
    const clipped = clipLines(formatResultView(result, view), maxLines);
    return (
      <>
        <Text wrap="wrap">{clipped.lines.join("\n")}</Text>
        {clipped.hiddenBelow > 0 && (
          <Text dimColor>
            … {String(clipped.hiddenBelow)} lignes masquées · ^Y copie le résultat complet
          </Text>
        )}
        <MetaRow result={result} />
        <QualityNotice quality={result.quality} />
      </>
    );
  }
  return (
    <EmptyState
      title={getEmptyStateTitle(view)}
      action="Appuie sur Entrée pour générer une reformulation."
    />
  );
}

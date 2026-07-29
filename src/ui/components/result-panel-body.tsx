import { Text } from "ink";
import React from "react";

import type { RepromptResult } from "../../core/types.js";
import type { ViewMode } from "../app-state.js";
import { formatResultView } from "../result-view.js";
import { getEmptyStateTitle } from "../view-labels.js";
import { EmptyState } from "./empty-state.js";
import { MetaRow } from "./meta-row.js";
import { Notice } from "./notice.js";
import { QualityNotice } from "./quality-notice.js";
import { Spinner } from "./spinner.js";

interface ResultPanelBodyProps {
  isLoading: boolean;
  error: string | null;
  result: RepromptResult | null;
  view: ViewMode;
}

export function ResultPanelBody({
  isLoading,
  error,
  result,
  view,
}: Readonly<ResultPanelBodyProps>): React.JSX.Element {
  if (isLoading) {
    return <Spinner />;
  }
  if (error) {
    return <Notice tone="danger">{error}</Notice>;
  }
  if (result) {
    return (
      <>
        <Text wrap="wrap">{formatResultView(result, view)}</Text>
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

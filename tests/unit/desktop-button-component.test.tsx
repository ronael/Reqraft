import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/apps/desktop/renderer/shared/Button.js";

describe("desktop Button", () => {
  it("uses the violet design and a safe button type by default", () => {
    const markup = renderToStaticMarkup(<Button>Save</Button>);

    expect(markup).toContain('type="button"');
    expect(markup).toContain('class="design-button design-button-violet"');
  });

  it("supports the neutral hierarchy without losing native attributes", () => {
    const markup = renderToStaticMarkup(
      <Button variant="neutral" className="layout-hook" disabled aria-label="Refresh">
        Refresh
      </Button>,
    );

    expect(markup).toContain('class="design-button design-button-neutral layout-hook"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-label="Refresh"');
  });
});

// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "@/apps/desktop/renderer/shared/Select.js";

afterEach(cleanup);

const OPTIONS = [
  { value: "one", label: "First", group: "Built in" },
  { value: "two", label: "Second", group: "Built in" },
  { value: "three", label: "Third", group: "Custom" },
];

describe("desktop Select", () => {
  it("keeps native selects out of the cross-platform onboarding", async () => {
    const source = await readFile("src/apps/desktop/renderer/onboarding/OnboardingApp.tsx", "utf8");

    expect(source).not.toContain("<select");
    expect(source.match(/<Select/g)).toHaveLength(5);
  });

  it("uses a Reqraft listbox instead of a native select", async () => {
    const user = userEvent.setup();
    render(<Select value="one" options={OPTIONS} onChange={() => undefined} ariaLabel="Model" />);

    expect(document.querySelector("select")).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "Model" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText("Custom")).toBeTruthy();
  });

  it("selects with the keyboard and closes the list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="one" options={OPTIONS} onChange={onChange} ariaLabel="Model" />);
    const trigger = screen.getByRole("combobox", { name: "Model" });

    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("two");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes with Escape without changing the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="one" options={OPTIONS} onChange={onChange} ariaLabel="Model" />);

    await user.click(screen.getByRole("combobox", { name: "Model" }));
    await user.keyboard("{ArrowDown}{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

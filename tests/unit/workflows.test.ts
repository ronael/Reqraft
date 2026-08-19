import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * Guards that every workflow file actually parses.
 *
 * GitHub does not reject an invalid workflow at push time — it accepts the
 * commit, then produces a run that fails instantly with no jobs, and stops
 * seeing the file's triggers at all. A `workflow_dispatch` silently becomes
 * "workflow does not have that trigger", which reads like a permissions
 * problem rather than a syntax error. Catching it locally costs one test.
 */

const WORKFLOW_DIR = path.resolve(".github/workflows");

function workflowFiles(): string[] {
  return readdirSync(WORKFLOW_DIR).filter((name) => /\.ya?ml$/.test(name));
}

describe("github workflows", () => {
  it.each(workflowFiles())("%s is valid YAML with jobs and a trigger", (name) => {
    const raw = readFileSync(path.join(WORKFLOW_DIR, name), "utf8");
    const parsed = load(raw) as Record<string, unknown>;

    expect(parsed).toBeTypeOf("object");
    // YAML 1.1 reads a bare `on:` key as the boolean true, which is why the
    // trigger is looked up under both spellings.
    expect(parsed.on ?? parsed[String(true)]).toBeDefined();
    expect(Object.keys(parsed.jobs as object).length).toBeGreaterThan(0);
  });

  it("finds the workflows it is supposed to be checking", () => {
    // Without this, an empty directory would make every assertion above vacuous.
    expect(workflowFiles()).toEqual(
      expect.arrayContaining(["ci.yml", "publish.yml", "desktop.yml"]),
    );
  });
});

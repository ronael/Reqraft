import { describe, expect, it } from "vitest";
import { release, releaseTag, type ReleaseDependencies } from "../../scripts/release.js";

const COMMIT = "4f1c2b9e8d7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e";
const RUN_URL = "https://github.com/ronael/Reqraft/actions/runs/42";
const RUN_FIELDS = "--json databaseId,status,conclusion,url";
const LIST_RUNS = `gh run list --workflow ci.yml --commit ${COMMIT} --event push --limit 1 ${RUN_FIELDS}`;
const VIEW_RUN = `gh run view 42 ${RUN_FIELDS}`;
/** A refused release must leave neither a tag nor a GitHub Release behind. */
const TAG_OR_RELEASE = /^(?:git tag|gh release)/m;

function ciRun(status: string, conclusion = ""): string {
  return JSON.stringify({ databaseId: 42, status, conclusion, url: RUN_URL });
}

/**
 * Plays git and gh for a release started from a clean `main`. Each command
 * answers with its scripted outputs in turn, the last one repeating; any other
 * command answers "". Time only passes when the release sleeps.
 */
function fakeDependencies(answers: Record<string, string[]>) {
  const script: Record<string, string[]> = {
    "git branch --show-current": ["main"],
    "git rev-parse HEAD": [COMMIT],
    ...answers,
  };
  const commands: string[] = [];
  let clock = 0;
  const dependencies: ReleaseDependencies = {
    run: (command, args) => {
      const line = [command, ...args].join(" ");
      commands.push(line);
      const outputs = script[line] ?? [];
      return (outputs.length > 1 ? outputs.shift() : outputs[0]) ?? "";
    },
    sleep: (milliseconds) => {
      clock += milliseconds;
      return Promise.resolve();
    },
    now: () => clock,
    log: () => undefined,
  };
  return { dependencies, commands, elapsed: () => clock };
}

describe("release command", () => {
  it("derives the tag from a valid package version", () => {
    expect(releaseTag("0.1.6")).toBe("v0.1.6");
    expect(releaseTag("1.0.0-beta.1")).toBe("v1.0.0-beta.1");
  });

  it("rejects malformed versions", () => {
    expect(() => {
      releaseTag("release-1");
    }).toThrow("Version invalide");
  });

  it("tags the pushed commit once its CI run has succeeded", async () => {
    const { dependencies, commands } = fakeDependencies({
      [LIST_RUNS]: ["[]", `[${ciRun("queued")}]`],
      [VIEW_RUN]: [ciRun("in_progress"), ciRun("completed", "success")],
    });

    await release("1.2.3", dependencies);

    expect(commands).toEqual([
      "git branch --show-current",
      "git status --porcelain",
      "git rev-parse HEAD",
      "git push origin main",
      LIST_RUNS,
      LIST_RUNS,
      VIEW_RUN,
      VIEW_RUN,
      `git tag -a v1.2.3 ${COMMIT} -m Release v1.2.3`,
      "git push origin v1.2.3",
      "gh release create v1.2.3 --title Reqraft v1.2.3 --generate-notes --verify-tag --latest",
    ]);
  });

  it.each([
    ["failure", "La CI a échoué"],
    ["cancelled", "La CI a été annulée"],
  ])("refuses to tag when the CI run ends in %s", async (conclusion, message) => {
    const { dependencies, commands } = fakeDependencies({
      [LIST_RUNS]: [`[${ciRun("in_progress")}]`],
      [VIEW_RUN]: [ciRun("in_progress"), ciRun("completed", conclusion)],
    });

    await expect(release("1.2.3", dependencies)).rejects.toThrow(
      `${message} sur 4f1c2b9 : ${RUN_URL}`,
    );
    expect(commands.join("\n")).not.toMatch(TAG_OR_RELEASE);
  });

  it("refuses to tag when the CI run is still going after 45 minutes", async () => {
    const { dependencies, commands, elapsed } = fakeDependencies({
      [LIST_RUNS]: [`[${ciRun("in_progress")}]`],
      [VIEW_RUN]: [ciRun("in_progress")],
    });

    await expect(release("1.2.3", dependencies)).rejects.toThrow(
      `La CI n'a pas fini en 45 minutes sur 4f1c2b9 : ${RUN_URL}`,
    );
    expect(elapsed()).toBe(45 * 60_000);
    expect(commands.join("\n")).not.toMatch(TAG_OR_RELEASE);
  });

  it("refuses to tag when no CI run appears for the pushed commit", async () => {
    const { dependencies, commands, elapsed } = fakeDependencies({ [LIST_RUNS]: ["[]"] });

    await expect(release("1.2.3", dependencies)).rejects.toThrow(
      "Aucune exécution du workflow ci.yml n'est apparue pour 4f1c2b9 en 2 minutes.",
    );
    expect(elapsed()).toBe(2 * 60_000);
    expect(commands.join("\n")).not.toMatch(TAG_OR_RELEASE);
  });
});

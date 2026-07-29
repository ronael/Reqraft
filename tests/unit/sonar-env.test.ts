import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const moduleUrl = pathToFileURL(resolve("scripts/sonar-env.mjs")).href;

function runNodeModule(source: string): unknown {
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", source], {
      encoding: "utf8",
    }),
  ) as unknown;
}

describe("Sonar dotenv loader", () => {
  it("loads SONAR settings from .env without overriding exported values", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "reqraft-sonar-env-"));
    try {
      writeFileSync(
        resolve(directory, ".env"),
        [
          "SONAR_TOKEN=from-dotenv",
          "SONAR_PROJECT_KEY=reqraft-local",
          'SONAR_HOST_URL="https://sonar.example.test"',
        ].join("\n"),
      );

      const result = runNodeModule(`
        const { loadDotenv } = await import(${JSON.stringify(moduleUrl)});
        const env = { SONAR_TOKEN: "from-shell" };
        const loaded = loadDotenv(env, ${JSON.stringify(directory)});
        console.log(JSON.stringify({ env, loaded }));
      `);

      expect(result).toEqual({
        env: {
          SONAR_TOKEN: "from-shell",
          SONAR_PROJECT_KEY: "reqraft-local",
          SONAR_HOST_URL: "https://sonar.example.test",
        },
        loaded: {
          SONAR_TOKEN: "from-dotenv",
          SONAR_PROJECT_KEY: "reqraft-local",
          SONAR_HOST_URL: "https://sonar.example.test",
        },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("parses comments, quoted values and invalid lines", () => {
    const result = runNodeModule(`
      const { parseDotenv } = await import(${JSON.stringify(moduleUrl)});
      console.log(JSON.stringify(parseDotenv([
        "# comment",
        "SONAR_TOKEN='token value'",
        "SONAR_PROJECT_KEY=reqraft",
        "INVALID-KEY=ignored",
        "EMPTY=",
        "BROKEN"
      ].join("\\n"))));
    `);

    expect(result).toEqual({
      SONAR_TOKEN: "token value",
      SONAR_PROJECT_KEY: "reqraft",
      EMPTY: "",
    });
  });

  it("redacts tokens from scanner failures", () => {
    const result = runNodeModule(`
      const { formatSonarScanError, redactSecrets } = await import(${JSON.stringify(moduleUrl)});
      const env = { SONAR_TOKEN: "secret-token" };
      console.log(JSON.stringify({
        network: formatSonarScanError(
          Object.assign(new Error("getaddrinfo ENOTFOUND api.sonarcloud.io"), {
            code: "ENOTFOUND",
            hostname: "api.sonarcloud.io"
          }),
          env
        ),
        bearer: redactSecrets("Authorization: Bearer secret-token", env)
      }));
    `);

    expect(result).toEqual({
      network:
        "Impossible de joindre api.sonarcloud.io (ENOTFOUND). Vérifie la connexion réseau ou le DNS.",
      bearer: "Authorization: Bearer [redacted]",
    });
  });

  it("resolves scanner configuration before running Sonar", () => {
    const result = runNodeModule(`
      const { resolveSonarScanConfiguration } = await import(${JSON.stringify(moduleUrl)});
      console.log(JSON.stringify({
        missingToken: resolveSonarScanConfiguration({}),
        missingOrganization: resolveSonarScanConfiguration({
          SONAR_TOKEN: "token"
        }),
        cloud: resolveSonarScanConfiguration({
          SONAR_TOKEN: "token",
          SONAR_ORGANIZATION: "reqraft-org",
          SONAR_PROJECT_KEY: "reqraft-cloud"
        }),
        selfHosted: resolveSonarScanConfiguration({
          SONAR_TOKEN: "token",
          SONAR_HOST_URL: "https://sonarqube.example.test"
        })
      }));
    `);

    expect(result).toEqual({
      missingToken: {
        ok: false,
        message: "SONAR_TOKEN est requis pour lancer l’analyse SonarQube.",
      },
      missingOrganization: {
        ok: false,
        message:
          "SONAR_ORGANIZATION est requis pour SonarQube Cloud. Ajoute-le dans .env ou exporte-le dans le shell.",
      },
      cloud: {
        ok: true,
        token: "token",
        options: {
          "sonar.projectKey": "reqraft-cloud",
          "sonar.qualitygate.wait": "true",
          "sonar.organization": "reqraft-org",
        },
      },
      selfHosted: {
        ok: true,
        token: "token",
        serverUrl: "https://sonarqube.example.test",
        options: {
          "sonar.projectKey": "reqraft",
          "sonar.qualitygate.wait": "true",
        },
      },
    });
  });
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_PROJECT_KEY = "reqraft";
const QUALITY_GATE_WAIT = "true";

export function parseDotenv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    values[key] = unquoteValue(rawValue);
  }
  return values;
}

export function loadDotenv(env = process.env, cwd = process.cwd(), filename = ".env") {
  const filePath = resolve(cwd, filename);
  if (!existsSync(filePath)) {
    return {};
  }

  const values = parseDotenv(readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
  return values;
}

export function resolveSonarScanConfiguration(env = process.env) {
  const token = env.SONAR_TOKEN;
  if (!token) {
    return {
      ok: false,
      message: "SONAR_TOKEN est requis pour lancer l’analyse SonarQube.",
    };
  }

  const serverUrl = env.SONAR_HOST_URL || undefined;
  const organization = env.SONAR_ORGANIZATION;
  if (!serverUrl && !organization) {
    return {
      ok: false,
      message:
        "SONAR_ORGANIZATION est requis pour SonarQube Cloud. Ajoute-le dans .env ou exporte-le dans le shell.",
    };
  }

  const options = {
    "sonar.projectKey": env.SONAR_PROJECT_KEY ?? DEFAULT_PROJECT_KEY,
    "sonar.qualitygate.wait": QUALITY_GATE_WAIT,
  };
  if (organization) {
    options["sonar.organization"] = organization;
  }

  return { ok: true, token, serverUrl, options };
}

export function formatSonarScanError(error, env = process.env) {
  const code = readStringProperty(error, "code") ?? readStringProperty(error?.cause, "code");
  const hostname =
    readStringProperty(error, "hostname") ?? readStringProperty(error?.cause, "hostname");
  const message = error instanceof Error ? error.message : String(error);
  const summary =
    code === "ENOTFOUND" && hostname
      ? `Impossible de joindre ${hostname} (${code}). Vérifie la connexion réseau ou le DNS.`
      : message;

  return redactSecrets(summary, env);
}

export function redactSecrets(value, env = process.env) {
  let redacted = value.replaceAll(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
  const sonarToken = env.SONAR_TOKEN;
  if (sonarToken) {
    redacted = redacted.replaceAll(sonarToken, "[redacted]");
  }
  return redacted;
}

function unquoteValue(value) {
  if (value.length < 2) {
    return value;
  }

  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value.at(-1) !== quote) {
    return value;
  }

  const inner = value.slice(1, -1);
  return quote === '"' ? inner.replaceAll('\\"', '"').replaceAll("\\n", "\n") : inner;
}

function readStringProperty(value, property) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value;
  const propertyValue = record[property];
  return typeof propertyValue === "string" ? propertyValue : undefined;
}

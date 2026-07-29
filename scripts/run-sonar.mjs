import process from "node:process";
import { scan } from "@sonar/scan";
import { formatSonarScanError, loadDotenv, resolveSonarScanConfiguration } from "./sonar-env.mjs";

loadDotenv();

const configuration = resolveSonarScanConfiguration();
if (!configuration.ok) {
  console.error(configuration.message);
  process.exitCode = 1;
} else {
  try {
    await scan({
      serverUrl: configuration.serverUrl,
      token: configuration.token,
      options: configuration.options,
    });
  } catch (error) {
    console.error(`Analyse SonarQube échouée : ${formatSonarScanError(error)}`);
    process.exitCode = 1;
  }
}

import process from "node:process";
import { scan } from "@sonar/scan";

const token = process.env.SONAR_TOKEN;
if (!token) {
  console.error("SONAR_TOKEN est requis pour lancer l’analyse SonarQube.");
  process.exitCode = 1;
} else {
  const options = {
    "sonar.projectKey": process.env.SONAR_PROJECT_KEY ?? "reqraft",
    "sonar.qualitygate.wait": "true",
  };
  if (process.env.SONAR_ORGANIZATION) {
    options["sonar.organization"] = process.env.SONAR_ORGANIZATION;
  }

  await scan({
    serverUrl: process.env.SONAR_HOST_URL || undefined,
    token,
    options,
  });
}

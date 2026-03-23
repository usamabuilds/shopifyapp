import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const matrixPath = path.join(rootDir, "qa/phase1-scenarios.json");
const fixturesPath = path.join(rootDir, "qa/fixtures/scenario-fixtures.ts");
const reportPath = path.join(rootDir, "qa/PHASE1_VALIDATION_RESULTS.md");

const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const fixtureSource = fs.readFileSync(fixturesPath, "utf8");

const errors = [];
const rows = [];

for (const area of matrix.featureAreas ?? []) {
  for (const scenario of area.scenarios ?? []) {
    const missingEvidence = [];

    for (const file of scenario.evidenceFiles ?? []) {
      const filePath = path.join(rootDir, file);
      if (!fs.existsSync(filePath)) {
        missingEvidence.push(file);
      }
    }

    const status = missingEvidence.length === 0 ? "PASS" : "FAIL";

    if (status === "FAIL") {
      errors.push(`${scenario.id}: missing evidence file(s): ${missingEvidence.join(", ")}`);
    }

    rows.push({
      feature: area.feature,
      scenarioId: scenario.id,
      scenarioType: scenario.type,
      title: scenario.title,
      validationMethod: scenario.validationMethod,
      status,
      notes:
        status === "PASS"
          ? "Evidence files present for code-path review."
          : `Missing evidence file(s): ${missingEvidence.join(", ")}`,
    });
  }
}

const duplicateFixtureNames = [...fixtureSource.matchAll(/fixtureName:\s*"([^"]+)"/g)].map((match) => match[1]);
const declaredFixtureNames = [...fixtureSource.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]);

for (const fixtureName of duplicateFixtureNames) {
  if (!declaredFixtureNames.includes(fixtureName)) {
    errors.push(`duplicate suppression references unknown fixture '${fixtureName}'.`);
  }
}

const total = rows.length;
const passed = rows.filter((row) => row.status === "PASS").length;
const failed = rows.filter((row) => row.status === "FAIL").length;

const lines = [
  "# Phase 1 Scenario Validation Results",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Summary",
  "",
  `- Total scenarios validated: **${total}**`,
  `- Pass: **${passed}**`,
  `- Fail: **${failed}**`,
  "- Validation approach: static scenario matrix checks + evidence file verification + fixture reference checks.",
  "",
  "## Scenario-Level Results",
  "",
  "| Feature | Scenario ID | Type | Validation | Status | Notes |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.feature} | ${row.scenarioId} | ${row.scenarioType} | ${row.validationMethod} | ${row.status} | ${row.notes} |`,
  ),
  "",
  "## Known caveats",
  "",
  "- Scenario validation is code-path oriented and does not yet execute full runtime integration tests.",
  "- Outbound provider paths are still foundation-level; provider behavior requires staged environment validation.",
  "- Analytics/support pages are validated structurally, but not compared to a deterministic seeded QA dataset.",
];

if (errors.length > 0) {
  lines.push("", "## Errors", "", ...errors.map((error) => `- ${error}`));
}

fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

if (errors.length > 0) {
  console.error("Phase 1 scenario validation run failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Phase 1 scenario validation run complete. Scenarios=${total}, Report=${path.relative(rootDir, reportPath)}`);

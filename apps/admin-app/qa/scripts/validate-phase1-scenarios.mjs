import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const matrixPath = path.join(rootDir, "qa/phase1-scenarios.json");

const raw = fs.readFileSync(matrixPath, "utf8");
const matrix = JSON.parse(raw);

const requiredTypes = new Set(["happy_path", "edge_case", "failure_state"]);
const duplicateCapableFeatures = new Set([
  "order_confirmation",
  "order_status_updates",
  "cart_recovery",
  "broadcast_campaigns",
]);

const errors = [];

if (!Array.isArray(matrix.featureAreas) || matrix.featureAreas.length === 0) {
  errors.push("featureAreas must contain at least one feature area.");
}

for (const area of matrix.featureAreas ?? []) {
  const scenarios = Array.isArray(area.scenarios) ? area.scenarios : [];
  const foundTypes = new Set(scenarios.map((scenario) => scenario.type));

  for (const requiredType of requiredTypes) {
    if (!foundTypes.has(requiredType)) {
      errors.push(`${area.feature}: missing required scenario type '${requiredType}'.`);
    }
  }

  if (duplicateCapableFeatures.has(area.feature) && !foundTypes.has("duplicate_suppression")) {
    errors.push(`${area.feature}: expected duplicate_suppression scenario.`);
  }

  for (const scenario of scenarios) {
    if (!scenario.id || !scenario.id.includes("-")) {
      errors.push(`${area.feature}: scenario missing structured id.`);
    }

    if (!Array.isArray(scenario.evidenceFiles) || scenario.evidenceFiles.length === 0) {
      errors.push(`${scenario.id}: evidenceFiles are required.`);
      continue;
    }

    for (const relativeFile of scenario.evidenceFiles) {
      const filePath = path.join(rootDir, relativeFile);
      if (!fs.existsSync(filePath)) {
        errors.push(`${scenario.id}: evidence file not found -> ${relativeFile}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Phase 1 scenario validation failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const totalScenarios = matrix.featureAreas.reduce((acc, area) => acc + area.scenarios.length, 0);
console.log(`Phase 1 scenario validation passed. Areas=${matrix.featureAreas.length} Scenarios=${totalScenarios}`);

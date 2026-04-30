import type { GlossaryIssue } from "../tasks/glossary.js";

// SARIF 2.1.0 minimal output for yuuhitsu glossary check

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number };
    };
  }>;
}

interface SarifLog {
  version: "2.1.0";
  $schema: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        rules: Array<{ id: string; name: string; shortDescription: { text: string } }>;
      };
    };
    results: SarifResult[];
  }>;
}

function severityToLevel(severity: string): "error" | "warning" | "note" {
  if (severity === "block") return "error";
  if (severity === "auto-fix") return "note";
  return "warning";
}

export function formatSarif(
  issues: GlossaryIssue[],
  docPath: string,
  version = "0.1.10"
): string {
  const results: SarifResult[] = issues.map((issue) => ({
    ruleId: "yuuhitsu/glossary-violation",
    level: severityToLevel(issue.severity),
    message: {
      text: `Forbidden term "${issue.forbidden}" — use canonical "${issue.canonical}" instead.`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: docPath },
          region: { startLine: issue.line || 1 },
        },
      },
    ],
  }));

  const log: SarifLog = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "yuuhitsu",
            version,
            rules: [
              {
                id: "yuuhitsu/glossary-violation",
                name: "GlossaryViolation",
                shortDescription: { text: "Glossary terminology violation detected." },
              },
            ],
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(log, null, 2);
}

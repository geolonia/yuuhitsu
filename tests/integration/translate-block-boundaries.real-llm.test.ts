import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { ClaudeProvider } from "../../src/provider/claude.js";
import { translateFile } from "../../src/tasks/translate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

describe(
  "P-A4 <!--BB--> sentinel: real LLM integration (Claude Sonnet 4.6)",
  () => {
    let tempDir: string;
    let provider: ClaudeProvider;

    beforeAll(() => {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY is required for integration tests. " +
          "Set it before running 'npm run test:integration'. " +
          "See tests/INTEGRATION_TESTS.md for details."
        );
      }
      tempDir = join(tmpdir(), `yuuhitsu-sentinel-integration-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      provider = new ClaudeProvider("claude-sonnet-4-6");
    });

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    async function runTranslation(fixtureName: string): Promise<{
      input: string;
      output: string;
    }> {
      const inputPath = join(FIXTURES_DIR, `${fixtureName}.input.md`);
      const outputPath = join(tempDir, `${fixtureName}.ja.md`);
      const input = readFileSync(inputPath, "utf-8");

      await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });
      const output = readFileSync(outputPath, "utf-8");
      return { input, output };
    }

    function assertStructuralIntegrity(input: string, output: string, context: string): void {
      // No sentinel or variant patterns (including lowercase) in restored output
      expect(output, `${context}: should not contain <!--BB--> sentinel after restore`).not.toMatch(
        /<!--BB-->/i
      );
      expect(output, `${context}: should not contain sentinel variants after restore`).not.toMatch(
        /<!--\s*BB[a-zA-Z0-9_-]*\s*-->/i
      );

      // Translation completed — output should be non-empty and at least 30% of input length
      expect(output.trim().length, `${context}: output should be non-empty`).toBeGreaterThan(0);
      expect(
        output.length,
        `${context}: output should be at least 30% of input length`
      ).toBeGreaterThanOrEqual(Math.ceil(input.length * 0.3));
    }

    it(
      "fixture 1 (PR#155): list-list newlines preserved after LLM round-trip",
      async () => {
        const { input, output } = await runTranslation("p-a4-1");

        assertStructuralIntegrity(input, output, "fixture 1");

        // List items should be on separate lines
        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(
          listLines.length,
          "fixture 1: at least 2 list items should be on separate lines"
        ).toBeGreaterThanOrEqual(2);
      },
      60000
    );

    it(
      "fixture 2 (PR#161): macOS/Windows list + 4-backtick fence boundary preserved",
      async () => {
        const { input, output } = await runTranslation("p-a4-2");

        assertStructuralIntegrity(input, output, "fixture 2");

        // List items on separate lines
        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 2: list items on separate lines").toBeGreaterThanOrEqual(2);

        // Code fence preserved
        expect(output, "fixture 2: code fence should be preserved").toMatch(/```/);
      },
      60000
    );

    it(
      "fixture 3 (PR#166): 3-item JSON list newlines preserved",
      async () => {
        const { input, output } = await runTranslation("p-a4-3");

        assertStructuralIntegrity(input, output, "fixture 3");

        // 3 list items on separate lines
        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 3: 3 list items on separate lines").toBeGreaterThanOrEqual(3);
      },
      60000
    );

    it(
      "fixture 4 (PR#161): heading + inline-code + body structure preserved",
      async () => {
        const { input, output } = await runTranslation("p-a4-4");

        assertStructuralIntegrity(input, output, "fixture 4");

        // At least one heading on its own line
        const headingLines = output.split("\n").filter((l) => /^ {0,3}#{1,6}\s/.test(l));
        expect(headingLines.length, "fixture 4: headings on separate lines").toBeGreaterThanOrEqual(1);
      },
      60000
    );

    it(
      "fixture 5 (PR#155): hr + heading boundary preserved",
      async () => {
        const { input, output } = await runTranslation("p-a4-5");

        assertStructuralIntegrity(input, output, "fixture 5");

        // Horizontal rule on its own line
        const hrLines = output.split("\n").filter((l) => /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l));
        expect(hrLines.length, "fixture 5: horizontal rule on its own line").toBeGreaterThanOrEqual(1);

        // Heading after hr
        const headingLines = output.split("\n").filter((l) => /^ {0,3}#{1,6}\s/.test(l));
        expect(headingLines.length, "fixture 5: heading on its own line").toBeGreaterThanOrEqual(1);
      },
      60000
    );

    it(
      "fixture 6 (P-A4 v3): 2-item simple list preserved after LLM round-trip",
      async () => {
        const { input, output } = await runTranslation("p-a4-6");

        assertStructuralIntegrity(input, output, "fixture 6");

        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 6: at least 2 list items on separate lines").toBeGreaterThanOrEqual(2);
      },
      60000
    );

    it(
      "fixture 7 (P-A4 v3): ordered list (3 items) preserved after LLM round-trip",
      async () => {
        const { input, output } = await runTranslation("p-a4-7");

        assertStructuralIntegrity(input, output, "fixture 7");

        const orderedListLines = output.split("\n").filter((l) => /^\s*\d+\.\s/.test(l));
        expect(orderedListLines.length, "fixture 7: at least 3 ordered list items on separate lines").toBeGreaterThanOrEqual(3);
      },
      60000
    );

    it(
      "fixture 8 (P-A4 v3): nested list (2 levels) preserved after LLM round-trip",
      async () => {
        const { input, output } = await runTranslation("p-a4-8");

        assertStructuralIntegrity(input, output, "fixture 8");

        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 8: at least 3 list items (top + nested) on separate lines").toBeGreaterThanOrEqual(3);
      },
      60000
    );

    it(
      "fixture 9 (P-A4 v3): list + blank line + heading mix preserved",
      async () => {
        const { input, output } = await runTranslation("p-a4-9");

        assertStructuralIntegrity(input, output, "fixture 9");

        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 9: at least 3 list items on separate lines").toBeGreaterThanOrEqual(3);

        const headingLines = output.split("\n").filter((l) => /^ {0,3}#{1,6}\s/.test(l));
        expect(headingLines.length, "fixture 9: headings preserved on separate lines").toBeGreaterThanOrEqual(2);
      },
      60000
    );

    it(
      "fixture 10 (P-A4 v3): list + 4-backtick fence boundary preserved",
      async () => {
        const { input, output } = await runTranslation("p-a4-10");

        assertStructuralIntegrity(input, output, "fixture 10");

        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 10: at least 2 list items on separate lines").toBeGreaterThanOrEqual(2);

        expect(output, "fixture 10: code fence preserved").toMatch(/```/);
      },
      60000
    );

    it(
      "fixture 11 (P-A4 v3): long list (10+ items) preserved after LLM round-trip",
      async () => {
        const { input, output } = await runTranslation("p-a4-11");

        assertStructuralIntegrity(input, output, "fixture 11");

        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 11: at least 10 list items on separate lines").toBeGreaterThanOrEqual(10);
      },
      60000
    );

    it(
      "fixture 12 (P-A4 v3): list with inline code items preserved",
      async () => {
        const { input, output } = await runTranslation("p-a4-12");

        assertStructuralIntegrity(input, output, "fixture 12");

        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 12: at least 3 list items on separate lines").toBeGreaterThanOrEqual(3);
      },
      60000
    );

    it(
      "fixture 13 (P-A4 v3): mixed unordered + ordered list preserved",
      async () => {
        const { input, output } = await runTranslation("p-a4-13");

        assertStructuralIntegrity(input, output, "fixture 13");

        const unorderedLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(unorderedLines.length, "fixture 13: at least 2 unordered list items on separate lines").toBeGreaterThanOrEqual(2);

        const orderedLines = output.split("\n").filter((l) => /^\s*\d+\.\s/.test(l));
        expect(orderedLines.length, "fixture 13: at least 2 ordered list items on separate lines").toBeGreaterThanOrEqual(2);
      },
      60000
    );
  }
);

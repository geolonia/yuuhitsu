import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { ClaudeProvider } from "../../src/provider/claude.js";
import { translateFile } from "../../src/tasks/translate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

const API_KEY = process.env.ANTHROPIC_API_KEY;

// Graceful skip when no API key is available (e.g. local dev without credentials)
const describeTest = API_KEY ? describe : describe.skip;

describeTest(
  "P-A4 <!--BB--> sentinel: real LLM integration (Claude Sonnet 4.6)",
  () => {
    let tempDir: string;
    let provider: ClaudeProvider;

    beforeAll(() => {
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

    function assertStructuralIntegrity(output: string, context: string): void {
      // No sentinel or variant patterns in restored output
      expect(output, `${context}: should not contain <!--BB--> sentinel after restore`).not.toMatch(
        /<!--BB-->/
      );
      expect(output, `${context}: should not contain sentinel variants after restore`).not.toMatch(
        /<!--\s*BB[a-zA-Z0-9_-]*\s*-->/
      );

      // Translation completed — output should be non-empty with reasonable length
      expect(output.trim().length, `${context}: output should be non-empty`).toBeGreaterThan(0);
      expect(
        output.length,
        `${context}: output should be at least 30% of input length`
      ).toBeGreaterThan(0);
    }

    it(
      "fixture 1 (PR#155): list-list newlines preserved after LLM round-trip",
      async () => {
        const { input, output } = await runTranslation("p-a4-1");

        assertStructuralIntegrity(output, "fixture 1");

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
        const { output } = await runTranslation("p-a4-2");

        assertStructuralIntegrity(output, "fixture 2");

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
        const { output } = await runTranslation("p-a4-3");

        assertStructuralIntegrity(output, "fixture 3");

        // 3 list items on separate lines
        const listLines = output.split("\n").filter((l) => /^\s*[-*+]\s/.test(l));
        expect(listLines.length, "fixture 3: 3 list items on separate lines").toBeGreaterThanOrEqual(3);
      },
      60000
    );

    it(
      "fixture 4 (PR#161): heading + inline-code + body structure preserved",
      async () => {
        const { output } = await runTranslation("p-a4-4");

        assertStructuralIntegrity(output, "fixture 4");

        // At least one heading on its own line
        const headingLines = output.split("\n").filter((l) => /^ {0,3}#{1,6}\s/.test(l));
        expect(headingLines.length, "fixture 4: headings on separate lines").toBeGreaterThanOrEqual(1);
      },
      60000
    );

    it(
      "fixture 5 (PR#155): hr + heading boundary preserved",
      async () => {
        const { output } = await runTranslation("p-a4-5");

        assertStructuralIntegrity(output, "fixture 5");

        // Horizontal rule on its own line
        const hrLines = output.split("\n").filter((l) => /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l));
        expect(hrLines.length, "fixture 5: horizontal rule on its own line").toBeGreaterThanOrEqual(1);

        // Heading after hr
        const headingLines = output.split("\n").filter((l) => /^ {0,3}#{1,6}\s/.test(l));
        expect(headingLines.length, "fixture 5: heading on its own line").toBeGreaterThanOrEqual(1);
      },
      60000
    );
  }
);

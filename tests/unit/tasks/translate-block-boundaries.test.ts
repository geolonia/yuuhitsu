import { describe, it, expect } from "vitest";
import {
  BLOCK_BOUNDARY_SENTINEL,
  protectBlockBoundaries,
  restoreBlockBoundaries,
} from "../../../src/tasks/translate.js";

const BB = BLOCK_BOUNDARY_SENTINEL;

describe("protectBlockBoundaries", () => {
  it("inserts sentinel before unordered list items", () => {
    const input = "Some text\n- item A\n- item B";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`Some text\n${BB}\n- item A\n${BB}\n- item B`);
  });

  it("inserts sentinel before ordered list items", () => {
    const input = "Intro\n1. first\n2. second";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`Intro\n${BB}\n1. first\n${BB}\n2. second`);
  });

  it("inserts sentinel before headings (all levels)", () => {
    const input = "# H1\n## H2\n### H3";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`${BB}\n# H1\n${BB}\n## H2\n${BB}\n### H3`);
  });

  it("inserts sentinel before horizontal rules", () => {
    const input = "text\n---\nmore";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`text\n${BB}\n---\nmore`);
  });

  it("inserts sentinel before fenced code blocks", () => {
    const input = "text\n```json\n{}\n```\nend";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`text\n${BB}\n\`\`\`json\n{}\n${BB}\n\`\`\`\nend`);
  });

  it("does not insert sentinel before plain text or blank lines", () => {
    const input = "line one\n\nline two";
    const result = protectBlockBoundaries(input);
    expect(result).toBe("line one\n\nline two");
  });

  it("handles document starting with a structural element", () => {
    const input = "# Title\n\nSome text.";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`${BB}\n# Title\n\nSome text.`);
  });
});

describe("restoreBlockBoundaries", () => {
  it("round-trip: protect then restore returns original (list items)", () => {
    const original = "Some text\n- item A\n- item B";
    expect(restoreBlockBoundaries(protectBlockBoundaries(original))).toBe(original);
  });

  it("round-trip: protect then restore returns original (heading)", () => {
    const original = "Intro\n\n## Section\n\nBody text.";
    expect(restoreBlockBoundaries(protectBlockBoundaries(original))).toBe(original);
  });

  it("round-trip: protect then restore returns original (hr)", () => {
    const original = "Before\n\n---\n\nAfter";
    expect(restoreBlockBoundaries(protectBlockBoundaries(original))).toBe(original);
  });

  it("round-trip: heading at document start", () => {
    const original = "# Title\n\nBody.";
    expect(restoreBlockBoundaries(protectBlockBoundaries(original))).toBe(original);
  });

  it("returns content unchanged when no sentinel present", () => {
    const content = "plain text\nno structural elements";
    expect(restoreBlockBoundaries(content)).toBe(content);
  });

  it("restores newline from collapsed sentinel (PR#155 list-list pattern)", () => {
    // LLM collapsed: "- Status: `201 Created`- Status: `409 AlreadyExists`"
    // With sentinels (collapsed by LLM): sentinel inline instead of own line
    const brokenLLMOutput = `- Status: \`201 Created\`${BB}- Status: \`409 AlreadyExists\``;
    const restored = restoreBlockBoundaries(brokenLLMOutput);
    expect(restored).toBe("- Status: `201 Created`\n- Status: `409 AlreadyExists`");
  });

  it("restores newlines from 3-item collapsed list (PR#166 pattern)", () => {
    const brokenLLMOutput =
      `- \`{"type": "Property"}\`${BB}- \`{"type": "Relationship"}\`${BB}- \`{"type": "GeoProperty"}\``;
    const restored = restoreBlockBoundaries(brokenLLMOutput);
    expect(restored).toBe(
      '- `{"type": "Property"}`\n- `{"type": "Relationship"}`\n- `{"type": "GeoProperty"}`'
    );
  });

  it("restores newline from collapsed heading (PR#161 heading-inline-body pattern)", () => {
    const brokenLLMOutput = `## MCP ツール: \`data_models\`${BB}Smart Data Models の説明。`;
    const restored = restoreBlockBoundaries(brokenLLMOutput);
    expect(restored).toBe("## MCP ツール: `data_models`\nSmart Data Models の説明。");
  });

  it("restores newlines from hr+heading collapse (PR#155 hr-heading pattern)", () => {
    const brokenLLMOutput = `前の段落...${BB}---${BB}## プロトコル分離`;
    const restored = restoreBlockBoundaries(brokenLLMOutput);
    expect(restored).toBe("前の段落...\n---\n## プロトコル分離");
  });

  it("handles sentinel at document start (no preceding content)", () => {
    // Protect inserts sentinel before first structural element
    const protected_ = `${BB}\n# Title\n\nBody.`;
    const restored = restoreBlockBoundaries(protected_);
    expect(restored).toBe("# Title\n\nBody.");
  });

  it("handles consecutive sentinels (LLM duplication edge case)", () => {
    const input = `item A${BB}${BB}item B`;
    const restored = restoreBlockBoundaries(input);
    expect(restored).toBe("item A\nitem B");
  });
});

describe("P-A4 full round-trip fixtures", () => {
  it("PR#155: list-list newline preserved after round-trip", () => {
    const original = [
      "- Status: `201 Created`",
      "- Status: `409 AlreadyExists`",
    ].join("\n");
    const protected_ = protectBlockBoundaries(original);
    expect(protected_).toContain(BB);
    expect(restoreBlockBoundaries(protected_)).toBe(original);
  });

  it("PR#166: 3-item list newlines preserved after round-trip", () => {
    const original = [
      '- `{"type": "Property", "value": 25.5}`',
      '- `{"type": "Relationship", "object": "..."}`',
      '- `{"type": "GeoProperty", "value": {}}`',
    ].join("\n");
    const protected_ = protectBlockBoundaries(original);
    expect(protected_).toContain(BB);
    expect(restoreBlockBoundaries(protected_)).toBe(original);
  });

  it("PR#161: macOS/Windows list + fence boundary preserved", () => {
    const original = [
      "- **macOS**: `~/path`",
      "- **Windows**: `%APPDATA%\\path`",
      "",
      "```json",
      '{ "key": "value" }',
      "```",
    ].join("\n");
    const protected_ = protectBlockBoundaries(original);
    expect(protected_).toContain(BB);
    expect(restoreBlockBoundaries(protected_)).toBe(original);
  });

  it("PR#155: hr+heading boundary preserved after round-trip", () => {
    const original = "前の段落...\n\n---\n\n## プロトコル分離";
    const protected_ = protectBlockBoundaries(original);
    expect(protected_).toContain(BB);
    expect(restoreBlockBoundaries(protected_)).toBe(original);
  });

  it("PR#161: heading + body boundary preserved after round-trip", () => {
    const original = "## MCP ツール: `data_models`\n\nSmart Data Models の説明。";
    const protected_ = protectBlockBoundaries(original);
    expect(protected_).toContain(BB);
    expect(restoreBlockBoundaries(protected_)).toBe(original);
  });
});

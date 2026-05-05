import { describe, it, expect } from "vitest";
import {
  BLOCK_BOUNDARY_SENTINEL,
  protectBlockBoundaries,
  restoreBlockBoundaries,
} from "../../../src/tasks/translate.js";

const BB = BLOCK_BOUNDARY_SENTINEL;

describe("protectBlockBoundaries", () => {
  it("inserts DOUBLE sentinel BEFORE unordered list items (P-A4 v3)", () => {
    const input = "Some text\n- item A\n- item B";
    const result = protectBlockBoundaries(input);
    // Each list item: 2 sentinels before, none after (clean round-trip, no trailing \n)
    expect(result).toBe(
      `Some text\n${BB}\n${BB}\n- item A\n${BB}\n${BB}\n- item B`
    );
  });

  it("inserts DOUBLE sentinel BEFORE ordered list items (P-A4 v3)", () => {
    const input = "Intro\n1. first\n2. second";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(
      `Intro\n${BB}\n${BB}\n1. first\n${BB}\n${BB}\n2. second`
    );
  });

  it("inserts single sentinel before headings (unchanged from 0.1.16)", () => {
    const input = "# H1\n## H2\n### H3";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`${BB}\n# H1\n${BB}\n## H2\n${BB}\n### H3`);
  });

  it("inserts single sentinel before horizontal rules (unchanged from 0.1.16)", () => {
    const input = "text\n---\nmore";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`text\n${BB}\n---\nmore`);
  });

  it("inserts single sentinel before fenced code blocks (unchanged from 0.1.16)", () => {
    const input = "text\n```json\n{}\n```\nend";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`text\n${BB}\n\`\`\`json\n{}\n${BB}\n\`\`\`\nend`);
  });

  it("does not insert sentinel before plain text or blank lines", () => {
    const input = "line one\n\nline two";
    const result = protectBlockBoundaries(input);
    expect(result).toBe("line one\n\nline two");
  });

  it("handles document starting with a heading (single sentinel)", () => {
    const input = "# Title\n\nSome text.";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`${BB}\n# Title\n\nSome text.`);
  });

  it("inserts double sentinel before list, single before __CODE_BLOCK_N__", () => {
    const input = "- **macOS**: `~/path`\n\n__CODE_BLOCK_0__";
    const result = protectBlockBoundaries(input);
    expect(result).toContain(`${BB}\n${BB}\n- **macOS**`);
    expect(result).toContain(`${BB}\n__CODE_BLOCK_0__`);
    // CODE_BLOCK placeholder gets only single sentinel (not double)
    const beforeCodeBlock = result.split("__CODE_BLOCK_0__")[0];
    expect(beforeCodeBlock.endsWith(`${BB}\n`)).toBe(true);
    expect(beforeCodeBlock.endsWith(`${BB}\n${BB}\n`)).toBe(false);
  });

  it("inserts single sentinel before hr (asterisk ***) and hr (underscore ___)", () => {
    const input = "text\n***\n___\nend";
    const result = protectBlockBoundaries(input);
    expect(result).toBe(`text\n${BB}\n***\n${BB}\n___\nend`);
  });

  it("inserts single sentinel before tilde fenced code blocks", () => {
    const input = "text\n~~~yaml\nkey: value\n~~~\nend";
    const result = protectBlockBoundaries(input);
    expect(result).toContain(`${BB}\n~~~yaml`);
  });

  it("inserts double sentinel before indented list items (P-A4 v3)", () => {
    const input = "- parent\n  - child";
    const result = protectBlockBoundaries(input);
    // Both parent and child list items get double sentinel BEFORE
    expect(result).toContain(`${BB}\n${BB}\n- parent`);
    expect(result).toContain(`${BB}\n${BB}\n  - child`);
  });

  it("escapes pre-existing <!--BB--> in user content before inserting sentinels", () => {
    const input = `Some text with ${BB} literal\n- list item`;
    const result = protectBlockBoundaries(input);
    // Pre-existing <!--BB--> must not be treated as a sentinel
    // Sentinels: 2 before the list item = 2 sentinel splits, plus the escaped original = 3 parts
    expect(result.split(BB).length).toBe(3); // 2 sentinels + escaped literal = 3 parts
    // Original <!--BB--> is escaped and restorable
    const roundTrip = restoreBlockBoundaries(result);
    expect(roundTrip).toBe(input);
  });
});

describe("restoreBlockBoundaries", () => {
  it("round-trip: protect then restore returns original (list items)", () => {
    const original = "Some text\n- item A\n- item B";
    expect(restoreBlockBoundaries(protectBlockBoundaries(original))).toBe(original);
  });

  it("round-trip: protect then restore returns original (ordered list)", () => {
    const original = "Intro\n1. first\n2. second\n3. third";
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

  it("round-trip: nested list preserved", () => {
    const original = "- parent\n  - child A\n  - child B";
    expect(restoreBlockBoundaries(protectBlockBoundaries(original))).toBe(original);
  });

  it("returns content unchanged when no sentinel present", () => {
    const content = "plain text\nno structural elements";
    expect(restoreBlockBoundaries(content)).toBe(content);
  });

  it("restores newline from collapsed sentinel (PR#155 list-list pattern)", () => {
    // LLM collapsed: sentinel inline instead of own line
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
    const protected_ = `${BB}\n# Title\n\nBody.`;
    const restored = restoreBlockBoundaries(protected_);
    expect(restored).toBe("# Title\n\nBody.");
  });

  it("handles consecutive sentinels (double-sentinel from P-A4 v3)", () => {
    const input = `item A${BB}${BB}item B`;
    const restored = restoreBlockBoundaries(input);
    expect(restored).toBe("item A\nitem B");
  });
});

describe("restoreBlockBoundaries Layer 3 list-aware fallback (P-A4 v3)", () => {
  it("splits inline-concatenated unordered list items (- A- B → - A\\n- B)", () => {
    const collapsed = "- Item A- Item B";
    const restored = restoreBlockBoundaries(collapsed);
    expect(restored).toBe("- Item A\n- Item B");
  });

  it("splits inline-concatenated asterisk list items (* A* B)", () => {
    const collapsed = "* Item A* Item B";
    const restored = restoreBlockBoundaries(collapsed);
    expect(restored).toBe("* Item A\n* Item B");
  });

  it("splits inline-concatenated plus list items (+ A+ B)", () => {
    const collapsed = "+ Item A+ Item B";
    const restored = restoreBlockBoundaries(collapsed);
    expect(restored).toBe("+ Item A\n+ Item B");
  });

  it("splits inline-concatenated ordered list items (1. A2. B)", () => {
    const collapsed = "1. Step one2. Step two";
    const restored = restoreBlockBoundaries(collapsed);
    expect(restored).toBe("1. Step one\n2. Step two");
  });

  it("splits 3-item inline-concatenated list (- A- B- C)", () => {
    const collapsed = "- A- B- C";
    const restored = restoreBlockBoundaries(collapsed);
    expect(restored).toBe("- A\n- B\n- C");
  });

  it("does not falsely split prose with hyphens (non-list-start)", () => {
    // This line does NOT start with a list marker, so Layer 3 should not touch it
    const prose = "This is a note — important — remember.";
    expect(restoreBlockBoundaries(prose)).toBe(prose);
  });

  it("does not falsely split inline code containing dashes", () => {
    const code = "- Run `foo-bar --flag` to start";
    // The `--flag` inside backticks is already protected as a placeholder in real pipeline
    // Layer 3 regex: the `--` inside doesn't start a new list item (no whitespace after -)
    expect(restoreBlockBoundaries(code)).toBe(code);
  });
});

describe("restoreBlockBoundaries variant detection (3-pass fallback regex)", () => {
  it("normalizes <!-- BB --> (internal whitespace variant) via fallback", () => {
    const input = "text<!-- BB -->sentence";
    expect(restoreBlockBoundaries(input)).toBe("text\nsentence");
  });

  it("normalizes <!--BB__--> (underscore suffix variant) via fallback", () => {
    expect(restoreBlockBoundaries("text<!--BB__-->sentence")).toBe("text\nsentence");
  });

  it("normalizes <!--BBx--> (letter suffix variant) via fallback", () => {
    expect(restoreBlockBoundaries("text<!--BBx-->sentence")).toBe("text\nsentence");
  });

  it("normalizes <!--BB-x--> (hyphen suffix variant) via fallback", () => {
    expect(restoreBlockBoundaries("text<!--BB-x-->sentence")).toBe("text\nsentence");
  });

  it("normalizes <!--  BB  --> (multiple spaces variant) via fallback", () => {
    expect(restoreBlockBoundaries("text<!--  BB  -->sentence")).toBe("text\nsentence");
  });

  it("round-trip: protect then restore with <!-- BB --> variant returns original", () => {
    const original = "Some text\n- item A\n- item B";
    const protected_ = protectBlockBoundaries(original);
    // Simulate LLM outputting internal-whitespace variant
    const withVariant = protected_.replace(/<!--BB-->/g, "<!-- BB -->");
    expect(restoreBlockBoundaries(withVariant)).toBe(original);
  });

  it("round-trip: protect then restore with <!--BB__--> variant returns original", () => {
    const original = "Intro\n## Section\n\nBody.";
    const protected_ = protectBlockBoundaries(original);
    const withVariant = protected_.replace(/<!--BB-->/g, "<!--BB__-->");
    expect(restoreBlockBoundaries(withVariant)).toBe(original);
  });

  it("exact sentinel is unaffected by fallback pass (no double-processing)", () => {
    // Double-sentinel (P-A4 v3 format) restores correctly
    const input = `${BB}\n${BB}\n- item A\n${BB}\n${BB}\n- item B`;
    const restored = restoreBlockBoundaries(input);
    expect(restored).toBe("- item A\n- item B");
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

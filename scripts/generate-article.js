/**
 * Daily Article Generator for Tax Dispute Resolution Insight
 *
 * Uses Claude API to generate a new article on international tax topics,
 * saves it as a Hugo-compatible Markdown file in content/insights/.
 *
 * Required env var: ANTHROPIC_API_KEY
 * Optional env vars: ANTHROPIC_MODEL (default: claude-haiku-4-5-20251001)
 */

const fs = require("fs");
const path = require("path");
const { Anthropic } = require("@anthropic-ai/sdk");

// ── Config ──────────────────────────────────────────────────────────
const CONTENT_DIR = path.resolve(__dirname, "..", "content", "insights");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// Valid Hugo tags for this site
const VALID_TAGS = [
  "International Tax",
  "Tax Disputes",
  "Cross-Border Compliance",
];

// ── Helpers ─────────────────────────────────────────────────────────

/** Convert a title string to a URL-safe slug */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 80);
}

/** Read existing article titles to avoid duplicates */
function getExistingTitles() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, f), "utf-8");
      const match = raw.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const fm = match[1];
        const titleMatch = fm.match(/title:\s*"?(.+?)"?$/m);
        return titleMatch ? titleMatch[1].trim() : null;
      }
      return null;
    })
    .filter(Boolean);
}

/** Validate that parsed frontmatter has the required fields */
function validateFrontmatter(fm) {
  const errors = [];
  if (!fm.title || fm.title.length < 10)
    errors.push("Title missing or too short (< 10 chars)");
  if (!fm.date || !/^\d{4}-\d{2}-\d{2}$/.test(fm.date))
    errors.push("Date missing or wrong format (need YYYY-MM-DD)");
  if (!fm.tags || !Array.isArray(fm.tags) || fm.tags.length === 0)
    errors.push("Tags missing or empty");
  if (!VALID_TAGS.includes(fm.tags[0]))
    errors.push(`Tag "${fm.tags[0]}" not in valid tags: ${VALID_TAGS.join(", ")}`);
  if (!fm.excerpt || fm.excerpt.length < 30)
    errors.push("Excerpt missing or too short (< 30 chars)");
  return errors;
}

// ── Prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(existingTitles) {
  const titlesBlock = existingTitles.length
    ? `\n\nEXISTING ARTICLES (DO NOT repeat these topics):\n${existingTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  return `You are a senior international tax attorney writing for a professional blog called "China Tax Dispute Resolution Insight". The blog covers international tax enforcement, cross-border compliance, tax dispute resolution, FATCA, FBAR, voluntary disclosure, tax audits, transfer pricing, treaty interpretation, and related topics.

YOUR TASK: Write a single, original, substantive blog article (≈500-800 words) on an international tax topic relevant to 2026.${titlesBlock}

RULES:
- Write in professional English suitable for tax professionals, corporate counsel, and sophisticated taxpayers.
- Use a practical, actionable tone — provide concrete guidance, not just theory.
- Include proper markdown formatting: ## subheadings, **bold**, and where relevant, bullet lists.
- Include at least one concrete statutory reference, case name, regulatory cite, or data point.
- Vary your topic — don't always write about the same subject. Rotate through themes: enforcement trends, practical guides, jurisdiction comparisons, legislative developments, compliance strategies.
- Frontmatter MUST use exactly 3 fields for tags. Use ONLY these exact tag values: "International Tax", "Tax Disputes", "Cross-Border Compliance".

OUTPUT FORMAT — output ONLY valid content, no preamble or explanation:

---
title: "Your Descriptive Title Here (60-90 chars)"
date: YYYY-MM-DD
tags: ["One of: International Tax, Tax Disputes, Cross-Border Compliance"]
excerpt: "A compelling 1-2 sentence summary that makes readers want to click, max 180 characters."
---

Article body in clean GitHub-flavored markdown here. Open with a strong lead paragraph. Use ## subheadings. End with a concluding section.`;
}

function buildUserMessage() {
  const today = new Date().toISOString().split("T")[0];
  return `Write a fresh, original article for ${today}. Pick a topic you haven't seen in the existing articles list above. Make it specific and substantive — not generic.`;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("📋 Checking existing articles...");
  const existingTitles = getExistingTitles();
  console.log(`   Found ${existingTitles.length} existing articles`);

  console.log(`🤖 Calling Claude API (model: ${MODEL})...`);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.8,
    system: buildSystemPrompt(existingTitles),
    messages: [{ role: "user", content: buildUserMessage() }],
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("No text block in Claude response");
  }
  const rawOutput = textBlock.text.trim();
  console.log(`   Received ${rawOutput.length} characters`);

  // Parse frontmatter + body
  const fmMatch = rawOutput.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    console.error("❌ Could not parse frontmatter. Raw output:");
    console.error(rawOutput.substring(0, 800));
    throw new Error("Output does not contain valid YAML frontmatter delimited by ---");
  }

  const fmRaw = fmMatch[1];
  const body = fmMatch[2].trim();

  // Manual parse of simple YAML frontmatter (no library needed for this simple case)
  const fm = {};
  const titleMatch = fmRaw.match(/^title:\s*"?(.+?)"?$/m);
  const dateMatch = fmRaw.match(/^date:\s*"?(.+?)"?$/m);
  const tagsMatch = fmRaw.match(/^tags:\s*\[(.+?)\]$/m);
  const excerptMatch = fmRaw.match(/^excerpt:\s*"?(.+?)"?$/m);

  fm.title = titleMatch ? titleMatch[1].trim() : null;
  fm.date = dateMatch ? dateMatch[1].trim() : new Date().toISOString().split("T")[0];
  fm.tags = tagsMatch
    ? tagsMatch[1].split(",").map((t) => t.trim().replace(/^"|"$/g, ""))
    : [];
  fm.excerpt = excerptMatch ? excerptMatch[1].trim() : null;

  // If date not in correct format, use today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) {
    fm.date = new Date().toISOString().split("T")[0];
  }

  console.log(`\n📝 Generated article:`);
  console.log(`   Title:   ${fm.title}`);
  console.log(`   Date:    ${fm.date}`);
  console.log(`   Tag:     ${fm.tags[0] || "N/A"}`);
  console.log(`   Excerpt: ${fm.excerpt?.substring(0, 80)}...`);

  // Validate
  const errors = validateFrontmatter(fm);
  if (errors.length > 0) {
    console.error("\n❌ Validation errors:");
    errors.forEach((e) => console.error(`   - ${e}`));
    // Try to fix: set a valid tag if missing
    if (!fm.tags || fm.tags.length === 0 || !VALID_TAGS.includes(fm.tags[0])) {
      fm.tags = [VALID_TAGS[Math.floor(Math.random() * VALID_TAGS.length)]];
      console.log(`   🔧 Auto-fixed tag → "${fm.tags[0]}"`);
    }
    if (!fm.date || !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) {
      fm.date = new Date().toISOString().split("T")[0];
      console.log(`   🔧 Auto-fixed date → "${fm.date}"`);
    }
    // Re-validate after fixes
    const remainingErrors = validateFrontmatter(fm);
    if (remainingErrors.length > 0) {
      throw new Error(`Unfixable validation errors: ${remainingErrors.join("; ")}`);
    }
  }

  // Check for duplicate title
  if (existingTitles.some((t) => t.toLowerCase() === fm.title.toLowerCase())) {
    console.log("⚠️  Duplicate title detected, appending date suffix...");
    fm.title = `${fm.title} (${fm.date})`;
  }

  // Generate filename
  const slug = slugify(fm.title);
  const filename = `${slug}.md`;
  const filepath = path.join(CONTENT_DIR, filename);

  // Rebuild clean frontmatter
  const cleanFm = `---
title: "${fm.title.replace(/"/g, '\\"')}"
date: ${fm.date}
tags: [${fm.tags.map((t) => `"${t}"`).join(", ")}]
excerpt: "${fm.excerpt.replace(/"/g, '\\"')}"
---`;

  const fileContent = `${cleanFm}\n\n${body}\n`;

  // Write file
  fs.writeFileSync(filepath, fileContent, "utf-8");
  console.log(`\n✅ Article saved: content/insights/${filename}`);
  console.log(`   File size: ${Buffer.byteLength(fileContent)} bytes`);

  // Output the filename for GitHub Actions to use
  process.stdout.write(`::set-output name=article_file::content/insights/${filename}\n`);
  process.stdout.write(`::set-output name=article_title::${fm.title}\n`);
}

main().catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  process.exit(1);
});

/**
 * fetch-data.js
 *
 * Downloads ability card and item data from the any2cards/worldhaven repo and
 * writes filtered, bot-ready JSON files to data/. Run this manually whenever
 * you want to pull in upstream card updates.
 *
 * Usage:
 *   node scripts/fetch-data.js
 *
 * Reads WORLDHAVEN_REF from .env (or environment) to pin to a specific commit.
 * Defaults to "master" if not set.
 */

require("dotenv").config();
const fs   = require("fs");
const path = require("path");

const WORLDHAVEN_REF = process.env.WORLDHAVEN_REF || "master";
const FH_RAW     = `https://raw.githubusercontent.com/any2cards/worldhaven/${WORLDHAVEN_REF}`;
const IMAGE_BASE = `${FH_RAW}/images`;
const DATA_DIR   = path.join(__dirname, "..", "data");

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

// Title-cases a string, keeping common short words lowercase unless they are
// the first word (e.g. "tome of power" → "Tome of Power").
const TITLE_STOP_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "at", "by", "from", "in", "into", "of", "off", "on", "onto", "out", "over", "to", "up", "with",
]);

function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      const cased = (i === 0 || !TITLE_STOP_WORDS.has(word))
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word;
      return cased.replace(/-([a-z])/g, (_, c) => "-" + c.toUpperCase());
    })
    .join(" ");
}

async function fetchAbilityCards() {
  console.log("Fetching ability cards from worldhaven...");
  const cards = await fetchJson(`${FH_RAW}/data/character-ability-cards.js`);
  const index = [];

  for (const card of cards) {
    if (card.expansion !== "frosthaven") continue;
    const name = card.name || "";
    if (/^\d+$/.test(name)) continue;                    // skip numeric-name duplicates
    if ((card.image || "").includes("-back.")) continue;  // skip card backs
    if (!name) continue;

    // Store path as "CLASS/filename.jpeg" to match cmlenius image layout (uppercase subdir, jpeg).
    // e.g. "character-ability-cards/frosthaven/bb/fh-blurry-jab.png" → "BB/fh-blurry-jab.jpeg"
    let imageUrl = null;
    if (card.image) {
      const parts = card.image.split("/");
      const classDir = parts[parts.length - 2].toUpperCase();
      const filename = parts[parts.length - 1].replace(/\.png$/, ".jpeg");
      imageUrl = `${classDir}/${filename}`;
    }

    index.push({
      name:     toTitleCase(name),
      class:    card["character-xws"] || "Unknown",
      level:    card.level ?? "?",
      imageUrl,
    });
  }

  const outPath = path.join(DATA_DIR, "ability-cards.json");
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
  console.log(`  Wrote ${index.length} ability cards → data/ability-cards.json`);
}

async function fetchItems() {
  console.log("Fetching items from worldhaven...");
  const items = await fetchJson(`${FH_RAW}/data/items.js`);
  const index = [];
  const seenNames = new Set();

  for (const item of items) {
    if (item.expansion !== "frosthaven") continue;
    const name = item.name || "";
    if (name.toLowerCase().startsWith("item ")) continue; // skip "item 1" aliases
    if (/^\d+$/.test(name)) continue;                     // skip asset number aliases
    if (item.assetno === "####") continue;                 // skip back images
    if (!name) continue;
    if (seenNames.has(name)) continue;                    // skip a/b variant duplicates
    seenNames.add(name);

    const itemNumMatch = (item.image || "").match(/fh-(\d+)/);

    // Normalize to match the cmlenius/gloomhaven-card-browser image filenames:
    //   - strip single-letter variant suffix after item number (e.g. fh-051a- → fh-051-)
    //   - change extension from .png to .jpeg
    const rawFilename = item.image ? item.image.split("/").pop() : null;
    const filename = rawFilename
      ? rawFilename.replace(/(fh-\d+)[a-z](-)/,"$1$2").replace(/\.png$/, ".jpeg")
      : null;

    index.push({
      name:       toTitleCase(name),
      itemNumber: itemNumMatch ? parseInt(itemNumMatch[1], 10) : null,
      imageUrl:   filename,
    });
  }

  const outPath = path.join(DATA_DIR, "items.json");
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
  console.log(`  Wrote ${index.length} items → data/items.json`);
}

(async () => {
  console.log(`Using worldhaven ref: ${WORLDHAVEN_REF}`);
  try {
    await fetchAbilityCards();
    await fetchItems();
    console.log("Done.");
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
})();

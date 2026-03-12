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

    index.push({
      name,
      class: card["character-xws"] || "Unknown",
      level: card.level ?? "?",
      id:    card.xws || name,
      imageUrl: card.image ? `${IMAGE_BASE}/${card.image}` : null,
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

    index.push({
      name,
      id:         item.xws || item.assetno || name,
      itemNumber: itemNumMatch ? parseInt(itemNumMatch[1], 10) : null,
      imageUrl:   item.image ? `${IMAGE_BASE}/${item.image}` : null,
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

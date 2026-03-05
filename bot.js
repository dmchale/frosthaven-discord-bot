/**
 * Frosthaven Card Lookup Discord Bot
 *
 * Commands:
 *   /card <name>   - Look up a Frosthaven ability card by name (fuzzy match)
 *   /item <name>   - Look up a Frosthaven item card by name (fuzzy match)
 *
 * Setup:
 *   npm install discord.js @discordjs/rest discord-api-types fuse.js node-fetch
 *   Set DISCORD_TOKEN and CLIENT_ID in .env (or environment variables)
 *   Run: node deploy-commands.js  (once, to register slash commands)
 *   Run: node bot.js
 */

require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const Fuse = require("fuse.js");
const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));

// ─── Config ──────────────────────────────────────────────────────────────────

// Data from any2cards/worldhaven (the renamed/continued frosthaven repo)
const FH_RAW =
  "https://raw.githubusercontent.com/any2cards/worldhaven/master";

const IMAGE_BASE = `${FH_RAW}/images`;

// ─── Card index (populated on startup) ───────────────────────────────────────

let abilityIndex = []; // { name, class, level, id, imageUrl }
let itemIndex = [];    // { name, id, imageUrl }
let abilityFuse = null;
let itemFuse = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function buildCardIndex() {
  console.log("Building card index from any2cards/worldhaven...");

  // ── Ability cards ──────────────────────────────────────────────────────────
  // The data file is a flat JSON array. Each card has character-xws for class.
  // Each card appears multiple times with different name aliases (points 0,1,2…).
  // We keep only the canonical entry (points === 0).
  try {
    const cards = await fetchJson(`${FH_RAW}/data/character-ability-cards.js`);

    // Each card appears twice: once with the real name, once with the asset number
    // as the name. Also skip card-back images. Filter to Frosthaven only.
    for (const card of cards) {
      if (card.expansion !== "frosthaven") continue;
      const name = card.name || "";
      if (/^\d+$/.test(name)) continue;          // skip numeric-name duplicates
      if ((card.image || "").includes("-back.")) continue; // skip card backs
      if (!name) continue;

      const imageUrl = card.image
        ? `${IMAGE_BASE}/${card.image}`
        : null;

      abilityIndex.push({
        name,
        class: card["character-xws"] || "Unknown",
        level: card.level ?? "?",
        id: card.xws || name,
        imageUrl,
      });
    }
    console.log(`  Loaded ${abilityIndex.length} ability cards.`);
  } catch (err) {
    console.warn("Could not load ability cards:", err.message);
  }

  // ── Item cards ─────────────────────────────────────────────────────────────
  try {
    const items = await fetchJson(`${FH_RAW}/data/items.js`);

    // Items have many alias entries ("item 1", "item 01", asset numbers, back images).
    // Keep only entries with real names for Frosthaven.
    for (const item of items) {
      if (item.expansion !== "frosthaven") continue;
      const name = item.name || "";
      if (name.toLowerCase().startsWith("item ")) continue; // skip "item 1" aliases
      if (/^\d+$/.test(name)) continue;                     // skip asset number aliases
      if (item.assetno === "####") continue;                 // skip back images
      if (!name) continue;

      const imageUrl = item.image
        ? `${IMAGE_BASE}/${item.image}`
        : null;

      itemIndex.push({
        name,
        id: item.xws || item.assetno || name,
        imageUrl,
      });
    }
    console.log(`  Loaded ${itemIndex.length} items.`);
  } catch (err) {
    console.warn("Could not load items:", err.message);
  }

  // ── Fuse.js fuzzy search setup ─────────────────────────────────────────────
  const fuseOpts = {
    keys: ["name"],
    threshold: 0.35,
    includeScore: true,
  };
  abilityFuse = new Fuse(abilityIndex, fuseOpts);
  itemFuse    = new Fuse(itemIndex, fuseOpts);

  console.log(
    `Index ready: ${abilityIndex.length} ability cards, ${itemIndex.length} items.`
  );
}

// ─── Discord client ───────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  await buildCardIndex();
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "card") {
    await handleCardLookup(interaction, "ability");
  } else if (commandName === "item") {
    await handleCardLookup(interaction, "item");
  }
});

// ─── Lookup handler ───────────────────────────────────────────────────────────

async function handleCardLookup(interaction, type) {
  const query = interaction.options.getString("name");
  await interaction.deferReply();

  const fuse = type === "ability" ? abilityFuse : itemFuse;

  if (!fuse) {
    return interaction.editReply(
      "Card index is still loading, please try again in a moment."
    );
  }

  const results = fuse.search(query, { limit: 5 });

  if (!results.length) {
    return interaction.editReply(
      `No ${type === "ability" ? "ability card" : "item"} found matching **${query}**.`
    );
  }

  const best = results[0].item;

  // Build embed
  const embed = new EmbedBuilder()
    .setColor(type === "ability" ? 0x4a90d9 : 0xe8a838)
    .setTitle(best.name)
    .setImage(best.imageUrl)
    .setFooter({ text: "Frosthaven • Worldhaven Card Database" });

  if (type === "ability") {
    embed.addFields(
      { name: "Class", value: String(best.class), inline: true },
      { name: "Level", value: String(best.level), inline: true }
    );
  }

  // If there were close alternates, list them
  if (results.length > 1) {
    const alts = results
      .slice(1)
      .map((r) => `• ${r.item.name}`)
      .join("\n");
    embed.addFields({ name: "Did you mean…?", value: alts });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ─── Login ────────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("ERROR: DISCORD_TOKEN environment variable is not set.");
  process.exit(1);
}
client.login(token);

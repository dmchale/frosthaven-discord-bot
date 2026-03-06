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
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
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
let eventIndex = [];   // { id, type, season, number, title, text, optionA, optionB, frontUrl, backUrl }
let abilityFuse = null;
let itemFuse = null;
let eventFuse = null;

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

  // ── Event cards (local data/events.json) ───────────────────────────────────
  try {
    const raw = fs.readFileSync(path.join(__dirname, "data", "events.json"), "utf8");
    const events = JSON.parse(raw);

    for (const ev of events) {
      eventIndex.push({
        id:       ev.id,
        type:     ev.type,
        season:   ev.season,
        number:   ev.number,
        title:    ev.front.title,
        text:     ev.front.text,
        optionA:  ev.front.optionA,
        optionB:  ev.front.optionB,
        optionC:  ev.front.optionC,
        frontUrl: `${IMAGE_BASE}/${ev.front.image}`,
        backUrl:  `${IMAGE_BASE}/${ev.back.image}`,
      });
    }
    console.log(`  Loaded ${eventIndex.length} events.`);
  } catch (err) {
    console.warn("Could not load events:", err.message);
  }

  // ── Fuse.js fuzzy search setup ─────────────────────────────────────────────
  const fuseOpts = {
    keys: ["name"],
    threshold: 0.35,
    includeScore: true,
  };
  abilityFuse = new Fuse(abilityIndex, fuseOpts);
  itemFuse    = new Fuse(itemIndex, fuseOpts);

  // Events search across all front-of-card text fields.
  // ignoreLocation is critical — without it Fuse.js only matches near the
  // start of a string and misses phrases buried in longer text fields.
  eventFuse = new Fuse(eventIndex, {
    keys: [
      { name: "title",   weight: 3 },
      { name: "text",    weight: 2 },
      { name: "optionA", weight: 1 },
      { name: "optionB", weight: 1 },
      { name: "optionC", weight: 1 },
    ],
    threshold: 0.35,
    includeScore: true,
    ignoreLocation: true,
  });

  console.log(
    `Index ready: ${abilityIndex.length} ability cards, ${itemIndex.length} items, ${eventIndex.length} events.`
  );
}

// ─── Discord client ───────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("error", (err) => {
  console.error("Discord client error:", err.message);
});

client.once("ready", async () => {
  await buildCardIndex();
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    if (commandName === "card") {
      await handleCardLookup(interaction, "ability");
    } else if (commandName === "item") {
      await handleCardLookup(interaction, "item");
    } else if (commandName === "event") {
      await handleEventLookup(interaction);
    } else if (commandName === "boat") {
      await handleEventLookup(interaction, "boat");
    } else if (commandName === "road") {
      await handleEventLookup(interaction, "road");
    } else if (commandName === "outpost") {
      await handleEventLookup(interaction, "outpost");
    }
  } catch (err) {
    console.error(`Error handling /${commandName}:`, err.message);
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

// ─── Event lookup handler ─────────────────────────────────────────────────────

async function handleEventLookup(interaction, typeOverride = null) {
  const query  = interaction.options.getString("query");
  const type   = typeOverride ?? interaction.options.getString("type"); // boat | road | outpost | null
  const season = interaction.options.getString("season"); // summer | winter | null

  await interaction.deferReply();

  if (!eventFuse) {
    return interaction.editReply("Event index is still loading, please try again in a moment.");
  }

  // Warn if the entire index has no text yet (all stubs)
  const hasText = eventIndex.some(e => e.title || e.text || e.optionA || e.optionB);
  if (!hasText) {
    return interaction.editReply("Event text hasn't been filled in yet — the data file is still all stubs.");
  }

  // Run fuzzy search then apply optional filters
  let results = eventFuse.search(query, { limit: 20 });

  if (type)   results = results.filter(r => r.item.type === type);
  // Boat events have no season — ignore season filter if type is boat
  if (season && type !== "boat") results = results.filter(r => r.item.season === season);

  results = results.slice(0, 5);

  if (!results.length) {
    const filters = [type, season].filter(Boolean).join(", ");
    const filterNote = filters ? ` (filtered to: ${filters})` : "";
    return interaction.editReply(`No event found matching **${query}**${filterNote}.`);
  }

  const best = results[0].item;

  // Build a label like "Road Event 12 (Summer)" or "Boat Event 3"
  const typeLabel   = best.type.charAt(0).toUpperCase() + best.type.slice(1);
  const seasonLabel = best.season ? ` (${best.season.charAt(0).toUpperCase() + best.season.slice(1)})` : "";
  const cardLabel   = `${typeLabel} Event ${best.number}${seasonLabel}`;

  const color = best.type === "boat" ? 0x1e6fa8 : best.type === "road" ? 0x5a8a3c : 0xa85c1e;

  const frontEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(best.title ? `${cardLabel} — ${best.title}` : cardLabel)
    .setImage(best.frontUrl)
    .setFooter({ text: "Frosthaven • Worldhaven Card Database" });


  const backRes = await fetch(best.backUrl);
  const backBuffer = Buffer.from(await backRes.arrayBuffer());
  const backAttachment = new AttachmentBuilder(backBuffer, { name: "SPOILER_back.png" });

  await interaction.editReply({ embeds: [frontEmbed], files: [backAttachment] });
}

// ─── Login ────────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("ERROR: DISCORD_TOKEN environment variable is not set.");
  process.exit(1);
}
client.login(token);

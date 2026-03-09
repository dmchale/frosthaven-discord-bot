/**
 * Frosthaven Card Lookup Discord Bot
 *
 * Commands:
 *   /card <name>      - Look up a Frosthaven ability card by name (fuzzy match)
 *   /item <name>      - Look up a Frosthaven item card by name (fuzzy match)
 *   /event <query>    - Look up any event card by text (type/season filters optional)
 *   /boat <query>     - Look up a boat event card by text
 *   /road <query>     - Look up a road event card by text (season filter optional)
 *   /outpost <query>  - Look up an outpost event card by text (season filter optional)
 *   /class <query>    - Browse ability cards by class and level
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
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Fuse = require("fuse.js");

// ─── Config ──────────────────────────────────────────────────────────────────

// Data from any2cards/worldhaven (the renamed/continued frosthaven repo)
// Pin WORLDHAVEN_REF to a specific commit SHA in .env for stability,
// or leave unset to always use the latest master.
const WORLDHAVEN_REF = process.env.WORLDHAVEN_REF || "master";
const FH_RAW = `https://raw.githubusercontent.com/any2cards/worldhaven/${WORLDHAVEN_REF}`;

const IMAGE_BASE = `${FH_RAW}/images`;

// Default ephemeral setting for all command replies.
//   Unset or "true":  replies are ephemeral by default (only visible to the invoking user)
//   "false":          replies are public by default
// The per-command `ephemeral` boolean option overrides this — subject to EPHEMERAL_ADMIN_IDS below.
const DEFAULT_EPHEMERAL = process.env.DEFAULT_EPHEMERAL !== "false";

// When DEFAULT_EPHEMERAL is true, only users in this list may pass `ephemeral: false` to post
// a result publicly. Empty = nobody may override (all results are always ephemeral).
const EPHEMERAL_ADMIN_IDS = process.env.EPHEMERAL_ADMIN_IDS
  ? process.env.EPHEMERAL_ADMIN_IDS.split(",").map(id => id.trim()).filter(Boolean)
  : [];

// Back-card image cache TTL in hours.
//   Unset or empty: default to 168 (7 days)
//   0:  cache never expires
//  -1:  never cache
//   N:  cache for N hours
const _cacheTtlEnv = process.env.CACHE_TTL_HOURS;
const CACHE_TTL_HOURS =
  _cacheTtlEnv !== undefined && _cacheTtlEnv !== ""
    ? parseInt(_cacheTtlEnv, 10)
    : 168;

// ─── Card index (populated on startup) ───────────────────────────────────────

const backImageCache = new Map(); // url → { buffer: Buffer, cachedAt: number }

let abilityIndex = []; // { name, class, level, id, imageUrl }
let itemIndex = [];    // { name, id, imageUrl }
let eventIndex = [];   // { id, type, season, number, title, text, optionA, optionB, frontUrl, backUrl }
let classList = [];        // { name, xws, code, aliases? }
let classAutocomplete = []; // { name, value } flat list for autocomplete
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
    const seenItemNames = new Set();

    // Items have many alias entries ("item 1", "item 01", asset numbers, back images).
    // Some items have a/b variants with the same name — keep only the first occurrence.
    for (const item of items) {
      if (item.expansion !== "frosthaven") continue;
      const name = item.name || "";
      if (name.toLowerCase().startsWith("item ")) continue; // skip "item 1" aliases
      if (/^\d+$/.test(name)) continue;                     // skip asset number aliases
      if (item.assetno === "####") continue;                 // skip back images
      if (!name) continue;
      if (seenItemNames.has(name)) continue;                 // skip a/b variant duplicates
      seenItemNames.add(name);

      const imageUrl = item.image
        ? `${IMAGE_BASE}/${item.image}`
        : null;

      // Extract in-game item number from image filename (e.g. "fh-056a-..." → "056")
      const itemNumMatch = (item.image || "").match(/fh-(\d+)/);
      const itemNumber = itemNumMatch ? parseInt(itemNumMatch[1], 10) : null;

      itemIndex.push({
        name,
        id: item.xws || item.assetno || name,
        itemNumber,
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
        frontUrl: `${IMAGE_BASE}/events/frosthaven/${ev.front.image}`,
        backUrl:  `${IMAGE_BASE}/events/frosthaven/${ev.back.image}`,
      });
    }
    console.log(`  Loaded ${eventIndex.length} events.`);
  } catch (err) {
    console.warn("Could not load events:", err.message);
  }

  // ── Class list (local data/classes.json) ───────────────────────────────────
  try {
    const raw = fs.readFileSync(path.join(__dirname, "data", "classes.json"), "utf8");
    classList = JSON.parse(raw);

    // Build flat autocomplete list: "All Cards" + each level per class
    const levels = ["1", "X", "2", "3", "4", "5", "6", "7", "8", "9"];
    for (const c of classList) {
      classAutocomplete.push({ name: `${c.name} — All Cards`, value: `${c.xws}|all` });
      for (const lvl of levels) {
        classAutocomplete.push({ name: `${c.name} — Level ${lvl}`, value: `${c.xws}|${lvl}` });
      }
      // Add alias entries — display alias name, same values as real class
      if (c.aliases) {
        for (const alias of c.aliases) {
          const aliasLabel = alias.charAt(0).toUpperCase() + alias.slice(1);
          classAutocomplete.push({ name: `${aliasLabel} — All Cards`, value: `${c.xws}|all` });
          for (const lvl of levels) {
            classAutocomplete.push({ name: `${aliasLabel} — Level ${lvl}`, value: `${c.xws}|${lvl}` });
          }
        }
      }
    }
    console.log(`  Loaded ${classList.length} classes.`);
  } catch (err) {
    console.warn("Could not load classes:", err.message);
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

// ─── Channel restriction ──────────────────────────────────────────────────────

const allowedChannelIds = process.env.ALLOWED_CHANNEL_IDS
  ? process.env.ALLOWED_CHANNEL_IDS.split(",").map(id => id.trim()).filter(Boolean)
  : [];

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
  // ── Autocomplete ────────────────────────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    const { commandName } = interaction;
    const query = interaction.options.getFocused();
    if (commandName === "class") {
      const q = query.toLowerCase();
      const matches = q
        ? classAutocomplete.filter(o => o.name.toLowerCase().includes(q)).slice(0, 25)
        : classList.map(c => ({ name: `${c.name} — All Cards`, value: `${c.xws}|all` }));
      return interaction.respond(matches);
    }

    const fuse = commandName === "card" ? abilityFuse : commandName === "item" ? itemFuse : null;

    if (!fuse || !query) {
      return interaction.respond([]);
    }

    const results = fuse.search(query, { limit: 25 });
    return interaction.respond(
      results.map(r => ({ name: r.item.name, value: r.item.name }))
    );
  }

  // ── Button interactions (card alt-pick) ─────────────────────────────────────
  if (interaction.isButton()) {
    const [prefix, type, ...nameParts] = interaction.customId.split(":");
    if (prefix === "card") {
      const cardName = nameParts.join(":");
      await interaction.deferUpdate();
      await resolveCardByName(interaction, type, cardName);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Channel restriction check
  if (allowedChannelIds.length && !allowedChannelIds.includes(interaction.channelId)) {
    return interaction.reply({
      content: "This command is not available in this channel.",
      ephemeral: true,
    });
  }

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
    } else if (commandName === "class") {
      await handleClassLookup(interaction);
    }
  } catch (err) {
    console.error(`Error handling /${commandName}:`, err.message);
    try {
      const msg = "Something went wrong. Please try again.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch (replyErr) {
      console.warn("Could not send error reply to user:", replyErr.message);
    }
  }
});

// ─── Lookup handler ───────────────────────────────────────────────────────────

// Returns { ephemeral: boolean, blocked: boolean }.
// `blocked` is true when the user tried to make a response public but lacked permission —
// the caller should send a follow-up notice so the user isn't silently confused.
function resolveEphemeral(interaction) {
  const override = interaction.options.getBoolean("ephemeral");

  // No override requested — use server default.
  if (override === null) return { ephemeral: DEFAULT_EPHEMERAL, blocked: false };

  // User wants to go public, but the server default is ephemeral.
  // Only users in EPHEMERAL_ADMIN_IDS may override; an empty list means nobody can.
  if (DEFAULT_EPHEMERAL && override === false) {
    if (!EPHEMERAL_ADMIN_IDS.includes(interaction.user.id)) {
      return { ephemeral: true, blocked: true };
    }
  }

  return { ephemeral: override, blocked: false };
}

async function handleCardLookup(interaction, type) {
  const query = interaction.options.getString("name");
  const { ephemeral, blocked } = resolveEphemeral(interaction);
  await interaction.deferReply({ ephemeral });
  if (blocked) {
    await interaction.followUp({ content: "You don't have permission to override the server's ephemeral setting.", ephemeral: true });
  }

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

  await resolveCardByName(interaction, type, results[0].item.name, results);
}

// Builds and sends (or edits) a card embed. Used by both the slash command and button handler.
// `results` is the full Fuse result set; if omitted, an exact-name lookup is performed.
async function resolveCardByName(interaction, type, cardName, results = null) {
  const index = type === "ability" ? abilityIndex : itemIndex;
  const fuse  = type === "ability" ? abilityFuse  : itemFuse;

  if (!results) {
    // Exact match first, fall back to fuzzy
    const exact = index.find(c => c.name === cardName);
    results = exact
      ? [{ item: exact }]
      : fuse.search(cardName, { limit: 5 });
  }

  if (!results.length) {
    return interaction.editReply(`No card found for **${cardName}**.`);
  }

  const best = results[0].item;

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
  } else if (type === "item" && best.itemNumber !== null) {
    embed.addFields({ name: "Item #", value: String(best.itemNumber), inline: true });
  }

  // Offer remaining alternates as buttons (excluding the one now displayed)
  const components = [];
  const alts = results.filter(r => r.item.name !== best.name).slice(0, 4);
  if (alts.length) {
    const buttons = alts.map((r) => {
      const card = r.item;
      const label = type === "ability"
        ? `${card.name} (${card.class}, Lv${card.level})`
        : card.name;
      return new ButtonBuilder()
        .setCustomId(`card:${type}:${card.name}`)
        .setLabel(label.length <= 80 ? label : card.name)
        .setStyle(ButtonStyle.Secondary);
    });
    components.push(new ActionRowBuilder().addComponents(buttons));
  }

  await interaction.editReply({ embeds: [embed], components });
}

// ─── Event lookup handler ─────────────────────────────────────────────────────

async function handleEventLookup(interaction, typeOverride = null) {
  const query  = interaction.options.getString("query");
  const type   = typeOverride ?? interaction.options.getString("type"); // boat | road | outpost | null
  const season = interaction.options.getString("season"); // summer | winter | null

  const { ephemeral, blocked } = resolveEphemeral(interaction);
  await interaction.deferReply({ ephemeral });
  if (blocked) {
    await interaction.followUp({ content: "You don't have permission to override the server's ephemeral setting.", ephemeral: true });
  }

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
  // Boat events have no season — ignore season filter if type is boat, and warn the user
  const seasonIgnored = season && type === "boat";
  if (season && !seasonIgnored) results = results.filter(r => r.item.season === season);

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


  try {
    let backBuffer = null;

    if (CACHE_TTL_HOURS !== -1) {
      const entry = backImageCache.get(best.backUrl);
      if (entry) {
        const ageHours = (Date.now() - entry.cachedAt) / 3_600_000;
        if (CACHE_TTL_HOURS === 0 || ageHours < CACHE_TTL_HOURS) {
          backBuffer = entry.buffer;
        } else {
          backImageCache.delete(best.backUrl);
        }
      }
    }

    if (!backBuffer) {
      const backRes = await fetch(best.backUrl);
      if (!backRes.ok) throw new Error(`HTTP ${backRes.status}`);
      backBuffer = Buffer.from(await backRes.arrayBuffer());
      if (CACHE_TTL_HOURS !== -1) {
        backImageCache.set(best.backUrl, { buffer: backBuffer, cachedAt: Date.now() });
      }
    }

    const backAttachment = new AttachmentBuilder(backBuffer, { name: "SPOILER_back.png" });
    await interaction.editReply({ embeds: [frontEmbed], files: [backAttachment] });
  } catch (err) {
    console.warn("Could not fetch back card image:", err.message);
    await interaction.editReply({ embeds: [frontEmbed] });
  }

  if (seasonIgnored) {
    await interaction.followUp({
      content: "Note: boat events don't have seasons, so the season filter was ignored.",
      ephemeral: true,
    });
  }
}

// ─── Class lookup handler ─────────────────────────────────────────────────────

const CARDS_BASE_URL = "https://gloomhavencards.com/fh/characters";

async function handleClassLookup(interaction) {
  const raw = interaction.options.getString("query");
  const [xws, level] = raw.includes("|") ? raw.split("|") : [raw, "all"];

  const { ephemeral, blocked } = resolveEphemeral(interaction);
  await interaction.deferReply({ ephemeral });
  if (blocked) {
    await interaction.followUp({ content: "You don't have permission to override the server's ephemeral setting.", ephemeral: true });
  }

  const classEntry = classList.find(c => c.xws === xws);
  if (!classEntry) {
    return interaction.editReply(`Unknown class. Please select a class from the autocomplete list.`);
  }

  const color = 0x6b4f9e;

  if (level === "all" || level === "1") {
    // No level specified — link to full card browser with class back card as preview
    const code = classEntry.code.toLowerCase();
    const classImageUrl = `${IMAGE_BASE}/character-ability-cards/frosthaven/${code}/fh-${code}-back.png`;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${classEntry.name}${level === "1" ? " — Level 1" : ""} — Click to view all cards 🔗`)
      .setURL(`${CARDS_BASE_URL}/${classEntry.code}`)
      .setImage(classImageUrl)
      .setFooter({ text: "Frosthaven • Worldhaven Card Database" });
    return interaction.editReply({ embeds: [embed] });
  }

  // Level specified — return card images
  const cards = abilityIndex.filter(
    c => c.class === xws && String(c.level).toLowerCase() === level.toLowerCase()
  );

  if (!cards.length) {
    return interaction.editReply(
      `No Level ${level} cards found for **${classEntry.name}**.`
    );
  }

  const levelLabel = `Level ${level}`;
  const embeds = cards.map((card, i) =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(i === 0 ? `${classEntry.name} — ${levelLabel}` : card.name)
      .setImage(card.imageUrl)
      .setFooter({ text: "Frosthaven • Worldhaven Card Database" })
  );

  await interaction.editReply({ embeds });
}

// ─── Login ────────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("ERROR: DISCORD_TOKEN environment variable is not set.");
  process.exit(1);
}
client.login(token);

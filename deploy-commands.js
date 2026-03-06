/**
 * Run this ONCE to register slash commands with Discord.
 * Usage: node deploy-commands.js
 *
 * Required env vars: DISCORD_TOKEN, CLIENT_ID
 * Optional: GUILD_ID  (deploy to a single guild for instant testing;
 *                      omit to deploy globally — takes up to 1 hour to propagate)
 */

require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { ApplicationCommandOptionType } = require("discord-api-types/v10");

const commands = [
  {
    name: "card",
    description: "Look up a Frosthaven ability card by name",
    options: [
      {
        name: "name",
        description: "Card name (fuzzy matched)",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "item",
    description: "Look up a Frosthaven item card by name",
    options: [
      {
        name: "name",
        description: "Item name (fuzzy matched)",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "event",
    description: "Look up a Frosthaven event card by text (returns front + back)",
    options: [
      {
        name: "query",
        description: "Text to search for (title, flavor text, or option text)",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: "type",
        description: "Filter by event type",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "Boat", value: "boat" },
          { name: "Road", value: "road" },
          { name: "Outpost", value: "outpost" },
        ],
      },
      {
        name: "season",
        description: "Filter by season (road and outpost only)",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "Summer", value: "summer" },
          { name: "Winter", value: "winter" },
        ],
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID; // optional

  if (!clientId) {
    console.error("ERROR: CLIENT_ID environment variable is not set.");
    process.exit(1);
  }

  try {
    console.log("Registering slash commands...");

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(`Commands registered to guild ${guildId} (instant).`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      console.log("Commands registered globally (may take up to 1 hour).");
    }
  } catch (err) {
    console.error(err);
  }
})();

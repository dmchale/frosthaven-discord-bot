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

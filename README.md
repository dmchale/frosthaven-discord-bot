# Frosthaven Card Bot

A Discord bot for looking up Frosthaven ability cards, items, and event cards by name or text, returning card images directly in chat.

## Commands

| Command | Description |
|---|---|
| `/card <name>` | Look up an ability card (fuzzy name match) |
| `/item <name>` | Look up an item card (fuzzy name match) |
| `/event <query> [type] [season]` | Search all event cards by text |
| `/boat <query>` | Search boat event cards by text |
| `/road <query> [season]` | Search road event cards by text |
| `/outpost <query> [season]` | Search outpost event cards by text |

Fuzzy matching means typos and partial names work — `/card burning` will find "Burning Rain" even if you don't type the full name.

Event commands search the full text of the front of the card (title, flavor text, and both options). Results return the front card image plus a spoiler-tagged back card image in a single message.

## Setup

### 1. Create a Discord Application
1. Go to https://discord.com/developers/applications
2. Click **New Application**, give it a name
3. Go to **Bot** → click **Add Bot**
4. Copy your **Bot Token**
5. Go to **General Information** → copy your **Application ID**

### 2. Invite the Bot to Your Server
In the Developer Portal, go to **OAuth2 → URL Generator**:
- Scopes: `bot`, `applications.commands`
- Bot Permissions: `Send Messages`, `Embed Links`, `Attach Files`

Open the generated URL and invite the bot to your server.

### 3. Install & Configure
```bash
npm install
cp .env.example .env
# Edit .env and fill in DISCORD_TOKEN, CLIENT_ID, and optionally GUILD_ID
```

### 4. Register Slash Commands
```bash
npm run deploy
```

If you set `GUILD_ID`, commands appear instantly in those servers. You can specify multiple servers as a comma-separated list (e.g. `GUILD_ID=111,222,333`). Without it, global registration can take up to 1 hour.

### 5. Run the Bot
```bash
npm start
```

## Event Card Data

Event card text (`data/events.json`) is manually transcribed from the physical cards and is a work in progress. Cards without text entered yet will not appear in search results.

**Coverage:**
- Boat events: 19/19
- Road events (Summer): 52/52
- Road events (Winter): 0/49
- Outpost events (Summer): 0/65
- Outpost events (Winter): 0/81

## Card Data Source

Ability card and item data and images are pulled live from the [Worldhaven Asset Viewer](https://github.com/any2cards/worldhaven) repository. No assets are bundled with this bot.

## Notes

- The bot fetches and indexes card data on startup. This takes a few seconds.
- Fuzzy search threshold is set to `0.35` — lower it for stricter matching, raise it for more lenient.

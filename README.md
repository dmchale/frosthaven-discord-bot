# Frosthaven Card Bot

A Discord bot that lets you look up Frosthaven ability cards and items by name, returning an image embed directly in chat.

## Commands

| Command | Description |
|---|---|
| `/card <name>` | Look up an ability card (fuzzy name match) |
| `/item <name>` | Look up an item card (fuzzy name match) |

Fuzzy matching means typos and partial names work — `/card burning` will find "Burning Rain" even if you don't type the full name.

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
- Bot Permissions: `Send Messages`, `Embed Links`

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

If you set `GUILD_ID`, commands appear instantly. Without it, global registration can take up to 1 hour.

### 5. Run the Bot
```bash
npm start
```

## Card Data Source

Card data and images are pulled live from the [Worldhaven Asset Viewer](https://github.com/any2cards/worldhaven) GitHub repository, which is licensed by Cephalofair Games. No assets are bundled with this bot.

## Notes

- The bot fetches and indexes card data on startup. This takes a few seconds.
- You can extend `ABILITY_SOURCES` and `ITEM_SOURCES` in `bot.js` to add Gloomhaven, Jaws of the Lion, etc.
- Fuzzy search threshold is set to `0.35` — lower it for stricter matching, raise it for more lenient.

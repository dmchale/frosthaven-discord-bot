# Frosthaven Card Bot

A Discord bot for looking up Frosthaven ability cards, items, and event cards by name or text, returning card images directly in chat. Intended for groups that are past the point of worrying about spoilers, or players who just want quick reference access during a session.

> **Spoiler Warning:** This project works with raw game data and makes no effort to conceal spoilers of any kind. Card text, event outcomes, item names, enemy factions, and other game content are stored and displayed in full. Browse, contribute to, or deploy this project at your own discretion.

## Commands

There are three types of cards you can look up:

### Ability Cards

| Command | Description |
|---|---|
| `/card <name>` | Fuzzy name search — finds a character ability card by name (autocomplete supported) |
| `/class <query>` | Browse by class and level — autocomplete lets you pick a class with "All Cards" or a specific level; levels 2–9 and X return card images, others link to the full card browser |

Fuzzy matching means typos and partial names work — `/card burning` will find "Burning Rain" even if you don't type the full name.

### Item Cards

| Command | Description |
|---|---|
| `/item <name>` | Fuzzy name search — finds an item by name (autocomplete supported) |

### Event Cards

| Command | Description |
|---|---|
| `/event <query> [type] [season]` | Search all event cards by text, with optional filters for type and season |
| `/boat <query>` | Search boat events only |
| `/road <query> [season]` | Search road events only, with optional season filter |
| `/outpost <query> [season]` | Search outpost events only, with optional season filter |

Event commands search the full text of the front of the card (title, flavor text, and all options). Results return the front card image plus a spoiler-tagged back card image in a single message.

## Setup

**Requirements:** Node.js 18+ (uses native `fetch`). Node 24+ recommended.

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

Optionally set `ALLOWED_CHANNEL_IDS` to a comma-separated list of channel IDs to restrict commands to specific channels. This lets the bot owner control where commands are allowed to run without relying on the server admin to set up channel-level permissions — Discord registers slash commands at the server level, so by default they're available everywhere. Leave blank to allow commands everywhere.

Optionally set `DEFAULT_EPHEMERAL=false` to make all command replies public by default. When unset (or set to `true`), all replies are ephemeral — visible only to the user who ran the command. Any command's `ephemeral` option can override this per-invocation.

Optionally set `EPHEMERAL_ADMIN_IDS` to a comma-separated list of Discord user IDs. Only meaningful when `DEFAULT_EPHEMERAL` is `true`. Listed users may pass `ephemeral: false` to post a result publicly; everyone else is silently held to the ephemeral default. Leave blank (the default) to prevent anyone from overriding — all results stay ephemeral, full stop.

Optionally set `WORLDHAVEN_REF` to a specific commit SHA from the [any2cards/worldhaven](https://github.com/any2cards/worldhaven) repository to pin card data to a known-good version. Leave blank to always use the latest `master`.

### 5. Run the Bot
```bash
npm start
```

## Event Card Text Conventions

When entering event card text in `data/events.json`, use the following conventions:

### Tokens

In-game icons and special text are represented as ALL CAPS tokens in curly braces:

**Materials:**
| Token | Resource |
|-------|----------|
| `{WOOD}` | Wood |
| `{METAL}` | Metal |
| `{HIDE}` | Hide |

**Herbs:**
| Token | Resource |
|-------|----------|
| `{ARROWVINE}` | Arrowvine |
| `{AXENUT}` | Axenut |
| `{CORPSECAP}` | Corpsecap |
| `{FLAMEFRUIT}` | Flamefruit |
| `{ROCKROOT}` | Rockroot |
| `{SNOWTHISTLE}` | Snowthistle |

**Other:**
| Token | Meaning |
|-------|---------|
| `{TRAIT}` | A character trait icon (e.g. on cards that reference a specific trait) |

Example: `"Gain 3 {WOOD} and 1 {SNOWTHISTLE}."`

### Other Formatting
- Use `\n` for a single line break, `\n\n` for a paragraph break
- Escape double quotes within text as `\"`

### Outpost Event Fields

Outpost events have a `faction` field indicating which enemy faction the event is tied to. Valid values:

| Value | Meaning |
|-------|---------|
| `"lurker"` | Lurker faction event |
| `"unfettered"` | Unfettered faction event |
| `"algox"` | Algox faction event |
| `""` | No faction (neutral event) |

## Card Data Source

Ability card and item data and images are pulled live from the [Worldhaven Asset Viewer](https://github.com/any2cards/worldhaven) repository. No assets are bundled with this bot.

## Legal & Attribution

This is an unofficial fan project. All Frosthaven card content, artwork, and game assets belong to their respective owners, including but not limited to Isaac Childres, Cephalofair Games, and any of its partners. No infringement is intended — this project exists as a free convenience tool for fans and nothing more.

Some card data, and all images, are sourced from the community-maintained [Worldhaven Asset Viewer](https://github.com/any2cards/worldhaven) project.

## Notes

- The bot fetches and indexes card data on startup. This takes a few seconds.
- Fuzzy search threshold is set to `0.35` — lower it for stricter matching, raise it for more lenient.

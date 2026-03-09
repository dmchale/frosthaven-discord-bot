# Frosthaven Card Bot

[![GitHub release](https://img.shields.io/github/v/release/dmchale/frosthaven-discord-bot)](https://github.com/dmchale/frosthaven-discord-bot/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Discord](https://img.shields.io/badge/Discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org)

A Discord bot for looking up Frosthaven ability cards, items, and event cards by name or text, returning card images directly in chat. Originally created to be a quick reference tool during online group sessions of Frosthaven Digital.

Note: by default, this bot will only respond with ephemeral (private) responses when people use its slash commands. You may change this and other behavior by changing the [Environment Variables](#environment-variables).

> **Spoiler Warning:** This bot does little to hide spoiler content beyond spoiler-tagging the backs of event cards. Any user who interacts with it will have immediate, easy access to card text, item names, event outcomes, and other game content. Better spoiler support may be added in the future, but for now this should be treated as a spoiler-forward tool — browse, contribute to, or deploy it at your own discretion.

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
```

Then edit `.env` with your values. See the table below for all supported variables.

#### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Your bot token from the Discord Developer Portal |
| `CLIENT_ID` | Yes | Your application ID from the Discord Developer Portal |
| `GUILD_ID` | No | Comma-separated server IDs for instant command registration. Omit for global registration (up to 1 hour to propagate) |
| `ALLOWED_CHANNEL_IDS` | No | Comma-separated channel IDs to restrict where commands can be used. Leave blank to allow commands everywhere |
| `PUBLIC_BY_DEFAULT` | No | Set to `true` to post all replies to the channel by default. When unset, all replies are ephemeral (visible only to the invoking user). Any command's `public` option overrides this per-invocation |
| `PUBLIC_ADMIN_IDS` | No | Comma-separated user IDs allowed to use `public: true` when `PUBLIC_BY_DEFAULT` is off. Leave blank to prevent anyone from overriding — all results stay ephemeral |
| `WORLDHAVEN_REF` | No | A specific commit SHA from [any2cards/worldhaven](https://github.com/any2cards/worldhaven) to pin card data to a known-good version. Leave blank to always use the latest `master` |

### 4. Register Slash Commands
```bash
npm run deploy
```

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
| `null` | No faction (neutral event) |

## Legal & Attribution

This is an unofficial fan project. All Frosthaven card content, artwork, and game assets belong to their respective owners, including but not limited to Isaac Childres, Cephalofair Games, and any of its partners. No infringement is intended — this project exists as a free convenience tool for fans and nothing more.

Some card data, and all images, are sourced from the community-maintained [Worldhaven Asset Viewer](https://github.com/any2cards/worldhaven) project.

## Notes

- The bot fetches and indexes card data on startup. This takes a few seconds.
- Fuzzy search threshold is set to `0.35` — lower it for stricter matching, raise it for more lenient.

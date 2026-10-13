# Privacy Policy

_Last updated: October 13, 2026_

This policy explains what data the **Octavious** Discord bot ("the bot") collects, why it collects it, and how you can have it removed. It covers the instance of the bot run by its developer, **mineprodan** ("we", "us").

If someone else runs a copy of this code (with permission, see [LICENSE](LICENSE)), that person is the operator of their copy and is responsible for its data. This policy does not cover their copy.

## What we collect

The bot only collects data from the Discord server it is set up for. It does not read DMs and does not track you across other servers.

| Data | What it is | Why |
| --- | --- | --- |
| **Profile** | Discord user ID, username, display name, avatar | To show you on rank cards, leaderboards and the website |
| **Levels** | Total XP, level, prestige, time of your last XP award | The XP and levelling system |
| **Achievement progress** | Counts of messages, replies, reactions, threads, voice minutes, active days, streaks and channels used, plus the text and timestamps of **your last 20 messages** | Working out whether you've unlocked an achievement (for example, "sent the same message twice") |
| **Pets and claims** | Pets owned, bond, nicknames, feeding times, daily-claim streak | The pets and `/claim` features |
| **Colour roles** | Which colour role you picked | The `/color` feature |
| **Deleted and edited messages** | The most recent deleted or edited message in each channel: its text, author and time | The `/snipe` and `/editsnipe` commands. Each new deletion or edit in a channel replaces the previous one. |
| **AutoMod events** | When Discord AutoMod acts on a message: the message text, the matched word, the rule and the action taken | Moderation review |
| **Staff notes** | Notes that moderators write about a member | Moderation |
| **Activity statistics** | Hourly counts of messages, reactions, voice minutes, commands, joins and leaves, broken down by user ID | Server activity charts for staff |
| **Bot logs** | Log lines such as XP awards and achievement unlocks, which can include your username and ID | Debugging. These are posted to a private staff channel in the server. |

If a YouTube feed is set up, the bot also fetches public video information from YouTube. That isn't data about you.

We **do not** collect email addresses, IP addresses, payment details, or the content of messages outside the uses listed above.

## How long we keep it

| Data | Kept for |
| --- | --- |
| Activity statistics | 400 days, then deleted automatically |
| AutoMod events | 365 days, then deleted automatically |
| Last 20 messages for achievements | Replaced as you send new messages |
| Deleted and edited messages | Replaced by the next deletion or edit in that channel |
| Everything else (profile, levels, achievements, pets, staff notes) | As long as the bot runs in the server, or until you ask us to delete it |

## Where it's stored and who can see it

Data is stored in a MongoDB database run by the bot's operator.

- **Everyone in the server** can see your level, rank, achievements, pets and colour role, and anything shown by `/snipe` or `/editsnipe`.
- **Staff** can see staff notes, AutoMod events, logs and activity statistics. These are also available on the server's staff dashboard.
- We **do not sell or share** your data with anyone else. The only exceptions are the service providers needed to run the bot (Discord, the database host and the server host), or when the law requires it.

## Your choices and rights

- **Access or deletion:** contact us (see [Contact](#contact)) to get a copy of your data, or to have it deleted. Deleting your data resets your XP, achievements and pets.
- **Opting out:** leaving the server stops new data being collected. Data that's already stored stays until you ask us to delete it.
- Depending on where you live, you may have more rights under laws such as the GDPR or CCPA. We'll respect them.

## Children

Discord requires users to be at least 13, or older in some countries. The bot is not meant for anyone under that age.

## Changes

We may update this policy. The date at the top shows when it last changed. Continuing to use the bot after a change means you accept the updated policy.

## Contact

For questions or data requests, message **mineprodan** on Discord or [open an issue](https://github.com/MineProDan/octavious_open/issues) on GitHub. Please don't post personal data in a public issue. Ask us to contact you privately instead.

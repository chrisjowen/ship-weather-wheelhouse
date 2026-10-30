# Ship’s weather

A [Wheelhouse](https://github.com/chrisjowen/wheelhouse) plugin that shows the fleet’s health as weather in the header, from **Clear** to **Storm**. Click it for a calm drill-in: a small brass barometer with the forecast, why the weather is what it is, what’s wrong, and the ship’s log of latest events.

## What it shows

The pill in the header carries a small barometer, the weather in a word and how many things there are to look at.

| Weather           | When                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| **Clear**         | Nothing to look at.                                                                                       |
| **Fair**          | A decision or two waiting on you.                                                                         |
| **Clouding over** | A task is blocked, Claude headroom is getting low, or decisions are piling up.                            |
| **Squalls**       | A failing check, a failed validation step or task, or a worker that isn’t answering.                      |
| **Storm**         | Several of those at once (three by default), or Claude headroom nearly out for this session or this week. |

Clicking it opens the drill-in:

- **The forecast**: the weather on a barometer and one sentence on what it’s made of, such as “A check is failing and a worker isn’t answering, with 2 other things to look at.”
- **Why**: every signal the weather is read from, problems first: failing checks, failed steps or tasks, workers not answering, blocked work, decisions waiting on you, and Claude headroom.
- **What’s wrong**: each problem in plain words, naming the task, with links to the task and its pull request. For example, “The “unit tests” check failed on its pull request.” The first three are shown, and the rest on asking.
- **Ship’s log**: the latest events, newest first: work started, pull request ready for review, landed, blocked, needs a decision, failed, finished. Each one links to its task or pull request. The newest four are shown, and the rest on asking.

It says when something couldn’t be read (Claude’s limits, GitHub, the fleet ledger) rather than guessing, and the weather is made from what could be.

## Install

```sh
wheelhouse plugin install chrisjowen/ship-weather-wheelhouse
```

`install` shows what the plugin adds and asks for its settings, each offering its default. Press Enter to take it. Wheelhouse restarts to load it.

## Turn it on

It is off until you turn it on. Open **Settings → Plugins**, find **Ship’s weather** and switch it on for every project. Projects you leave it off for don’t count towards the weather. You can also set it in `plugins.json` in Wheelhouse’s config directory:

```json
{ "plugins": { "ship-weather": { "enabled": true } } }
```

## Settings

All of these are optional. Change them on the plugin’s page in **Settings → Plugins**, and they apply without a restart.

| Setting             | Default | What it does                                                                                                     |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `headroomLow`       | 25      | Below this much Claude headroom left (% of the session or the week), the weather clouds over.                    |
| `headroomCritical`  | 10      | Below this much left, it’s a storm. Never above `headroomLow`.                                                   |
| `stormAt`           | 3       | A storm when this many things are failing at once: failing checks, failed steps or tasks, workers not answering. |
| `decisionsForCloud` | 3       | Clouds over when this many decisions wait on you; fewer is still fair.                                           |
| `githubChecks`      | true    | Asks GitHub for the failing checks on up to eight open pull requests at each read.                               |
| `events`            | 12      | How many events the ship’s log keeps.                                                                            |

## What it reads

The plugin only reads, and only what Wheelhouse already gives plugins: one fleet provider, whose answer Wheelhouse keeps for a minute. It writes nothing, rings no bell and sends no message to Firstmate.

- **The fleet’s tasks**, as Wheelhouse hands them to plugins: each task’s status, validation run, passage checks and what waits on you.
- **Claude headroom**, from `quota-axi --provider claude --json`, the same report Wheelhouse’s Headroom page reads. It never asks for Keychain access or refreshes credentials.
- **Failing checks**, from `gh pr checks <url> --json name,bucket,link` for each open pull request (at most eight), unless `githubChecks` is off.
- **The latest events**, from the end of Firstmate’s fleet ledger (`state/fleet-ledger.jsonl` in the Firstmate home). Each event is told in the plugin’s own words, and a worker’s status text is never shown.

Every command runs in the Firstmate home through Wheelhouse’s plugin context: an argument array, no shell, a minimal environment, and a bounded time and output.

## Layout

```
.wheelhouse-plugin/plugin.json   the manifest
wheelhouse/server/index.js       the provider and the header contribution
wheelhouse/server/weather.js     how the weather is read from the fleet (pure)
wheelhouse/server/events.js      the ship's log, from the fleet ledger
wheelhouse/server/headroom.js    Claude headroom, from quota-axi
wheelhouse/ui/index.js           <ship-weather-indicator>, the pill and its drill-in
```

There is no build step and no runtime dependency. Wheelhouse imports the files as they are.

## Development

```sh
npm ci
npm run lint   # ESLint and Prettier
npm test       # node --test, with the element tested in happy-dom
```

`tests/fixtures/plugin.schema.json` is a copy of the Wheelhouse SDK’s manifest schema, so the tests run offline.

## Licence

MIT

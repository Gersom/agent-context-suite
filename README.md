English | [Español](./README.es.md)

# agent-context-suite

A suite of tools for working with the [agent-context-skill](https://github.com/Gersom/agent-context-skill) skill, which generates project context documentation so that **any AI agent** (Claude Code, Cursor, Copilot, etc.) understands where a project stands, what is missing, what was done and why — without depending on the memory of a single conversation. The skill lives in its own repo (`agent-context-skill`); this repo has the tools (task tracking, management and verification).

## Install the suite

### Requirements

- Node 20 or higher, or Bun.
- Having started the [agent-context-skill](https://github.com/Gersom/agent-context-skill) skill in the project where you run the suite.

### Recommended: install it globally

Install it once and the `acsuite` command exists from then on in any folder:

```sh
bun add -g agent-context-suite@latest
```

Or with npm:

```sh
npm install -g agent-context-suite@latest
```

To update it, run the same command.

> **Install it from npm, not from GitHub.** Do not use `bun install -g github:Gersom/agent-context-suite`: the repo does not include `dist/`, so the `acsuite` command is not created. Always use the [npm](https://www.npmjs.com/package/agent-context-suite) package. If you already installed it from GitHub with Bun, clean that copy with `bun pm cache rm` and reinstall from npm.

### Alternative: use it without installing anything

With `npx` or `bunx` it is downloaded, run and finished, without leaving the `acsuite` command installed, so you type it in full each time:

```sh
npx agent-context-suite@latest board
```

```sh
bunx agent-context-suite@latest board
```

`@latest` always fetches the most recent version. Without a path, it uses the project in the folder where you run it; to use another one, pass its path at the end (`npx agent-context-suite@latest board D:/other-project`).

**Names.** The *package* (what you type with `npm install`, `npx` or `bunx`) is `agent-context-suite`; the *command* (once installed) is `acsuite`.

**Compatibility.** Tested on Windows 11 with Node 20, 22 and 24, and with Bun. On Linux and macOS it should work the same (it is standard Node), but it has not been verified: if you run into any problem, open an [Issue](https://github.com/Gersom/agent-context-suite/issues).

## Tools

The suite comes with four tools, which work on a project that uses the skill. They are used with the `acsuite` command (if you did not install it, put `npx agent-context-suite@latest` before the subcommand). Without a path, they use the project in the folder where you run the command, going up to the root of its git repo; `board` and `check` accept a path to inspect another project (`acsuite check D:/other-project`).

`acsuite` with no arguments lists the subcommands, and `acsuite <subcommand> --help` shows the help for each one.

### `acsuite board`

Live task board in the terminal: the task in progress, the paused ones, the pending ones and the latest completed. It redraws by itself when the files change, so it is best left in a separate terminal while an agent works.

```sh
acsuite board
```

Usage, shortcuts and how it reads the files: [`board` README](./scripts/task-tracker/README.md). The board remembers compact mode, the arrows and observer mode between runs (`settings.json` in `~/.acsuite`), with the `c`, `f` and `o` keys.

<!-- ![acsuite board](docs/board.gif) -->

#### Follow Claude's active project

If you work with several Claude Code sessions at once, the board can switch by itself to the project you mark from Claude. Press `o` with the board open to turn on observer mode (it is remembered for next time):

```sh
acsuite board
```

You mark it from Claude with the `acsuite-active-project` mod, with its `[ ● Mark this project as active ]` button or with `/board`. It is installed with one line, `/plugin install acsuite-active-project --marketplace Gersom/agent-context-suite`; the other steps and the details are in the [mod's README](./mods/acsuite-active-project/README.md), and the board's observer mode is in its [README](./scripts/task-tracker/README.md#modo-observador).

### `acsuite task`

Query and edit tasks without hand-editing `handoff.md`, `backlog.md` or `history.md`. Writes require `--apply`; without it, it only shows the diff.

```sh
acsuite task status
```

```sh
acsuite task <command> --help
```

Commands, flags and how it writes: [`task` README](./scripts/task-manager/README.md).

### `acsuite check`

Read-only checker: it verifies that the project's agent documentation works for the skill, the board and task management, and lists errors and warnings with file and line.

```sh
acsuite check
```

Usage and finding codes: [`check` README](./scripts/docs-check/README.md).

### `acsuite init`

Adds to the project's `rules.md` the section that teaches the agent to use the suite: not to hand-edit `handoff.md`, `backlog.md` or `history.md`, and to use `acsuite task`, `acsuite check` and `acsuite board`. It puts it at the start of `rules.md`, after the title, and only touches that section, between its markers; it does not change the fixed rules. Without `--apply` it shows the diff and writes nothing; if the section is already up to date, it does nothing. In a project with several operators, `rules.md` belongs to everyone, so the change applies to the whole project. If you do not add it, `acsuite check` warns about it.

```sh
acsuite init
```

```sh
acsuite init --apply
```

## License

[MIT](./LICENSE). The skill, which lives in its own repo, has the same license.

## Support the project

If the suite or the skill is useful to you and you want to support their development, you can donate through PayPal: [paypal.me/gersomalaja](https://paypal.me/gersomalaja).

## Contributing

If you want to contribute to the project, see the [contribution guide](https://github.com/Gersom/agent-context-suite/blob/main/CONTRIBUTING.md).

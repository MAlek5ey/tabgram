# tabgram

Step away from your desk without leaving your Claude Code session behind. Press **Ctrl+Alt+T** in a VS Code terminal tab running Claude Code, pick a Telegram bot, and the session restarts in place, with the same conversation, attached to that bot. Questions and permission prompts now reach you in Telegram, and your replies go back into the same session. When you're back, press **Ctrl+Alt+Shift+T** to detach.

Why a restart? Claude Code only accepts incoming channel messages when it is started with `--channels`, and a channel can't be attached to a running process. So "connect" means `/exit` followed by `claude --resume <same session> --channels plugin:telegram@claude-plugins-official`, and it takes a couple of seconds. The conversation context is preserved.

Several tabs can each have their own bot at the same time.

## Requirements

- Claude Code with channels support (`--channels`), logged in with a claude.ai account
- The official Telegram channel plugin `telegram@claude-plugins-official`, plus [Bun](https://bun.sh), which the plugin needs
- Node.js ≥ 18 or Bun, to run the hook, the launcher and the installer
- VS Code ≥ 1.80

Tested on Windows. The macOS and Linux code paths exist but are **untested**. WSL and remote terminals (SSH, containers) are not supported: the extension looks for the shell's processes on the machine VS Code runs on.

## Bot setup

Each bot gets its own state folder:

```
~/.claude/channels/telegram-<name>/
  .env          TELEGRAM_BOT_TOKEN=123456:ABC...
  access.json   created by the plugin when you pair
```

Pair each bot once in a terminal:

```sh
# bash / zsh
TELEGRAM_STATE_DIR=~/.claude/channels/telegram-mybot claude --channels plugin:telegram@claude-plugins-official
# PowerShell
$env:TELEGRAM_STATE_DIR="$HOME\.claude\channels\telegram-mybot"; claude --channels plugin:telegram@claude-plugins-official
```

Then run `/telegram:access` and pair from Telegram. Set the policy to an allowlist that contains only you. Anyone on the allowlist can approve tool calls in your session, and with `terminalReplies` set to `full` receives your replies too.

Folder names may contain only letters, digits, `_`, `.` and `-`; other folders are not shown in the picker, because the folder path is typed into the terminal.

## Install

```sh
git clone https://github.com/MAlek5ey/tabgram
cd tabgram
node install.js        # or: bun install.js
```

The installer does three things:

- copies the extension into `~/.vscode/extensions/local.tabgram-<version>/`;
- adds a `SessionStart` hook and a `Stop` hook to `~/.claude/settings.json`, leaving your other hooks untouched. Both run in the background (`async`), so they don't slow Claude Code down. The first install saves your original settings as `settings.json.tabgram.bak`, and later installs keep that copy;
- creates `~/.claude/tabgram/`.

Hooks run with whichever runtime you used to start the installer.

The installer puts the extension under `~/.vscode/extensions`. For VS Code Insiders, VSCodium or Cursor, pass their folder: `node install.js --extensions-dir ~/.cursor/extensions`.

After installing:
1. Reload VS Code windows (**Developer: Reload Window**).
2. Restart any Claude Code session that was already running. The hook only sees sessions started after it was installed.

Uninstall with `node uninstall.js`. Add `--purge` to also delete `~/.claude/tabgram/`.

## Usage

| Action | Key | Command palette |
|---|---|---|
| Attach a bot to the focused Claude tab | `Ctrl+Alt+T` (`Cmd+Alt+T`) | Tabgram: Connect Telegram bot |
| Detach | `Ctrl+Alt+Shift+T` (`Cmd+Alt+Shift+T`) | Tabgram: Disconnect Telegram bot |

- The picker marks free bots 🟢, the bot attached to this tab 📱, and bots in use elsewhere 🔴. A bot counts as in use when a poller with its token runs in any `telegram*` folder, including a session started without the launcher from the legacy `telegram/` folder.
- While a bot is attached, the status bar shows `📱 <bot>`. Clicking it detaches the bot.
- When a bot is attached, it sends a message to everyone on its allowlist naming the session: the `/rename` title, or else the title Claude Code generated. The text is set by `connectMessage`.
- Prompts you type in the terminal get their reply in Telegram too, if `terminalReplies` is on: `notify` sends a short done message, and `full` sends the reply text, split into several messages when it is long. Prompts sent from Telegram are answered there by Claude itself, so they are not sent twice.
- Before `/exit` the extension clears the input line: Esc, then Ctrl+E, then Ctrl+U. In vim mode it also presses `i` after Esc. Only the current line is cleared, so send or delete a multi-line draft first, or its other lines are submitted along with `/exit`.
- Pressing the hotkey again while a restart is running is ignored. If Claude does not exit in time, the message shows the `claude --resume <id>` command to continue by hand.
- You can rebind the keys in **Keyboard Shortcuts** (search "Tabgram"). The extension adds its commands to `terminal.integrated.commandsToSkipShell` so the terminal doesn't swallow the keys, and says so once when it does.

## Configuration

`~/.claude/tabgram/config.json` is optional, and every key in it is optional:

```json
{
  "channelsDir": "/home/me/.claude/channels",
  "bots": {
    "telegram-mybot": { "label": "Work bot" },
    "telegram-oldbot": { "hidden": true }
  },
  "permissionMode": "auto",
  "extraArgs": ["--model", "opus"],
  "runtime": "/usr/local/bin/bun",
  "claudeCommand": "claude",
  "exitTimeoutMs": 15000,
  "connectMessage": "Bot attached to the terminal session: {task}",
  "terminalReplies": "full",
  "terminalDoneMessage": "✅ Done: {task}"
}
```

| Key | Meaning | Default |
|---|---|---|
| `channelsDir` | where the `telegram-*` bot folders live | `~/.claude/channels` |
| `bots.<folder>.label` | name shown in the picker and the status bar | folder name without `telegram-` |
| `bots.<folder>.hidden` | leave this bot out of the picker | `false` |
| `permissionMode` | passed as `--permission-mode` on restart | not passed |
| `extraArgs` | extra `claude` arguments on restart | `[]` |
| `runtime` | runtime used to start the launcher | the runtime that ran `install.js` |
| `claudeCommand` | command used to start Claude Code | `claude` |
| `exitTimeoutMs` | how long to wait for `/exit` | `15000` |
| `connectMessage` | Telegram message sent when a bot is attached; `{task}` is the session name, `""` turns it off | `Bot attached to the terminal session: {task}` |
| `terminalReplies` | what to send to Telegram when Claude finishes a prompt typed in the terminal: `off`, `notify` (done message) or `full` (the reply text) | `off` |
| `terminalDoneMessage` | the `notify` message, and the one `full` sends when the reply has no text; `{task}` is the session name | `✅ Done: {task}` |

On Windows, `claude` is started through `cmd`, which expands `%NAME%` even inside quotes, so avoid `%` in `extraArgs` values.

A restarted session uses Claude Code's defaults. Flags you passed when you first started it (model, permission mode) are not carried over; set them here instead.

## How it works

1. **Hook:** On every session start, a `SessionStart` hook walks up the process tree from itself to the `claude` process and then to the shell of the terminal tab. It writes `~/.claude/tabgram/sessions/<shellPid>.json` containing the session id.
2. **Extension:** The extension takes the active terminal's shell PID and finds that tab's session record. It clears the input line (`Esc`, `Ctrl+E`, `Ctrl+U`), sends `/exit` to the tab and waits for `claude` to exit.
3. **Launcher:** The extension then types `node launch.js --resume <id> [--bot <folder>]` into the tab. The launcher does three things:
   - stops any other poller using the same bot token;
   - sets `TELEGRAM_STATE_DIR`;
   - starts `claude --resume <id> --channels …`.

4. **Terminal replies:** a `Stop` hook runs when Claude finishes a turn. It acts only in sessions the launcher started with a bot. It reads the transcript, skips the turn if its prompt came from Telegram, and otherwise sends the reply to everyone on the bot's allowlist as `terminalReplies` says.

If anything fails, the session can always be continued by hand with `claude --resume <id>`, and the launcher prints that command.

## Troubleshooting

- **"Claude Code is not running in the active terminal tab"**: the session started before the hook was installed. Restart it once.
- **A bot is always 🔴**: another Claude session is polling it. The warning names the folder when it is not the bot's own (often the legacy `telegram/`). Check which process `bot.pid` in that folder points to.
- **A `claude` started from inside an attached session** (for example `claude -p` from a script) inherits the bot's folder. It doesn't send replies to Telegram, but if the Telegram plugin is enabled globally it starts a second poller of the same bot, and messages may go to it until it exits.
- **Messages don't arrive**: two processes are polling the same token, and Telegram sends each update to only one of them (a 409 conflict). The launcher stops the duplicates it can see in the `telegram*` folders. Pollers started from elsewhere have to be stopped by hand.
- **The bot is attached but `/mcp` shows the Telegram server as failed**: select it there and choose **Reconnect**.

## Manual test checklist

1. Reload VS Code, open two terminal tabs and start `claude` in each. Check that `~/.claude/tabgram/sessions/` now holds one file per tab.
2. In tab 1, press `Ctrl+Alt+T` and pick a 🟢 bot. The session restarts with its context intact, and the status bar shows `📱 <bot>`.
3. Message the bot from Telegram; the message should arrive in tab 1. Trigger a permission prompt and answer it from Telegram.
4. In tab 2, press `Ctrl+Alt+T`. Tab 1's bot is 🔴; pick another one.
5. In tab 1, press `Ctrl+Alt+Shift+T`. The session resumes without the channel, the status item disappears, and the bot is 🟢 again.
6. Type a one-line draft in tab 1 and move the cursor to its middle, then press `Ctrl+Alt+T`. The draft must not be sent.
7. Press `Ctrl+Alt+Shift+T` twice quickly. The second press says Tabgram is already restarting this tab, and no extra line reaches Claude.
8. With a bot attached, check each `terminalReplies` value. The hook reads the config on every turn, so there is no need to restart the session after changing it.
   - `full`: a prompt typed in the terminal gets its reply in Telegram; a reply over 4000 characters arrives as several messages; a prompt sent from Telegram is answered once, not twice;
   - `notify`: a terminal prompt produces only the done message;
   - `off`: nothing is sent.
9. In a tab with a bot attached, press `Ctrl+Alt+T`. The picker marks that bot 📱, and picking it says the bot is already attached to this tab.

## По-русски

Горячая клавиша **Ctrl+Alt+T** во вкладке терминала VS Code с Claude Code подключает к этой сессии выбранного Telegram-бота. Сессия перезапускается через `--resume` и сохраняет контекст. После этого вопросы и запросы разрешений приходят в Telegram, и отвечать можно с телефона. **Ctrl+Alt+Shift+T** отключает бота.

- **Боты:** каждый бот лежит в своей папке `~/.claude/channels/telegram-<имя>/` с `.env` (`TELEGRAM_BOT_TOKEN=…`) и `access.json`. Сопряжение делается один раз, как описано в разделе «Bot setup».
- **Установка:** `node install.js`, затем перезагрузить окно VS Code и один раз перезапустить уже открытые сессии Claude.
- **Удаление:** `node uninstall.js`; с `--purge` удаляется и `~/.claude/tabgram/`.
- **Настройки:** файл `~/.claude/tabgram/config.json`, ключи описаны в таблице выше.
- **Уведомление:** при подключении бот пишет в Telegram, к какой сессии он подключён: имя из `/rename`, а если его нет, заголовок, который придумал Claude Code. Текст задаётся ключом `connectMessage`, например `"Бот подключен к командной строке с задачей {task}"`. Пустая строка `""` отключает уведомление.
- **Ответы на запросы из терминала:** ключ `terminalReplies`. `off` (по умолчанию) — ничего не шлёт; `notify` — короткое «готово» (текст в `terminalDoneMessage`, например `"✅ Готово: {task}"`); `full` — сам текст ответа, длинный режется на несколько сообщений. Запросы, пришедшие из Telegram, Claude сам отвечает туда же, повторно они не отправляются. Работает только в сессиях, запущенных лаунчером с ботом.
- **Платформы:** проверено на Windows, на macOS и Linux не проверялось.
- **Бот подключён, а `/mcp` показывает сервер Telegram как упавший:** выберите его там и нажмите **Reconnect**.

## License

MIT

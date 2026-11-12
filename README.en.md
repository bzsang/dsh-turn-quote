# dsh-turn-quote

[中文](README.md) | **English**

[![Open Plugin Market](https://img.shields.io/endpoint?url=https://dshopen.org/badge/dsh-turn-quote.json)](https://dshopen.org/zh/plugins/dsh-turn-quote/) [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/p/bzsang/dsh-turn-quote/) ![license](https://img.shields.io/badge/license-MIT-2563eb) ![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.1--rc.5%20%3C0.3.0-2F6FED)

Quote earlier turns of the current conversation back into the message you are writing.
When a chat drifts, `@` the original requirement (or the conclusion you agreed on) and let
the model continue from the actual text instead of copy-pasting it by hand.

| What you can quote | What the menu shows |
| --- | --- |
| One message (you / assistant) | `Turn 3 · You`, `Turn 3 · Assistant` |
| A whole Q&A turn | `Turn 3 · Q&A` |
| The last few turns at once | `Last 2 turns`, `Last 3 turns`, `Last 5 turns` |
| Search the bodies first | type after `@`; rows show match counts and the matching excerpt |

A pick stays a compact chip in the draft (`@last3turns`); at send time the chip expands into a
delimited quote block, so the model receives the earlier text.

## Install

```sh
dsh plugin --profile <your profile> add https://github.com/bzsang/dsh-turn-quote
```

- Current version: **0.2.0** (plain JavaScript, no build step)
- Requires DeepSeek Harness `>=0.2.1-rc.5 <0.3.0` (verified on 0.2.2-rc.1)
- Not published to npm yet — install from GitHub; restart the profile afterwards
- Or search `turn quote` / `引用上文` in the **Open Plugin Market** index of Plugins → Discover

## Usage

1. Type `@` in the composer; the menu shows three sections:

   - **Earlier turns** — single messages, newest first
   - **Whole turns (Q&A)** — one turn's question plus answer
   - **Recent multi-turn** — several consecutive turns at once

   The `“` button on the left of the composer tool row does the same thing (it inserts `@`).

2. **Search** — keep typing after `@`:

   | Input | Effect |
   | --- | --- |
   | `@blank screen` | search bodies; the row shows `1 match · …excerpt…` |
   | `@3` / `@turn 3` | restrict to turn 3 |
   | `@you` / `@assistant` | restrict to one speaker |

3. The draft keeps one small chip; the caret stays after it, so you can keep writing. Repeating
   `@` stacks several quotes.

4. On send, the chips expand into blocks. A whole turn:

```
[Quoted earlier turn · Turn 3 · Q&A]
You: the project board is blank, clicking it does nothing
Assistant: it was a hooks-order bug from an early return; fixed, with a smoke test.
[/Quoted earlier turn]
```

Several turns:

```
[Quoted earlier turns · last 3 (turns 2–4)]
You: round 2: add bulk actions for status and assignee
Assistant: bulk bar added; it writes back row by row and reports failures.
…
[/Quoted earlier turn]
```

## FAQ

**How is this different from "quote selected text" plugins?**
Those need a manual selection; this quotes whole **turns** — no selecting, and it can carry a
whole Q&A turn or the last few turns in one pick.

**Does it modify or delete my history?**
No. It only **reads** the loaded conversation and appends it to the message you are writing. No
network requests, no file writes, no rewinds.

**Why are some older turns missing?**
It only covers the conversation **currently loaded** in the session window; older messages that
have not been loaded yet do not appear.

**What happens to very long quotes?**
One reference keeps at most 4000 characters and notes how many were omitted; multi-turn quotes
share that budget in order.

**Is `@"..."` still available?**
Yes — that is DSH's own path-reference grammar and this plugin leaves quoted searches alone.

**How do I uninstall it?**
Remove `dsh-turn-quote` in the plugin manager, or
`dsh plugin --profile <profile> remove dsh-turn-quote`.

**Why no npm package?**
Not required: both markets accept a public repository with a pinned commit. Publishing to npm
would additionally list it in the Awesome DSH index (npm-only), show download counts, and let
the market follow new versions automatically.

## How it differs

Three neighbouring groups in the plugin market are not the same thing:

| Neighbour | Examples | Difference |
| --- | --- | --- |
| Sources added to `@` | `dsh-reference-anything`, `dsh-expert` | they reference *other* sessions, other AI's histories or an expert roster; this quotes the **current** conversation's own earlier turns |
| Quote selected text or code | `dsh-client-ui-quote`, `dsh-cherry-quote`, `dsh-quote-reply`, `@kialajin/dsh-quote-selection` | those need a manual selection; this quotes by **turn** |
| Rewind or resend a turn | `dsh-session-rewind`, `@anionex/dsh-turn-rewind`, `@jochenyang/dsh-rewind-plugin` | rewind withdraws the turn from the conversation; this **deletes nothing** and only appends the quoted text |

In one line: **by turn, not by selected text — and it quotes, it does not rewind.**

## Implementation

A browser-side plugin; the Host half is an empty `apply` (no tools, no services, no session
events):

- registers an `@` trigger source with `ctx.inputTriggers.registerSource()`, next to the shipped
  file/session references;
- picks go through the official chip channel (`slash/input-insert-reference`), so undo, draft
  persistence and copy behaviour stay native;
- at send time the chip's `codec.serialize()` expands the quote block;
- candidates come from the Session Controller's loaded event window
  (`sessions.binding(id).eventSource`); no extra RPC;
- only human prompts (`source.kind === "user"`) and assistant messages carrying text are
  offered — injected context, skill catalogues and runtime notes never show up.

## Security

- No network requests, no data leaves your machine; quoted text only goes back into your own
  composer and message.
- Plugins run as third-party code with full permissions; this package calls no system commands
  and does not read or write workspace files.

## Changelog

- **0.2.0** — whole-Q&A quotes (`Turn N · Q&A`), recent multi-turn bundles (last 2/3/5 turns),
  and body search with match counts and hit-context excerpts; fixes the client module id
  mismatch that kept the button and the `@` group from loading after an upgrade.
- **0.1.0** — first release: quote an earlier turn from `@`, composer quote button, expand on send.

## License

MIT © 2026 Guodong Wang
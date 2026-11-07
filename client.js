/**
 * @local/turn-quote — browser half.
 *
 * Lets the user bring an earlier turn of the *current* conversation back into
 * the message being composed. Two entry points share one implementation:
 *
 *  - typing `@` in the composer lists earlier turns ("对话上文") next to the
 *    shipped file/folder/session references;
 *  - the quote button at the left of the composer tool row opens that same
 *    list by inserting the `@` trigger at the caret.
 *
 * A pick becomes an ordinary inline reference chip, so the draft keeps one
 * compact label instead of the pasted body. The chip is expanded at submit
 * time by the source codec: the model receives the earlier turn's text in a
 * delimited block, while the draft, Undo history, and the persisted draft
 * snapshot keep only the chip.
 *
 * Data comes from the Session Controller's loaded event window
 * (`sessions.binding(id).eventSource`), which the Conversation already holds
 * open for the current Session; no Host row, Remote call, or extra read is
 * involved. Only human prompts (`source.kind === "user"`) and assistant
 * messages that carry text are offered, so injected context, steering, and
 * compaction checkpoints never appear in the menu.
 */
window.__ModuleLoader__.load({
  id: '@local/turn-quote',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'turn-quote'
    /** Trigger-source name; also the chip's serializer routing key. */
    const SOURCE = 'turnQuote'
    /** Newest rows offered by one menu opening. */
    const MAX_CANDIDATES = 30
    /** Longest quoted body kept in one reference; longer text is truncated. */
    const MAX_QUOTE_CHARS = 4000
    /** Width of the candidate description snippet. */
    const SNIPPET_CHARS = 56
    /** Payload version carried inside a chip `ref`. */
    const REF_VERSION = 1

    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      'meta.title': '引用上文',
      'section.turns': '对话上文',
      'item.user': '第{n}轮·我',
      'item.assistant': '第{n}轮·助手',
      'clip.user': '@第{n}轮·我',
      'clip.assistant': '@第{n}轮·助手',
      'quote.header.user': '【引用上文 · 第{n}轮 · 我】',
      'quote.header.assistant': '【引用上文 · 第{n}轮 · 助手】',
      'quote.end': '【/引用上文】',
      'quote.truncated': '（原消息较长，以上为前 {kept} 字，已省略 {rest} 字）',
      'quote.unavailable': '（引用内容不可用：原消息不在已加载的历史中）',
      'button.label': '引用上文',
      'button.tooltip': '引用本次对话前文（也可直接输入 @）',
    }

    /** English dictionary, checked complete against the zh key set. */
    const en = {
      'meta.title': 'Quote earlier turns',
      'section.turns': 'Earlier turns',
      'item.user': 'Turn {n} · You',
      'item.assistant': 'Turn {n} · Assistant',
      'clip.user': '@turn{n}·you',
      'clip.assistant': '@turn{n}·ai',
      'quote.header.user': '[Quoted earlier turn · Turn {n} · You]',
      'quote.header.assistant': '[Quoted earlier turn · Turn {n} · Assistant]',
      'quote.end': '[/Quoted earlier turn]',
      'quote.truncated': '(The earlier message is long: the first {kept} characters are kept and {rest} characters are omitted.)',
      'quote.unavailable': '(Unavailable: the referenced message is no longer in the loaded history.)',
      'button.label': 'Quote an earlier turn',
      'button.tooltip': 'Quote an earlier turn of this conversation (you can also type @)',
    }

    /** Local styles for the composer tool-row button (theme tokens only). */
    const BUTTON_CSS = '.tq-quote-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}' +
      '.tq-quote-button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}' +
      '.tq-quote-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}' +
      '.tq-quote-glyph{display:block;font:600 19px/1 Georgia,"Times New Roman",serif;transform:translateY(2px)}'

    /**
     * Join the text blocks of one message payload.
     * @param blocks - message content array (text, image, file, tool blocks).
     * @returns the concatenated plain text, trimmed; empty when none.
     */
    function textOfBlocks(blocks) {
      if (!Array.isArray(blocks)) return ''
      const parts = []
      for (const block of blocks) {
        if (block === null || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
      }
      return parts.join('\n').trim()
    }

    /**
     * Fold the loaded Session event window into the earlier turns a user may quote.
     *
     * Only durable entries count: transient assistant stream frames are rolled up
     * into their settlement, so reading them would duplicate the same text. One
     * Turn produces at most one row per speaker — the assistant's several Step
     * messages are joined into that Turn's answer — so the menu stays one entry
     * per thing a user would actually mean by "that earlier turn".
     * @param entries - `eventSource.getSnapshot().entries`.
     * @returns turns in log order, each with its seq, speaker, human turn number, and text.
     */
    function collectTurns(entries) {
      const turns = []
      let humanTurns = 0
      const push = (item) => {
        const last = turns.length === 0 ? undefined : turns[turns.length - 1]
        if (last !== undefined && last.role === item.role && last.turn === item.turn) {
          last.text = `${last.text}\n\n${item.text}`
          last.seq = item.seq
          return
        }
        turns.push(item)
      }
      for (const entry of entries) {
        if (entry === null || typeof entry !== 'object') continue
        if (entry.type === 'transient') continue
        const event = entry.event
        if (event === null || typeof event !== 'object') continue
        if (event.type === 'user/message') {
          const message = event.data
          if (message === null || typeof message !== 'object') continue
          const source = message.source
          if (source === null || typeof source !== 'object' || source.kind !== 'user') continue
          humanTurns += 1
          const text = textOfBlocks(message.content)
          if (text === '') continue
          push({ seq: event.seq, time: event.time, role: 'user', turn: humanTurns, text })
          continue
        }
        if (event.type === 'assistant/message') {
          const data = event.data
          if (data === null || typeof data !== 'object') continue
          const text = textOfBlocks(data.message === undefined ? undefined : data.message.content)
          if (text === '') continue
          push({ seq: event.seq, time: event.time, role: 'assistant', turn: Math.max(humanTurns, 1), text })
        }
      }
      return turns
    }

    /** Collapse whitespace and cut one candidate preview line. */
    function snippet(text, limit) {
      const flat = text.replace(/\s+/g, ' ').trim()
      if (flat.length <= limit) return flat
      return `${flat.slice(0, limit)}…`
    }

    /** Human and assistant words used by the query match, per active locale. */
    function matchWords(item, t) {
      const label = item.role === 'user' ? t('item.user', { n: item.turn }) : t('item.assistant', { n: item.turn })
      return `${label}\n${item.turn}\n第${item.turn}轮\nturn ${item.turn}`
    }

    /** One menu row for an earlier turn. */
    function candidateOf(item, t) {
      const label = item.role === 'user' ? t('item.user', { n: item.turn }) : t('item.assistant', { n: item.turn })
      const clip = item.role === 'user' ? t('clip.user', { n: item.turn }) : t('clip.assistant', { n: item.turn })
      // Keep the chip payload bounded: the draft snapshot persists it, and the
      // model-facing block is capped at the same size anyway.
      const kept = item.text.length > MAX_QUOTE_CHARS ? item.text.slice(0, MAX_QUOTE_CHARS) : item.text
      return {
        name: label,
        description: snippet(item.text, SNIPPET_CHARS),
        icon: 'session',
        section: t('section.turns'),
        value: JSON.stringify({
          v: REF_VERSION,
          seq: item.seq,
          time: item.time,
          role: item.role,
          turn: item.turn,
          label,
          clip,
          text: kept,
          omitted: item.text.length - kept.length,
        }),
      }
    }

    /**
     * Render one chip payload into the model-facing quote block.
     * @param payload - decoded chip `ref`.
     * @param t - bound translator.
     * @returns the delimited block the sent message carries.
     */
    function formatQuote(payload, t) {
      if (payload === null || typeof payload !== 'object' || typeof payload.text !== 'string') return t('quote.unavailable')
      const header = payload.role === 'user'
        ? t('quote.header.user', { n: payload.turn })
        : t('quote.header.assistant', { n: payload.turn })
      let body = payload.text.trim()
      const omitted = typeof payload.omitted === 'number' && payload.omitted > 0 ? payload.omitted : 0
      if (omitted > 0) body = `${body}\n${t('quote.truncated', { kept: body.length, rest: omitted })}`
      return `${header}\n${body}\n${t('quote.end')}`
    }

    /** Decode a chip `ref` without throwing. */
    function decodeRef(ref) {
      try {
        const payload = JSON.parse(String(ref))
        return payload !== null && typeof payload === 'object' ? payload : undefined
      } catch (_error) {
        return undefined
      }
    }

    /**
     * Build the `@` trigger source over one locale binding.
     * @param t - bound translator.
     * @param sessions - Session Controller Client service, when installed.
     * @returns the trigger source.
     */
    function createSource(t, sessions) {
      /** The Session Controller's loaded event entries, or undefined when unavailable. */
      const entriesOf = (sessionId) => {
        if (sessions === undefined || typeof sessionId !== 'string') return undefined
        try {
          const binding = sessions.binding(sessionId)
          if (binding === undefined) return undefined
          const source = binding.eventSource
          if (source === undefined || typeof source.getSnapshot !== 'function') return undefined
          const snapshot = source.getSnapshot()
          return snapshot !== null && typeof snapshot === 'object' && Array.isArray(snapshot.entries) ? snapshot.entries : undefined
        } catch (_error) {
          return undefined
        }
      }

      return {
        trigger: '@',
        name: SOURCE,
        // Ahead of the shipped file/session groups so an empty `@` opens on the
        // most recent turn; with a typed query this group simply drops out.
        order: -1,
        // Rows carry their own section heading.
        showGroupTitle: false,
        async candidates(session, request) {
          // `@"…"` is the shipped quoted-path grammar for file search only.
          if (request.quoted === true) return []
          const sessionId = session === undefined || session === null ? undefined : session.sessionId
          const entries = entriesOf(sessionId)
          if (entries === undefined) return []
          const query = typeof request.query === 'string' ? request.query.trim().toLowerCase() : ''
          const matched = collectTurns(entries).filter((item) => {
            if (query === '') return true
            return `${matchWords(item, t)}\n${item.text}`.toLowerCase().includes(query)
          })
          return matched.slice(-MAX_CANDIDATES).reverse().map((item) => candidateOf(item, t))
        },
        onPick({ candidate }) {
          if (candidate === undefined || candidate === null) return undefined
          const payload = decodeRef(candidate.value)
          if (payload === undefined) return undefined
          return {
            insert: {
              source: SOURCE,
              ref: JSON.stringify(payload),
              label: typeof payload.label === 'string' ? payload.label : t('meta.title'),
              appearance: 'session',
              clipboardText: typeof payload.clip === 'string' ? payload.clip : '@quote',
            },
          }
        },
        codec: {
          clipboardText(ref) {
            const payload = decodeRef(ref)
            return payload !== undefined && typeof payload.clip === 'string' ? payload.clip : '@quote'
          },
          async serialize(ref) {
            return formatQuote(decodeRef(ref), t)
          },
        },
      }
    }

    /**
     * Composer tool-row button: put the `@` trigger at the caret so the shared
     * mention menu opens over the current draft.
     * @param props - Session-scoped standard props plus the bound translator.
     * @returns the quote button.
     */
    function QuoteButton({ inputActions, sessionId, t }) {
      const open = () => {
        if (inputActions === undefined) return
        try {
          const span = inputActions.captureInsertion()
          inputActions.insertText('@', span)
        } catch (_error) {
          // The composer refuses insertion while submitting or locked; the
          // gesture then simply changes nothing.
        }
      }
      return h(React.Fragment, null,
        h('style', { key: 'style' }, BUTTON_CSS),
        h('button', {
          key: 'button',
          type: 'button',
          className: 'tq-quote-button',
          title: t('button.tooltip'),
          'aria-label': t('button.label'),
          onClick: open,
          disabled: inputActions === undefined || sessionId === undefined,
        }, h('span', { className: 'tq-quote-glyph', 'aria-hidden': true }, '“')))
    }

    /**
     * Register the mention source, the dictionary, and the composer button.
     * @param ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'turn-quote: dictionaries')
      const t = ctx.locale.bind(NS)
      const inputTriggers = ctx.get('inputTriggers')
      const sessions = ctx.get('sessions')
      if (inputTriggers !== undefined) {
        ctx.effect(() => inputTriggers.registerSource(createSource(t, sessions)), 'turn-quote: @ source')
      }
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'turn-quote',
        order: 20,
        locale: NS,
        label: () => t('button.label'),
      }, QuoteButton))
    }

    return {
      inject: ['slots', 'locale', 'inputTriggers', 'sessions'],
      apply,
    }
  },
})
/**
 * dsh-turn-quote — browser half.
 *
 * Brings an earlier turn (or several turns) of the *current* conversation back
 * into the message being composed. Three entry points share one implementation:
 *
 *  - typing `@` in the composer lists earlier turns ("对话上文") next to the
 *    shipped file/folder/session references;
 *  - the same menu offers whole **Q&A pairs** and **recent multi-turn bundles**,
 *    so one pick can quote several questions and answers at once;
 *  - the quote button at the left of the composer tool row opens that menu by
 *    inserting the `@` trigger at the caret.
 *
 * A pick becomes an ordinary inline reference chip, so the draft keeps one
 * compact label instead of the pasted body. The chip is expanded at submit
 * time by the source codec: the model receives a delimited quote block, while
 * the draft, Undo history, and the persisted draft snapshot keep only the chip.
 *
 * Typing after `@` searches the loaded turns (turn number, speaker, or body
 * text); a hit shows the matching excerpt instead of the head of the message.
 *
 * Data comes from the Session Controller's loaded event window
 * (`sessions.binding(id).eventSource`), which the Conversation already holds
 * open for the current Session; no Host row, Remote call, or extra read is
 * involved. Only human prompts (`source.kind === "user"`) and assistant
 * messages that carry text are offered, so injected context, steering, and
 * compaction checkpoints never appear in the menu.
 */
window.__ModuleLoader__.load({
  id: 'dsh-turn-quote',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'turn-quote'
    /** Trigger-source name; also the chip's serializer routing key. */
    const SOURCE = 'turnQuote'
    /** Newest single-turn rows offered by one menu opening. */
    const MAX_TURN_ROWS = 16
    /** Newest Q&A pair rows offered by one menu opening. */
    const MAX_PAIR_ROWS = 8
    /** Recent multi-turn bundles offered (in addition to pairs). */
    const BUNDLE_SIZES = [2, 3, 5]
    /** Longest quoted body kept in one reference; longer text is truncated. */
    const MAX_QUOTE_CHARS = 4000
    /** Width of the candidate description snippet. */
    const SNIPPET_CHARS = 64
    /** Characters of context shown before a search hit. */
    const SNIPPET_LEAD = 18
    /** Payload version carried inside a chip `ref`. */
    const REF_VERSION = 2

    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      'meta.title': '引用上文',
      'section.turns': '对话上文',
      'section.pairs': '整轮问答',
      'section.bundles': '最近多轮',
      'item.user': '第{n}轮·我',
      'item.assistant': '第{n}轮·助手',
      'item.pair': '第{n}轮·问答',
      'item.bundle': '最近{n}轮',
      'clip.user': '@第{n}轮·我',
      'clip.assistant': '@第{n}轮·助手',
      'clip.pair': '@第{n}轮·问答',
      'clip.bundle': '@最近{n}轮',
      'quote.header.single': '【引用上文 · 第{n}轮 · {who}】',
      'quote.header.pair': '【引用上文 · 第{n}轮 · 问答】',
      'quote.header.bundle': '【引用上文 · 最近{n}轮（第{from}–{to}轮）】',
      'quote.speaker.user': '我',
      'quote.speaker.assistant': '助手',
      'quote.end': '【/引用上文】',
      'quote.truncated': '（原消息较长，以上为前 {kept} 字，已省略 {rest} 字）',
      'quote.unavailable': '（引用内容不可用：原消息不在已加载的历史中）',
      'match.count': '命中 {n} 处 · ',
      'button.label': '引用上文',
      'button.tooltip': '引用本次对话前文（也可直接输入 @）',
    }

    /** English dictionary, checked complete against the zh key set. */
    const en = {
      'meta.title': 'Quote earlier turns',
      'section.turns': 'Earlier turns',
      'section.pairs': 'Whole turns (Q&A)',
      'section.bundles': 'Recent multi-turn',
      'item.user': 'Turn {n} · You',
      'item.assistant': 'Turn {n} · Assistant',
      'item.pair': 'Turn {n} · Q&A',
      'item.bundle': 'Last {n} turns',
      'clip.user': '@turn{n}·you',
      'clip.assistant': '@turn{n}·ai',
      'clip.pair': '@turn{n}·qna',
      'clip.bundle': '@last{n}turns',
      'quote.header.single': '[Quoted earlier turn · Turn {n} · {who}]',
      'quote.header.pair': '[Quoted earlier turn · Turn {n} · Q&A]',
      'quote.header.bundle': '[Quoted earlier turns · last {n} (turns {from}–{to})]',
      'quote.speaker.user': 'You',
      'quote.speaker.assistant': 'Assistant',
      'quote.end': '[/Quoted earlier turn]',
      'quote.truncated': '(The earlier message is long: the first {kept} characters are kept and {rest} characters are omitted.)',
      'quote.unavailable': '(Unavailable: the referenced message is no longer in the loaded history.)',
      'match.count': '{n} match · ',
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
     * messages are joined into that Turn's answer.
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

    /** Group turns by their human turn number, keeping log order. */
    function turnGroups(turns) {
      const groups = new Map()
      for (const item of turns) {
        const current = groups.get(item.turn)
        if (current === undefined) groups.set(item.turn, { turn: item.turn, user: undefined, assistant: undefined })
        const group = groups.get(item.turn)
        group[item.role] = item
      }
      return [...groups.values()].sort((left, right) => left.turn - right.turn)
    }

    /** A turn's text blocks, in speaker order. */
    function partsOf(group) {
      const parts = []
      if (group.user !== undefined) parts.push(group.user)
      if (group.assistant !== undefined) parts.push(group.assistant)
      return parts
    }

    /** Collapse whitespace and cut one preview line. */
    function flat(text) {
      return text.replace(/\s+/g, ' ').trim()
    }

    /** Count case-insensitive occurrences of `needle` in `haystack`. */
    function countMatches(haystack, needle) {
      if (needle === '') return 0
      const hay = haystack.toLowerCase()
      let at = hay.indexOf(needle)
      let count = 0
      while (at >= 0) {
        count += 1
        at = hay.indexOf(needle, at + needle.length)
      }
      return count
    }

    /**
     * Preview one candidate: the matching excerpt when a query is given, else
     * the head of the text.
     */
    function preview(text, query, t) {
      const body = flat(text)
      if (query === '') return body.length <= SNIPPET_CHARS ? body : `${body.slice(0, SNIPPET_CHARS)}…`
      const at = body.toLowerCase().indexOf(query)
      if (at < 0) return body.length <= SNIPPET_CHARS ? body : `${body.slice(0, SNIPPET_CHARS)}…`
      const start = Math.max(0, at - SNIPPET_LEAD)
      const end = Math.min(body.length, start + SNIPPET_CHARS)
      const head = start > 0 ? '…' : ''
      const tail = end < body.length ? '…' : ''
      return `${head}${body.slice(start, end)}${tail}`
    }

    /** Labels and clipboard text for one candidate kind. */
    function labelsOf(kind, turn, size, t) {
      if (kind === 'pair') return { label: t('item.pair', { n: turn }), clip: t('clip.pair', { n: turn }) }
      if (kind === 'bundle') return { label: t('item.bundle', { n: size }), clip: t('clip.bundle', { n: size }) }
      return null
    }

    /** Payload parts for a set of turn groups, capped to the quote budget. */
    function payloadParts(groups) {
      const parts = []
      let remaining = MAX_QUOTE_CHARS
      for (const group of groups) {
        for (const item of partsOf(group)) {
          if (remaining <= 0) return { parts, omitted: item.text.length }
          const kept = item.text.length > remaining ? item.text.slice(0, remaining) : item.text
          const omitted = item.text.length - kept.length
          parts.push({
            role: item.role,
            turn: item.turn,
            text: kept,
            omitted,
          })
          remaining -= kept.length
        }
      }
      return { parts, omitted: 0 }
    }

    /** One menu row for a single speaker message. */
    function candidateTurn(item, query, t) {
      const label = item.role === 'user' ? t('item.user', { n: item.turn }) : t('item.assistant', { n: item.turn })
      const clip = item.role === 'user' ? t('clip.user', { n: item.turn }) : t('clip.assistant', { n: item.turn })
      const hits = query === '' ? 0 : countMatches(item.text, query)
      return {
        name: label,
        description: (hits > 0 ? t('match.count', { n: hits }) : '') + preview(item.text, query, t),
        icon: 'session',
        section: t('section.turns'),
        value: JSON.stringify({
          v: REF_VERSION,
          kind: 'single',
          turn: item.turn,
          role: item.role,
          ...labelsOf('single', item.turn, 0, t),
          label,
          clip,
          ...payloadParts([{ user: item.role === 'user' ? item : undefined, assistant: item.role === 'assistant' ? item : undefined }]),
        }),
      }
    }

    /** One menu row for a whole turn: question plus answer. */
    function candidatePair(group, query, t) {
      const texts = partsOf(group).map((part) => part.text).join('\n')
      const hits = query === '' ? 0 : countMatches(texts, query)
      const previewText = partsOf(group).find((part) => query !== '' && countMatches(part.text, query) > 0) ?? partsOf(group)[0]
      const labels = labelsOf('pair', group.turn, 0, t)
      return {
        name: labels.label,
        description: (hits > 0 ? t('match.count', { n: hits }) : '') + preview(previewText.text, query, t),
        icon: 'session',
        section: t('section.pairs'),
        value: JSON.stringify({
          v: REF_VERSION,
          kind: 'pair',
          turn: group.turn,
          ...labels,
          ...payloadParts([group]),
        }),
      }
    }

    /** One menu row for the last N turns, questions and answers together. */
    function candidateBundle(groups, size, query, t) {
      const texts = groups.map((group) => partsOf(group).map((part) => part.text).join('\n')).join('\n')
      const hits = query === '' ? 0 : countMatches(texts, query)
      const from = groups[0].turn
      const to = groups[groups.length - 1].turn
      const labels = labelsOf('bundle', 0, size, t)
      const previewText = groups
        .flatMap((group) => partsOf(group))
        .find((part) => query !== '' && countMatches(part.text, query) > 0) ?? partsOf(groups[groups.length - 1])[0]
      return {
        name: labels.label,
        description: (hits > 0 ? t('match.count', { n: hits }) : `第${from}–${to}轮 · `) + preview(previewText.text, query, t),
        icon: 'session',
        section: t('section.bundles'),
        value: JSON.stringify({
          v: REF_VERSION,
          kind: 'bundle',
          turns: groups.map((group) => group.turn),
          size,
          ...labels,
          ...payloadParts(groups),
        }),
      }
    }

    /**
     * Render one chip payload into the model-facing quote block.
     * Handles both the single-turn shape and the multi-part shape.
     * @param payload - decoded chip `ref`.
     * @param t - bound translator.
     * @returns the delimited block the sent message carries.
     */
    function formatQuote(payload, t) {
      if (payload === null || typeof payload !== 'object') return t('quote.unavailable')

      const parts = Array.isArray(payload.parts)
        ? payload.parts
        : typeof payload.text === 'string'
          ? [{ role: payload.role, turn: payload.turn, text: payload.text, omitted: payload.omitted }]
          : []
      if (parts.length === 0) return t('quote.unavailable')

      const speaker = (role) => (role === 'user' ? t('quote.speaker.user') : t('quote.speaker.assistant'))
      let header
      if (payload.kind === 'pair') header = t('quote.header.pair', { n: payload.turn })
      else if (payload.kind === 'bundle') {
        header = t('quote.header.bundle', {
          n: payload.size,
          from: Array.isArray(payload.turns) && payload.turns.length > 0 ? payload.turns[0] : '',
          to: Array.isArray(payload.turns) && payload.turns.length > 0 ? payload.turns[payload.turns.length - 1] : '',
        })
      } else header = t('quote.header.single', { n: payload.turn, who: speaker(payload.role) })

      const lines = [header]
      for (const part of parts) {
        const body = String(part.text ?? '').trim()
        if (body === '') continue
        lines.push(payload.kind === 'single' ? body : `${speaker(part.role)}：${body}`)
        const omitted = typeof part.omitted === 'number' && part.omitted > 0 ? part.omitted : 0
        if (omitted > 0) lines.push(t('quote.truncated', { kept: body.length, rest: omitted }))
      }
      lines.push(t('quote.end'))
      return lines.join('\n')
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

    /** Whether any text in these payload parts matches the query. */
    function payloadMatches(parts, query) {
      if (query === '') return true
      return parts.some((part) => part.text.toLowerCase().includes(query))
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
          const turns = collectTurns(entries)
          if (turns.length === 0) return []
          const groups = turnGroups(turns)
          const rows = []

          const turnRows = [...turns]
            .reverse()
            .filter((item) => query === '' || `${item.turn}\n第${item.turn}轮\nturn ${item.turn}\n${item.role === 'user' ? '我 you me' : '助手 assistant'}\n${item.text}`.toLowerCase().includes(query))
            .slice(0, MAX_TURN_ROWS)
          for (const item of turnRows) rows.push(candidateTurn(item, query, t))

          const pairRows = [...groups]
            .reverse()
            .filter((group) => payloadMatches(partsOf(group), query))
            .slice(0, MAX_PAIR_ROWS)
          for (const group of pairRows) rows.push(candidatePair(group, query, t))

          for (const size of BUNDLE_SIZES) {
            if (groups.length < size) continue
            const slice = groups.slice(-size)
            if (!payloadMatches(slice.flatMap((group) => partsOf(group)), query)) continue
            rows.push(candidateBundle(slice, size, query, t))
          }
          return rows
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
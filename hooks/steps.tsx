import { atom, read, update } from 'claude-code'
import type { On, Timer } from 'claude-code'

import { STYLE, drawAnswer } from './answer'
import type { CodeChange, DiffLine, FileChange, Step, TurnSummary } from '../types'

const stepsAtom = atom({ plugin: 'clean-cli', key: 'steps' } as const, [])
const tickAtom = atom({ plugin: 'clean-cli', key: 'tick' } as const, 0)
const summariesAtom = atom({ plugin: 'clean-cli', key: 'summaries' } as const, {})
const expandedAtom = atom({ plugin: 'clean-cli', key: 'expanded' } as const, {})
const expandAllAtom = atom({ plugin: 'clean-cli', key: 'expandAll' } as const, false)

export const GREEN = '#5fb37a'
export const RED = '#e06c6c'
export const ACCENT = '#D97757'
/** What an empty prompt shows, dimmed. */
export const OPTIONS_HINT = '/o'
export const TRACK = '#3a3a3a'
export const BAR_WIDTH = 20

/** Tools that are not steps: conversation, not work. */
const SKIP = new Set(['TodoWrite', 'AskUserQuestion', 'SendUserMessage', 'ToolSearch'])

export function base(path: unknown): string {
  if (typeof path !== 'string' || !path) return ''
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/')
}

export function short(text: unknown, max = 48): string {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function lines(text: unknown): number {
  if (typeof text !== 'string' || text === '') return 0
  return text.split('\n').length
}

/** The step name, like "edit auth/login.ts" or "run npm test". */
export function stepLabel(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
      return `read ${base(args.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `edit ${base(args.file_path)}`
    case 'Write':
      return `create ${base(args.file_path)}`
    case 'NotebookEdit':
      return `edit ${base(args.notebook_path)}`
    case 'Bash':
      return `run ${short(args.description || args.command, 40)}`
    case 'Grep':
      return `search "${short(args.pattern, 30)}"`
    case 'Glob':
      return `find ${short(args.pattern, 30)}`
    case 'WebSearch':
      return `web search ${short(args.query, 36)}`
    case 'WebFetch':
      return `open ${short(args.url, 36)}`
    case 'Agent':
    case 'Task':
      return `subagent: ${short(args.description, 34)}`
    default:
      return tool.replace(/^mcp__[^_]+__/, '').replace(/_/g, ' ').toLowerCase()
  }
}

/** Lines added and removed by an edit, from its arguments. */
export function lineDelta(tool: string, args: Record<string, unknown>): { added: number; removed: number } {
  if (tool === 'Write') return { added: lines(args.content), removed: 0 }
  if (tool === 'Edit') return { added: lines(args.new_string), removed: lines(args.old_string) }
  if (tool === 'MultiEdit' && Array.isArray(args.edits)) {
    return (args.edits as Record<string, unknown>[]).reduce<{ added: number; removed: number }>(
      (acc, one) => ({ added: acc.added + lines(one.new_string), removed: acc.removed + lines(one.old_string) }),
      { added: 0, removed: 0 },
    )
  }
  return { added: 0, removed: 0 }
}

export const MAX_DIFF_LINES = 8
/** How many lines per side to keep for the expanded view. */
export const MAX_STORED_LINES = 400
export const DIFF_BORDER = '#2e2e2e'

function splitLines(text: unknown): string[] {
  return typeof text === 'string' && text !== '' ? text.split('\n') : []
}

/** The code of a change: what was removed (−) and added (+), up to MAX_STORED_LINES per side. */
export function diffLines(tool: string, args: Record<string, unknown>): { lines: DiffLine[]; hidden: number } {
  const edits: { removed: string[]; added: string[] }[] =
    tool === 'Write'
      ? [{ removed: [], added: splitLines(args.content) }]
      : tool === 'MultiEdit' && Array.isArray(args.edits)
        ? (args.edits as Record<string, unknown>[]).map(one => ({
            removed: splitLines(one.old_string),
            added: splitLines(one.new_string),
          }))
        : tool === 'Edit'
          ? [{ removed: splitLines(args.old_string), added: splitLines(args.new_string) }]
          : []
  const lines: DiffLine[] = []
  let hidden = 0
  for (const one of edits) {
    for (const [sign, list] of [['−', one.removed], ['+', one.added]] as const) {
      list.slice(0, MAX_STORED_LINES).forEach(text => lines.push({ sign, text: text.trimEnd() }))
      hidden += Math.max(0, list.length - MAX_STORED_LINES)
    }
  }
  return { lines, hidden }
}

/** The collapsed view: the first MAX_DIFF_LINES lines per side; `more` is what was left out. */
export function collapse(lines: DiffLine[], hidden: number): { shown: DiffLine[]; more: number } {
  const count = { '−': 0, '+': 0 }
  const shown = lines.filter(l => ++count[l.sign] <= MAX_DIFF_LINES)
  return { shown, more: lines.length - shown.length + hidden }
}

/** Progress of a running step: fills fast, then slows down, never past 95%. */
export function runningPct(elapsedMs: number): number {
  return Math.min(95, Math.round(100 * (1 - Math.exp(-elapsedMs / 6000))))
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

export function summarize(steps: Step[], durationMs: number, answer = ''): TurnSummary {
  const byFile = new Map<string, FileChange>()
  for (const s of steps) {
    if (s.status !== 'done' || !s.file) continue
    const cur = byFile.get(s.file) ?? { file: s.file, added: 0, removed: 0 }
    byFile.set(s.file, { file: s.file, added: cur.added + s.added, removed: cur.removed + s.removed })
  }
  return {
    done: steps.filter(s => s.status === 'done').length,
    failed: steps.filter(s => s.status === 'failed').length,
    durationMs,
    files: [...byFile.values()].filter(f => f.added + f.removed > 0),
    changes: steps
      .filter(s => s.status === 'done' && s.file && (s.diff ?? []).length > 0)
      .map((s): CodeChange => ({ file: s.file as string, lines: s.diff, hidden: s.hidden })),
    answer,
  }
}


export function registerSteps(on: On): void {
  let ticker: Timer | null = null

  on('prompt.submit', async ($, e, next) => {
    await update($, stepsAtom, () => [])
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (!ticker) {
      ticker = $.clock.every(200, () => {
        void (async () => {
          const steps = await read($, stepsAtom)
          if (steps.some(s => s.status === 'running')) await update($, tickAtom, n => n + 1)
        })()
      })
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId || SKIP.has(e.tool)) return next(e)

    const args = e as unknown as Record<string, unknown>
    const id = e.tool_use_id ?? `${e.tool}-${await $.clock.now()}`
    const delta = lineDelta(e.tool, args)
    const code = diffLines(e.tool, args)
    const file = ['Edit', 'MultiEdit', 'Write'].includes(e.tool) ? base(args.file_path) : null
    const step: Step = {
      id,
      label: stepLabel(e.tool, args),
      status: 'running',
      startedAt: await $.clock.now(),
      endedAt: null,
      detail: null,
      file,
      added: delta.added,
      removed: delta.removed,
      diff: file ? code.lines : [],
      hidden: file ? code.hidden : 0,
    }
    await update($, stepsAtom, list => [...list, step].slice(-40))

    const ran = await next(e)

    const failed = ran.deny !== undefined || ran.isError === true
    const reason = ran.deny ?? (typeof ran.text === 'string' ? ran.text.split('\n')[0] : '')
    const detail = failed
      ? `failed: ${short(reason, 60) || 'error'}`
      : file
        ? `+${delta.added} −${delta.removed} lines`
        : null
    const endedAt = await $.clock.now()
    await update($, stepsAtom, list =>
      list.map(s => (s.id === id ? { ...s, status: failed ? 'failed' : 'done', endedAt, detail } : s)),
    )
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      ticker?.cancel()
      ticker = null
      const steps = await read($, stepsAtom)
      if (steps.length > 0) {
        const summary = summarize(steps, e.durationMs, e.answer ?? '')
        await update($, summariesAtom, all => {
          const keys = Object.keys(all).slice(-49)
          const kept: Record<string, TurnSummary> = {}
          for (const k of keys) kept[k] = all[k] as TurnSummary
          kept[String(e.durationMs)] = summary
          return kept
        })
      }
    }
    const done = await next(e)
    if (!e.agentId) void $.prompt.suggest({ text: OPTIONS_HINT }).catch(() => undefined)
    return done
  })

  // After the steps: the code of each change and, below it, the AI answer. No duration line or step
  // count, since the bars already showed that. "… N more lines" expands a box; /expand opens them all.
  on('ui.render', { component: 'TurnDuration' }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const all = await read($, summariesAtom)
    const summary = all[String(e.props.durationMs)]
    const changes = summary?.changes ?? []
    if (changes.length === 0) return <Box />

    const expanded = await read($, expandedAtom)
    const expandAll = await read($, expandAllAtom)

    return (
      <Box flexDirection="column">
        <Text key="gap">{'\u00a0'}</Text>
        {changes.map((c, i) => {
          const id = `${e.props.durationMs}:${i}`
          const isOpen = expandAll || expanded[id] === true
          const { shown, more } = collapse(c.lines, c.hidden)
          const lines = isOpen ? c.lines : shown
          return (
            <Box key={`change-${i}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
              <Text dimColor>{c.file}</Text>
              <Box flexDirection="column" borderStyle="round" borderColor={DIFF_BORDER} paddingX={1}>
                {lines.map((l, j) => (
                  <Text key={`c${i}-${j}`} color={l.sign === '+' ? GREEN : RED} wrap="truncate-end">
                    {l.sign} {l.text}
                  </Text>
                ))}
                {more > 0 && !expandAll ? (
                  <Button
                    key={`more-${id}`}
                    plain
                    dimColor
                    label={isOpen ? '▴ collapse' : `… ${more} more lines`}
                    onPress={() =>
                      update($, expandedAtom, map => {
                        const next = { ...map }
                        if (isOpen) delete next[id]
                        else next[id] = true
                        return next
                      })
                    }
                  />
                ) : null}
                {isOpen && c.hidden > 0 ? <Text dimColor>… {c.hidden} more lines too long to show</Text> : null}
              </Box>
            </Box>
          )
        })}
        {summary?.answer ? drawAnswer(els, summary.answer, true) : null}
      </Box>
    )
  })

  on('command.run', { command: 'expand' }, async $ => {
    await update($, expandAllAtom, v => !v)
    const now = await read($, expandAllAtom)
    return { text: now ? 'Full code: expanded' : 'Full code: collapsed' }
  })

  // Short, direct answers.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return {
      ...composed,
      sections: [...composed.sections, { id: 'clean-cli-style', text: STYLE, scope: 'session' as const }],
    }
  })
}

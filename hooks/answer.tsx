import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import type { TurnSummary } from '../types'

import { GREEN, RED } from './steps'

const CODE_COLOR = '#e8e8e8'
const CODE_BG = '#262626'
const SPACER = ' '

export type Tone = 'ok' | 'fail' | null
export type Segment = { kind: 'text' | 'code' | 'bold'; text: string }

/**
 * Claude marks outcomes itself (see STYLE): a part that starts with ✓ worked, one that starts
 * with ✕ failed. No word lists, so it works the same in any language.
 */
export function tone(part: string): Tone {
  const t = part.trimStart()
  if (t.startsWith('✕')) return 'fail'
  if (t.startsWith('✓')) return 'ok'
  return null
}

/** Splits `code` and **bold** from plain text. */
export function parseInline(text: string): Segment[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part): Segment =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1
        ? { kind: 'code', text: part.slice(1, -1) }
        : part.startsWith('**') && part.endsWith('**') && part.length > 3
          ? { kind: 'bold', text: part.slice(2, -2) }
          : { kind: 'text', text: part },
    )
}

/** Lists, tables, headings and code blocks keep Claude Code's own formatting. */
export function isComplex(text: string): boolean {
  return /```|^\s*([-*+]|\d+[.)])\s|^\s*#{1,6}\s|^\s*\|/m.test(text)
}

/** Splits a paragraph where Claude put a ✓ or ✕ mark; each part keeps its own color. */
export function parts(paragraph: string): string[] {
  return paragraph
    .replace(/\s*\n\s*/g, ' ')
    .split(/(?=[✓✕])/)
    .filter(s => s.trim() !== '')
}

const STYLE = [
  'This interface is minimal and to the point; keep every reply as short as it can be while still complete.',
  'After doing work: lead with the result in one sentence, then at most two more short sentences, only for what the person must know (what failed and what to do about it, a decision they need to make).',
  'Do not restate the request, describe your process, list the steps or files (the interface already shows them), or paste error messages or command output: name the error in a few words.',
  'For a question: answer it directly first, in as few sentences as the question needs; add detail only when asked or when the answer would be wrong without it.',
  'No headings, no bullet lists unless the content is genuinely a list, no closing offers or summaries. Reply in the language the person writes in.',
  'Mark outcomes so the interface can color them: start a sentence about something that worked with "✓ " and a sentence about something that failed or still needs action with "✕ ". Use these marks only for outcomes, in any language, never as decoration.',
].join(' ')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Elements = { Box: any; Text: any; Markdown: any }

/** Draws an answer in the mod's style; used in place of the answer and below the code boxes. */
export function drawAnswer({ Box, Text, Markdown }: Elements, raw: string, withGap: boolean) {
  const text = raw.trim()
  if (isComplex(text)) {
    return (
      <Box flexDirection="column" paddingLeft={2}>
        {withGap ? <Text key="gap">{SPACER}</Text> : null}
        <Markdown key="md" text={text} />
      </Box>
    )
  }

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim() !== '')
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {withGap ? <Text key="gap">{SPACER}</Text> : null}
      {paragraphs.map((para, i) => (
        <Box key={`p${i}`} marginTop={i === 0 ? 0 : 1}>
          <Text>
            {parts(para).map((s, j) => {
              const t = tone(s)
              const color = t === 'fail' ? RED : t === 'ok' ? GREEN : undefined
              return (
                <Text key={`s${i}-${j}`} color={color}>
                  {parseInline(s).map((seg, k) =>
                    seg.kind === 'code' ? (
                      <Text key={`g${k}`} color={CODE_COLOR} backgroundColor={CODE_BG}>
                        {` ${seg.text} `}
                      </Text>
                    ) : seg.kind === 'bold' ? (
                      <Text key={`g${k}`} bold>
                        {seg.text}
                      </Text>
                    ) : (
                      seg.text
                    ),
                  )}
                </Text>
              )
            })}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

const summariesAtom = atom({ plugin: 'clean-cli', key: 'summaries' } as const, {})

/** True when this text is the final answer of a turn that changed code: it is drawn below the boxes instead. */
export function movedBelowCode(summaries: Record<string, TurnSummary>, text: string): boolean {
  const t = text.trim()
  if (t === '') return false
  return Object.values(summaries).some(s => (s.changes ?? []).length > 0 && (s.answer ?? '').includes(t))
}

export function registerAnswer(on: On): void {
  // The AI answer in the mod's style: no ●, indented like the bars,
  // `code` on a dark background, what worked in green and what failed in red.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)
    const els = $.ui.resolve(e)
    if (e.props.text.trim() === '') return next(e)

    // When the turn ends with code changes, the answer moves below the boxes.
    if (movedBelowCode(await read($, summariesAtom), e.props.text)) return <els.Box />

    return drawAnswer(els, e.props.text, e.props.isFirstOfReply)
  })
}

export { STYLE }

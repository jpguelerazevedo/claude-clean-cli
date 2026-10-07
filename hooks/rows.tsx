import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import { ACCENT, BAR_WIDTH, GREEN, RED, TRACK, lineDelta, runningPct, short, stepLabel } from './steps'

const stepsAtom = atom({ plugin: 'clean-cli', key: 'steps' } as const, [])
const tickAtom = atom({ plugin: 'clean-cli', key: 'tick' } as const, 0)

const LABEL_WIDTH = 36
/** A real blank line: the terminal ignores a top margin on a transcript row. */
export const SPACER = '\u00a0'

/** The first line of the error, shortened. */
export function errorLine(output: unknown): string {
  const text = typeof output === 'string' ? output : output == null ? '' : JSON.stringify(output)
  const first = text
    .replace(/<\/?tool_use_error>/g, '')
    .split('\n')
    .map(l => l.trim())
    .find(Boolean)
  return short(first ?? 'error', 80)
}

export function registerRows(on: On): void {
  // Each tool call becomes a step: icon, name, bar and ok/error.
  on('ui.render', { component: 'ToolUse' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const p = e.props
    const args = (p.input && typeof p.input === 'object' ? p.input : {}) as Record<string, unknown>
    const failed = p.isErrored || p.isInterrupted
    const running = p.isRunning && !failed

    let pct = 100
    if (running) {
      await read($, tickAtom)
      const step = (await read($, stepsAtom)).find(s => s.id === p.tool_use_id)
      pct = step ? runningPct((await $.clock.now()) - step.startedAt) : 0
    }
    const filled = Math.round((pct / 100) * BAR_WIDTH)
    const color = running ? ACCENT : failed ? RED : GREEN
    const icon = running ? '●' : failed ? '✕' : '✓'
    const status = running ? `${pct}%` : failed ? 'error' : 'ok'

    const delta = lineDelta(p.tool, args)
    const hasDelta = !failed && !running && delta.added + delta.removed > 0

    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Text key="gap">{SPACER}</Text>
        <Box gap={1}>
          <Text color={color}>{icon}</Text>
          <Box width={LABEL_WIDTH}>
            <Text dimColor={running} wrap="truncate-end">
              {stepLabel(p.tool, args)}
            </Text>
          </Box>
          <Text color={color}>{'━'.repeat(filled)}</Text>
          <Text color={TRACK}>{'━'.repeat(BAR_WIDTH - filled)}</Text>
          <Text color={running ? undefined : color} dimColor={running}>
            {status}
          </Text>
        </Box>
        {failed ? (
          <Box paddingLeft={2}>
            <Text color={RED} wrap="truncate-end">
              {p.isInterrupted ? 'interrupted' : `failed: ${errorLine(p.output)}`}
            </Text>
          </Box>
        ) : null}
        {hasDelta ? (
          <Box paddingLeft={2} gap={1}>
            <Text color={GREEN}>+{delta.added}</Text>
            {delta.removed > 0 ? <Text color={RED}>−{delta.removed}</Text> : null}
            <Text color={GREEN}>lines</Text>
          </Box>
        ) : null}
      </Box>
    )
  })

  // The raw result (file content, command output) is hidden: the step line already says what happened.
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // No "Ran 1 shell command": each call shows as its own step.
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, isExpanded: true } }),
  )
}

import { describe, expect, test } from 'claude-code/testing'

import { errorLine } from '../hooks/rows'
import { collapse, diffLines } from '../hooks/steps'

const row = (props: Record<string, unknown>) => ({
  plugin: 'clean-cli',
  component: 'ToolUse',
  requestId: 'tu1',
  props: { tool_use_id: 'tu1', isRunning: false, isErrored: false, isInterrupted: false, ...props },
})

describe('tool rows', () => {
  test('does not group into "Ran 1 shell command"', async ($, on) => {
    const seen: unknown[] = []
    on('ui.render', ($, e) => {
      seen.push((e.props as { isExpanded?: unknown }).isExpanded)
      const { Box } = $.ui.resolve(e)
      return h(Box, {}) as never
    })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'clean-cli',
        surface,
        component: 'ToolGroup',
        props: { calls: [], isActive: false, isExpanded: false },
      } as never)
      await ui.unmount()
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(v => v === true)).toBe(true)
  })

  test('short diff keeps at most 8 lines per side', async () => {
    const old = Array.from({ length: 10 }, (_, i) => `a${i}`).join('\n')
    const { lines, hidden } = diffLines('Edit', { old_string: old, new_string: 'b' })
    expect(lines).toHaveLength(11)
    expect(hidden).toBe(0)
    const { shown, more } = collapse(lines, hidden)
    expect(shown.filter(l => l.sign === '−')).toHaveLength(8)
    expect(shown.filter(l => l.sign === '+')).toHaveLength(1)
    expect(more).toBe(2)
  })

  test('an error shows only its first line', async () => {
    expect(errorLine('<tool_use_error>Cannot find module\n  at x</tool_use_error>')).toBe('Cannot find module')
  })

  test('creating a file is one line, without its content', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        ...row({ tool: 'Write', input: { file_path: 'C:\\p\\teste-mod\\calculadora.js', content: 'a\nb\nc' } }),
        surface,
      } as never)
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts[0]).toBe('\u00a0')
      expect(texts).toContain('✓')
      expect(texts).toContain('create teste-mod/calculadora.js')
      expect(texts).toContain('+3')
      expect(texts).toContain('ok')
      expect(texts).not.toContain('+ a')
      await ui.unmount()
    }
  })

  test('an edit shows only the bar and line counts, the code comes at the end', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        ...row({ tool: 'Edit', input: { file_path: 'x/calc.js', old_string: 'return a / b', new_string: 'if (b === 0) throw e\nreturn a / b' } }),
        surface,
      } as never)
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts).toContain('edit x/calc.js')
      expect(texts).toContain('+2')
      expect(texts).not.toContain('− return a / b')
      await ui.unmount()
    }
  })

  test('a failed command shows the reason in red', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        ...row({ tool: 'Bash', isErrored: true, input: { command: 'node nao-existe.js' }, output: "Error: Cannot find module 'nao-existe.js'" }),
        surface,
      } as never)
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts).toContain('✕')
      expect(texts).toContain("failed: Error: Cannot find module 'nao-existe.js'")
      expect(texts).toContain('error')
      await ui.unmount()
    }
  })
})

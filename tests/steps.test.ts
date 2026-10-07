import { describe, expect, mock, test } from 'claude-code/testing'

import { formatDuration, lineDelta, runningPct, stepLabel, summarize } from '../hooks/steps'
import type { Step } from '../types'


describe('step names and numbers', () => {
  test('names each tool', async () => {
    expect(stepLabel('Edit', { file_path: 'C:\\proj\\auth\\login.ts' })).toBe('edit auth/login.ts')
    expect(stepLabel('Bash', { command: 'npm test', description: 'run the tests' })).toBe('run run the tests')
    expect(stepLabel('Grep', { pattern: 'login' })).toBe('search "login"')
  })

  test('counts added and removed lines', async () => {
    expect(lineDelta('Edit', { old_string: 'a\nb\nc', new_string: 'x' })).toEqual({ added: 1, removed: 3 })
    expect(lineDelta('Write', { content: '1\n2' })).toEqual({ added: 2, removed: 0 })
  })

  test('the bar fills and stops before 100%', async () => {
    expect(runningPct(0)).toBe(0)
    expect(runningPct(6000)).toBeGreaterThan(50)
    expect(runningPct(600000)).toBe(95)
    expect(formatDuration(102000)).toBe('1m 42s')
  })

  test('the summary groups edits by file', async () => {
    const step = (over: Partial<Step>): Step => ({
      id: Math.random().toString(),
      label: 'x',
      status: 'done',
      startedAt: 0,
      endedAt: 1,
      detail: null,
      file: null,
      added: 0,
      removed: 0,
      diff: [],
      hidden: 0,
      ...over,
    })
    const s = summarize(
      [
        step({ file: 'auth/login.ts', added: 10, removed: 4 }),
        step({ file: 'auth/login.ts', added: 2, removed: 1 }),
        step({ status: 'failed' }),
      ],
      102000,
    )
    expect(s.done).toBe(2)
    expect(s.failed).toBe(1)
    expect(s.files).toEqual([{ file: 'auth/login.ts', added: 12, removed: 5 }])
  })
})

describe('end of turn', () => {
  test('keeps the code of each change', async ($, on) => {
    mock.clock(on, { now: 1000 })
    on('tool.call', ($, e) =>
      e.tool === 'Bash'
        ? ({ isError: true, text: 'npm: sem acesso à rede', result: {} } as never)
        : ({ result: {}, text: 'ok' } as never),
    )
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('turn.complete', () => ({ text: '' }) as never)

    await $.prompt.submit({ text: 'refatore o login' } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'auth/login.ts', old_string: 'a', new_string: 'b\nc' } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm i bcrypt', description: 'instalar bcrypt' } as never)

    await $.turn.complete({ answer: '', durationMs: 102000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'clean-cli',
        surface,
        component: 'TurnDuration',
        props: { word: 'Baked', durationMs: 102000 },
      } as never)
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts).toContain('auth/login.ts')
      expect(texts.some(t => t.includes('steps') || t.includes('1m 42s'))).toBe(false)
      expect(texts).toContain('− a')
      expect(texts).toContain('+ b')
      expect(texts).toContain('+ c')
      await ui.unmount()
    }
  })

})

describe('code at the end', () => {
  test('"… N more lines" expands and collapses the box', async ($, on) => {
    mock.clock(on, { now: 1000 })
    on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('turn.complete', () => ({ text: '' }) as never)

    const content = Array.from({ length: 20 }, (_, i) => `linha ${i + 1}`).join('\n')
    await $.prompt.submit({ text: 'crie o arquivo' } as never)
    await $.tool.call({ tool: 'Write', file_path: 'teste-mod/grande.js', content } as never)
    await $.turn.complete({ answer: '', durationMs: 5000, isAborted: false, turnId: 't2', reason: 'answer' } as never)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'clean-cli',
        surface,
        component: 'TurnDuration',
        props: { word: 'Baked', durationMs: 5000 },
      } as never)
      let texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts).toContain('+ linha 8')
      expect(texts).not.toContain('+ linha 9')
      expect(await ui.find({ key: 'more-5000:0' })).toBeDefined()

      await ui.press({ key: 'more-5000:0' })
      texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts).toContain('+ linha 20')

      await ui.press({ key: 'more-5000:0' })
      texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts).not.toContain('+ linha 20')
      await ui.unmount()
    }
  })
})

describe('answer below the code boxes', () => {
  test('the answer moves below the code', async ($, on) => {
    mock.clock(on, { now: 1000 })
    on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('turn.complete', () => ({ text: '' }) as never)

    const answer = 'Criei `calc.js`. Os testes passaram.'
    await $.prompt.submit({ text: 'crie' } as never)
    await $.tool.call({ tool: 'Write', file_path: 'teste-mod/calc.js', content: 'x' } as never)
    await $.turn.complete({ answer, durationMs: 7000, isAborted: false, turnId: 't3', reason: 'answer' } as never)

    for (const surface of ['terminal', 'desktop'] as const) {
      const msg = await $.ui.mount({
        plugin: 'clean-cli',
        surface,
        component: 'AssistantMessage',
        props: { text: answer, isFirstOfReply: true },
      } as never)
      expect(await msg.find({ type: 'Text', text: /testes passaram/ })).toBeUndefined()
      await msg.unmount()

      const end = await $.ui.mount({
        plugin: 'clean-cli',
        surface,
        component: 'TurnDuration',
        props: { word: 'Baked', durationMs: 7000 },
      } as never)
      const texts = (await end.findAll({ type: 'Text' })).map(t => t.text)
      const code = texts.indexOf('+ x')
      const reply = texts.findIndex(t => t.includes('testes passaram'))
      expect(code).toBeGreaterThan(-1)
      expect(reply).toBeGreaterThan(code)
      await end.unmount()
    }
  })
})

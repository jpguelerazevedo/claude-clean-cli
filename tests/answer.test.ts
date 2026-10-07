import { describe, expect, test } from 'claude-code/testing'

import { isComplex, parseInline, parts, tone } from '../hooks/answer'

const reply = (text: string) => ({
  plugin: 'clean-cli',
  component: 'AssistantMessage',
  props: { text, isFirstOfReply: true },
})

describe('AI answer', () => {
  test('color comes from the ✓ and ✕ marks, in any language', async () => {
    expect(tone('✕ The last command failed.')).toBe('fail')
    expect(tone('✓ Os 5 testes passaram.')).toBe('ok')
    expect(tone('✓ 5 个测试全部通过。')).toBe('ok')
    expect(tone('dividir now warns about division by zero.')).toBe(null)
    expect(tone('This failed, but there is no mark.')).toBe(null)
  })

  test('splits code and bold', async () => {
    expect(parseInline('rode `npm i` **agora**')).toEqual([
      { kind: 'text', text: 'rode ' },
      { kind: 'code', text: 'npm i' },
      { kind: 'text', text: ' ' },
      { kind: 'bold', text: 'agora' },
    ])
  })

  test('splits at the marks, also without spaces between sentences', async () => {
    expect(parts('Created calc.js. ✓ Tests passed. ✕ node x.js failed.')).toEqual([
      'Created calc.js. ',
      '✓ Tests passed. ',
      '✕ node x.js failed.',
    ])
    expect(parts('已创建文件。✓ 测试通过。✕ 命令失败。')).toEqual(['已创建文件。', '✓ 测试通过。', '✕ 命令失败。'])
  })

  test('lists and code blocks keep the normal formatting', async () => {
    expect(isComplex('- um\n- dois')).toBe(true)
    expect(isComplex('```js\nx\n```')).toBe(true)
    expect(isComplex('Só uma frase.')).toBe(false)
  })

  test('draws without the bullet and with colors', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        ...reply('Created `calc.js`. ✓ The 5 tests passed.\n\n✕ The command `node x.js` failed.'),
        surface,
      } as never)
      const texts = await ui.findAll({ type: 'Text' })
      const passed = texts.find(t => t.text === '✓ The 5 tests passed.')
      const failed = texts.find(t => t.text.includes('failed') && t.props.color !== undefined)
      const code = texts.find(t => t.text === ' calc.js ')
      expect(passed?.props.color).toBe('#5fb37a')
      expect(failed?.props.color).toBe('#e06c6c')
      expect(code?.props.backgroundColor).toBe('#262626')
      expect(texts.some(t => t.text.includes('●'))).toBe(false)
      await ui.unmount()
    }
  })

  test('the short-answer instruction goes into the prompt', async ($, on) => {
    on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'x', scope: 'shared' }] }) as never)
    const { sections } = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], traits: [], outputStyle: null } as never)
    const style = sections.find(s => s.id === 'clean-cli-style')
    expect(style?.text).toContain('as short as it can be')
    expect(style?.text).toContain('✓')
  })
})

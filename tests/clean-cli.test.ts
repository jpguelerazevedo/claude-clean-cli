import { describe, expect, test } from 'claude-code/testing'

import { cleanHint } from '../hooks/register'

describe('hint under the prompt', () => {
  test('shortens the mode and shows the menu shortcut', async () => {
    expect(cleanHint('auto mode on (shift+tab to cycle) · ← for agents')).toBe('auto · /o options')
  })

  test('without a mode, shows only the shortcut', async () => {
    expect(cleanHint('? for shortcuts')).toBe('/o options')
  })
})

describe('options menu', () => {
  test('the pane draws the models and efforts', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'clean-cli',
        surface,
        component: 'Pane',
        requestId: 'clean-options',
        props: {},
      } as never)
      expect(await ui.find({ key: 'model-opus' })).toBeDefined()
      expect(await ui.find({ key: 'effort-high' })).toBeDefined()
      expect((await ui.find({ key: 'model-sonnet' }))?.props.dimColor).toBe(true)
      await ui.press({ key: 'model-sonnet' })
      expect((await ui.find({ key: 'model-sonnet' }))?.props.dimColor).toBe(false)
      await ui.press({ key: 'model-sonnet' })
      expect((await ui.find({ key: 'model-sonnet' }))?.props.dimColor).toBe(true)
      await ui.unmount()
    }
  })
})

describe('/o in the prompt', () => {
  test('suggests /o after each turn and in place of Claude Code guesses', async ($, on) => {
    const shown: string[] = []
    on('prompt.suggest', ($, e) => {
      shown.push(e.text)
      return { isShown: true }
    })
    on('turn.complete', () => ({ text: '' }) as never)

    await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await $.prompt.suggest({ text: 'refatore o login', origin: { kind: 'suggestion' } } as never)
    expect(shown).toContain('/o')
    expect(shown).not.toContain('refatore o login')
  })
})

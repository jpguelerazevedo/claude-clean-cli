import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { EffortChoice, ModelChoice } from '../types'
import { registerAnswer } from './answer'
import { registerRows } from './rows'
import { OPTIONS_HINT, registerSteps } from './steps'

const PANE = 'clean-options'

const modelAtom = atom({ plugin: 'clean-cli', key: 'model' } as const, null)
const effortAtom = atom({ plugin: 'clean-cli', key: 'effort' } as const, null)

export const MODELS: { id: ModelChoice; name: string; apiId: string; note: string; hotkey: string }[] = [
  { id: 'fable', name: 'fable 5.1', apiId: 'claude-fable-5-1', note: 'most capable', hotkey: '1' },
  { id: 'opus', name: 'opus 5.5', apiId: 'claude-opus-5-5', note: 'complex tasks', hotkey: '2' },
  { id: 'sonnet', name: 'sonnet 5.5', apiId: 'claude-sonnet-5-5', note: 'balanced', hotkey: '3' },
  { id: 'haiku', name: 'haiku 5.5', apiId: 'claude-haiku-5-5', note: 'fast', hotkey: '4' },
]

export const EFFORTS: { id: EffortChoice; name: string; hotkey: string }[] = [
  { id: 'low', name: 'low', hotkey: 'l' },
  { id: 'medium', name: 'medium', hotkey: 'm' },
  { id: 'high', name: 'high', hotkey: 'h' },
  { id: 'max', name: 'max', hotkey: 'x' },
]

/** "auto mode on (shift+tab to cycle) · ← for agents" → "auto · /o options" */
export function cleanHint(hint: string): string {
  const mode = /(\S+(?: \S+)?) mode on/i.exec(hint)
  const parts = mode?.[1] ? [mode[1].toLowerCase()] : []
  parts.push('/o options')
  return parts.join(' · ')
}

function statusText(model: ModelChoice | null, effort: EffortChoice | null): string | undefined {
  const m = MODELS.find(x => x.id === model)?.name
  const e = EFFORTS.find(x => x.id === effort)?.name
  if (!m && !e) return undefined
  return [m, e].filter(Boolean).join(' · ')
}

export const register: Register = on => {
  registerSteps(on)
  registerRows(on)
  registerAnswer(on)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'o',
      description: 'Options: pick the model and effort',
    })
    await $.command.register({
      name: 'expand',
      description: 'Show or collapse the full code of every change',
    })
    $.ui.status(statusText(await read($, modelAtom), await read($, effortAtom)))
    const started = await next(e)
    void $.prompt.suggest({ text: OPTIONS_HINT }).catch(() => undefined)
    return started
  })

  // An empty prompt shows a dim "/o": Tab completes it, Enter opens the menu.
  // It takes the place of Claude Code's next-prompt guesses.
  on('prompt.suggest', { origin: { kind: 'suggestion' } }, ($, e, next) => next({ ...e, text: OPTIONS_HINT }))

  on('command.run', { command: 'o' }, async $ => {
    await $.ui.open({ id: PANE, title: 'options', focus: true, closeOnEscape: true, rows: 12 })
    return { text: '' }
  })

  // The hint under the prompt: just the mode and the menu shortcut.
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.props.isWorking || e.props.isDraft) return next(e)
    return next({ ...e, props: { ...e.props, hint: cleanHint(e.props.hint) } })
  })

  // Applies the chosen model and effort to every model request.
  on('turn.step', async function* ($, e, next) {
    const chosen = await read($, modelAtom)
    const model = MODELS.find(x => x.id === chosen)
    const effort = await read($, effortAtom)
    if (e.agentId || (!model && !effort)) return yield* next(e)
    return yield* next({
      ...e,
      ...(model ? { model: model.apiId } : {}),
      ...(effort && e.effort !== undefined ? { effort } : {}),
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const model = await read($, modelAtom)
    const effort = await read($, effortAtom)

    const pick = async (m: ModelChoice | null, ef: EffortChoice | null) => {
      $.ui.status(statusText(m, ef))
    }

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text dimColor>model</Text>
          {MODELS.map(m => (
            <Box key={`row-${m.id}`} gap={2}>
              <Text color="#D97757">{model === m.id ? '›' : ' '}</Text>
              <Button
                key={`model-${m.id}`}
                plain
                hotkey={m.hotkey}
                label={m.name}
                dimColor={model !== m.id}
                onPress={async () => {
                  const next = model === m.id ? null : m.id
                  await update($, modelAtom, () => next)
                  await pick(next, effort)
                }}
              />
              <Text dimColor>{m.note}</Text>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text dimColor>effort</Text>
          <Box gap={2}>
            {EFFORTS.map(ef => (
              <Button
                key={`effort-${ef.id}`}
                plain
                hotkey={ef.hotkey}
                label={ef.name}
                dimColor={effort !== ef.id}
                onPress={async () => {
                  const next = effort === ef.id ? null : ef.id
                  await update($, effortAtom, () => next)
                  await pick(model, next)
                }}
              />
            ))}
          </Box>
        </Box>
        <Text dimColor>1-4 model · l m h x effort · esc closes</Text>
      </Box>
    )
  })
}

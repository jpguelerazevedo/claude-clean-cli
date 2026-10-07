export type ModelChoice = 'fable' | 'opus' | 'sonnet' | 'haiku'
export type EffortChoice = 'low' | 'medium' | 'high' | 'max'

export type DiffLine = { sign: '−' | '+'; text: string }

export type StepStatus = 'running' | 'done' | 'failed'

export type Step = {
  id: string
  label: string
  status: StepStatus
  startedAt: number
  endedAt: number | null
  detail: string | null
  file: string | null
  added: number
  removed: number
  diff: DiffLine[]
  hidden: number
}

export type FileChange = { file: string; added: number; removed: number }

export type CodeChange = { file: string; lines: DiffLine[]; hidden: number }

export type TurnSummary = {
  done: number
  failed: number
  durationMs: number
  files: FileChange[]
  changes: CodeChange[]
  answer: string
}

declare module 'claude-code' {
  interface PluginState {
    'clean-cli': {
      model: ModelChoice | null
      effort: EffortChoice | null
      steps: Step[]
      tick: number
      summaries: Record<string, TurnSummary>
      expanded: Record<string, boolean>
      expandAll: boolean
    }
  }
}

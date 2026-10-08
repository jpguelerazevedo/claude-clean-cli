# clean-cli

A Claude Code mod that makes the terminal minimal: less noise, only what matters.

## Demo

![clean-cli demo](docs/demo.gif)

## Features

- **Progress bars:** every action Claude takes is one line with a bar. `✓ ok` in green when done, `✕ error` in red with the reason when it fails.
- **Code at the end:** after the steps, each change is shown in a small box (removed lines in red, added in green), followed by Claude's answer.
- **Shorter answers:** Claude is told to lead with the result and keep it to a few sentences.
- **Model and effort menu:** type `/o` to pick the model (`1`–`4`) and effort (`l` low, `m` medium, `h` high, `x` max). `Esc` closes it.
- **Cleaner hints:** the line under the prompt shows just `auto · /o options`, and an empty prompt suggests `/o` (press `Tab`).

## Commands

| Command | What it does |
| --- | --- |
| `/o` | Opens the model and effort menu |
| `/expand` | Shows or hides the full code in every box |

You can also click `… N more lines` under a box to expand just that one.

## Install

In Claude Code, in the terminal:

```
/plugin install clean-cli --marketplace jpguelerazevedo/claude-clean-cli
```

Answer `y` to add the marketplace, then pick a scope.

## Try it from the folder

```
claude --plugin-dir ./claude-clean-cli
```

## Good to know

- Claude still answers in the language you write in.
- The progress percentage is an estimate based on time; tools don't report real progress.
- Claude marks outcomes with `✓` (green) and `✕` (red) itself, so colors work in any language. If it skips a mark, that sentence just stays in the normal color.
- While Claude is writing, the answer shows in its usual place; it moves below the code boxes when the turn ends.

## Development

```
claude plugin validate .
claude plugin test .
```

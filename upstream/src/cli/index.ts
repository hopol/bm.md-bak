#!/usr/bin/env node

import process from 'node:process'
import { cac } from 'cac'
import { description, version } from '../../package.json'
import { cliTools, formatError, handleCommand, registerOption } from './core'

type CommandAction = () => Promise<void>

const cli = cac('bmmd')

function run(action: CommandAction) {
  action().catch((error: unknown) => {
    console.error(`bmmd: ${formatError(error)}`)
    process.exitCode = 1
  })
}

for (const tool of cliTools) {
  const command = cli.command(`${tool.name} [${tool.cli.inputLabel}]`, tool.description)

  for (const option of tool.cli.options) {
    registerOption(command, option)
  }

  command.action((file: string | undefined, options: Record<string, unknown>) => run(() => handleCommand(tool, file, options)))
}

cli.help((sections) => {
  const helpDescription = cli.matchedCommandName && cli.matchedCommand?.description
    ? cli.matchedCommand.description
    : description
  const versionSectionIndex = sections.findIndex(section => section.body.includes(version))

  sections.splice(versionSectionIndex + 1, 0, { body: helpDescription })
})
cli.version(version, '--version')

if (process.argv.length <= 2) {
  cli.outputHelp()
}
else {
  cli.parse()
}

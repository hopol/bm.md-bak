export interface CliOptionDefinition {
  name: string
  description: string
  type: 'boolean' | 'string'
  choices?: readonly string[]
  cliKey?: string
  flag?: string
  input?: boolean
  valueName?: string
}

export interface CliDefinition {
  inputField: string
  inputLabel: string
  options: CliOptionDefinition[]
}

export const outputOption: CliOptionDefinition = {
  name: 'output',
  description: '输出文件，默认输出到 stdout',
  type: 'string',
  input: false,
  valueName: 'file',
}

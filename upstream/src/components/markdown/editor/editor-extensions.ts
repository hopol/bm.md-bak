import type { Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import { importDropPasteExtension, importViewTrackerExtension } from './file-import'

const lineNumbersTheme = EditorView.theme({
  '.cm-lineNumbers': {
    minWidth: '2em',
  },
})

export function createEditorExtensions(scrollSyncExtensions: Extension[]): Extension[] {
  return [
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
    }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器' }),
    lineNumbersTheme,
    ...scrollSyncExtensions,
    importViewTrackerExtension,
    importDropPasteExtension,
  ]
}

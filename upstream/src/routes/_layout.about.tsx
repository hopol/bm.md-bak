import type { PageMeta } from '@/lib/seo'
import { createFileRoute } from '@tanstack/react-router'
import PageDialog from '@/components/dialog/page'
import { createPageHead } from '@/lib/seo'
import { cn } from '@/lib/utils'

import README_HTML from '@/README.md'

export const Route = createFileRoute('/_layout/about')({
  loader: () => {
    const meta: PageMeta = { title: '关于' }
    return { meta }
  },
  head: ({ loaderData, match }) => loaderData
    ? createPageHead({ pathname: match.pathname, meta: loaderData.meta })
    : {},
  component: AboutModal,
})

function AboutModal() {
  const { meta } = Route.useLoaderData()
  return (
    <PageDialog
      title={meta.title}
      description={meta.description}
      render={(
        <article
          className={cn(
            `
              prose prose-sm prose-zinc
              dark:prose-invert
              prose-h1:hidden
              prose-hr:my-4
            `,
            'max-w-none',
          )}
          // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{ __html: README_HTML }}
        />
      )}
    />
  )
}

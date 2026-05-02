import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

const mdClass = [
  'max-w-none text-[13px] leading-6 text-foreground/88',
  // block spacing
  '[&_p]:my-2 [&_p]:leading-6',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground/92',
  '[&_h2]:mt-3.5 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground/92',
  '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-foreground/90',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1',
  '[&_li]:leading-6 [&_li_p]:my-0',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/20 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-3 [&_hr]:border-foreground/10',
  '[&_pre]:my-2 [&_pre]:rounded-2xl [&_pre]:bg-zinc-900 [&_pre]:p-3',
  '[&_code]:rounded [&_code]:bg-foreground/6 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_strong]:font-semibold [&_strong]:text-foreground/95',
  '[&_table]:my-2 [&_table]:w-full [&_table]:text-[12px]',
  '[&_th]:border [&_th]:border-foreground/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border [&_td]:border-foreground/10 [&_td]:px-2 [&_td]:py-1',
].join(' ')

export function CopilotAnswerContent({ answer, isStreaming }: { answer: string; isStreaming?: boolean }) {
  const normalizedAnswer = answer
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')

  return (
    <div className={mdClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
          table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
        }}
      >
        {normalizedAnswer}
      </ReactMarkdown>
      {isStreaming ? <span className="inline-block h-4 w-1 animate-pulse bg-foreground/70 align-text-bottom" /> : null}
    </div>
  )
}

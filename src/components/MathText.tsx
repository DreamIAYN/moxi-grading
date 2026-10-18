import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default function MathText({ children, className = '' }: { children: string; className?: string }) {
  if (!children) return null;
  return (
    <div className={`math-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children: content }) => (
            <a href={href} target="_blank" rel="noreferrer">{content}</a>
          ),
          table: ({ children: content }) => <div className="math-table-wrap"><table>{content}</table></div>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

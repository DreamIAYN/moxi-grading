import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * Models often return \( ... \) / \[ ... \], while remark-math only
 * understands $...$ / $$...$$. Normalize both before rendering so annotation
 * comments do not show raw LaTeX delimiters.
 */
function normalizeMath(value: string): string {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\\]{1,2}\(([\s\S]*?)[\\]{1,2}\)/g, (_, inner) => `$${inner}$`)
    .replace(/[\\]{1,2}\[([\s\S]*?)[\\]{1,2}\]/g, (_, inner) => `$$${inner}$$`)
    .replace(/\\begin\{(equation\*?|align\*?)\}([\s\S]*?)\\end\{\1\}/g, (_, _env, inner) => `$$\n${inner}\n$$`);
}

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
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}

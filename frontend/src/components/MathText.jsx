import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Renders question text that mixes prose and LaTeX.
 *
 * Supported delimiters:
 *   $$...$$  and  \[...\]   → display maths (own line)
 *   $...$    and  \(...\)   → inline maths
 *
 * Security note: only KaTeX's own output is ever injected as HTML, and it is
 * generated with `trust: false`, so \href / \htmlClass style escapes are refused.
 * Every non-maths segment is rendered as a plain React text node, which React
 * escapes for us — so a question containing "<script>" is shown, not executed.
 */

const SEGMENT_RE = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;

function stripDelimiters(token) {
  if (token.startsWith('$$') && token.endsWith('$$')) {
    return { tex: token.slice(2, -2), display: true };
  }
  if (token.startsWith('\\[') && token.endsWith('\\]')) {
    return { tex: token.slice(2, -2), display: true };
  }
  if (token.startsWith('\\(') && token.endsWith('\\)')) {
    return { tex: token.slice(2, -2), display: false };
  }
  if (token.startsWith('$') && token.endsWith('$')) {
    return { tex: token.slice(1, -1), display: false };
  }
  return null;
}

export function containsMath(text) {
  if (!text) return false;
  SEGMENT_RE.lastIndex = 0;
  return SEGMENT_RE.test(text);
}

const MathText = ({ children, text, as: Tag = 'span', className, ...rest }) => {
  const source = typeof text === 'string' ? text : typeof children === 'string' ? children : '';

  const segments = useMemo(() => {
    if (!source) return [];

    const parts = source.split(SEGMENT_RE);

    return parts.filter(Boolean).map((part, idx) => {
      const math = stripDelimiters(part);
      if (!math) return { type: 'text', value: part, key: idx };

      try {
        const html = katex.renderToString(math.tex, {
          displayMode: math.display,
          throwOnError: false,
          // Refuse \href, \url, \includegraphics and friends.
          trust: false,
          strict: false,
          output: 'htmlAndMathml', // MathML alongside HTML for screen readers
        });
        return { type: 'math', html, display: math.display, key: idx };
      } catch {
        // Malformed LaTeX falls back to showing the raw source rather than blowing up.
        return { type: 'text', value: part, key: idx };
      }
    });
  }, [source]);

  if (!source) return null;

  return (
    <Tag className={className} {...rest}>
      {segments.map((seg) =>
        seg.type === 'math' ? (
          <span
            key={seg.key}
            style={seg.display ? { display: 'block', margin: '0.5em 0' } : undefined}
            // Safe: this string is KaTeX output produced with trust:false.
            dangerouslySetInnerHTML={{ __html: seg.html }}
          />
        ) : (
          <React.Fragment key={seg.key}>{seg.value}</React.Fragment>
        ),
      )}
    </Tag>
  );
};

export default MathText;

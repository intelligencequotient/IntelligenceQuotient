import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MathText, { containsMath } from '../components/MathText';

describe('MathText', () => {
  it('renders plain prose unchanged', () => {
    render(<MathText text="What is Newton's Third Law?" />);
    expect(screen.getByText(/Newton's Third Law/)).toBeInTheDocument();
  });

  it('renders inline maths through KaTeX', () => {
    const { container } = render(<MathText text="Find $x^2$ please" />);

    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.textContent).toContain('Find');
    expect(container.textContent).toContain('please');
  });

  it('renders display maths as a block', () => {
    const { container } = render(<MathText text="$$\\int_0^1 x\\,dx$$" />);

    const block = container.querySelector('span[style*="display: block"]');
    expect(block).toBeTruthy();
    expect(container.querySelector('.katex-display')).toBeTruthy();
  });

  it('supports \\( \\) and \\[ \\] delimiters', () => {
    const { container } = render(<MathText text={'inline \\(a+b\\) and block \\[c+d\\]'} />);
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
  });

  // The whole point of segmenting the string: prose is a React text node, so
  // markup inside a question is displayed rather than injected into the DOM.
  it('escapes HTML in the prose segments', () => {
    const { container } = render(<MathText text={'<img src=x onerror=alert(1)> and $y$'} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('does not honour \\href, which KaTeX only allows when trust is enabled', () => {
    const { container } = render(<MathText text={'$\\href{javascript:alert(1)}{click}$'} />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('falls back to the raw source when the LaTeX is malformed', () => {
    const { container } = render(<MathText text={'$\\frac{1$'} />);
    // Renders something rather than throwing.
    expect(container.textContent.length).toBeGreaterThan(0);
  });

  it('renders nothing for empty input', () => {
    const { container } = render(<MathText text="" />);
    expect(container.firstChild).toBeNull();
  });

  it('honours the `as` prop', () => {
    const { container } = render(<MathText as="p" text="hello" className="q-text" />);
    const el = container.querySelector('p.q-text');
    expect(el).toBeTruthy();
  });

  describe('containsMath', () => {
    it('detects the supported delimiters', () => {
      expect(containsMath('a $x$ b')).toBe(true);
      expect(containsMath('$$x$$')).toBe(true);
      expect(containsMath('\\(x\\)')).toBe(true);
    });

    it('returns false for plain text and empty input', () => {
      expect(containsMath('no maths here')).toBe(false);
      expect(containsMath('')).toBe(false);
      expect(containsMath(null)).toBe(false);
    });
  });
});

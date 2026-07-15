import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrossAdjacencyMatrix } from '../../src/components/CrossAdjacencyMatrix';

describe('CrossAdjacencyMatrix', () => {
  it('renders a canvas and the closest-pair line', () => {
    render(<CrossAdjacencyMatrix rowColors={['#000000', '#ff0000']} colColors={['#fe0000', '#ffffff']} />);
    expect(screen.getByText(/Closest cross-pair: A #FF0000 ↔ B #FE0000/)).toBeInTheDocument();
  });

  it('returns null when rowColors is empty', () => {
    const { container } = render(<CrossAdjacencyMatrix rowColors={[]} colColors={['#ffffff']} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when colColors is empty', () => {
    const { container } = render(<CrossAdjacencyMatrix rowColors={['#000000']} colColors={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

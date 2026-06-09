import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseColorDock } from '../../src/components/BaseColorDock';

beforeEach(() => localStorage.clear());

describe('BaseColorDock', () => {
  it('renders one swatch per base color', () => {
    render(<BaseColorDock baseColors={['#ff00ff', '#00ffff', '#00ff00']} onDelete={() => {}} onJump={() => {}} />);
    expect(screen.getByTestId('swatch-0')).toBeInTheDocument();
    expect(screen.getByTestId('swatch-2')).toBeInTheDocument();
    expect(screen.queryByTestId('swatch-3')).toBeNull();
  });

  it('hides the delete badge when only one base remains', () => {
    render(<BaseColorDock baseColors={['#ff00ff']} onDelete={() => {}} onJump={() => {}} />);
    expect(screen.queryByTestId('delete-0')).toBeNull();
  });

  it('delete badge calls onDelete with the index', () => {
    const onDelete = vi.fn();
    render(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={onDelete} onJump={() => {}} />);
    fireEvent.click(screen.getByTestId('delete-1'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('swatch body calls onJump with the index', () => {
    const onJump = vi.fn();
    render(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={onJump} />);
    fireEvent.click(screen.getByTestId('jump-0'));
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it('collapse toggle switches to the pill and back', () => {
    render(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={() => {}} />);
    fireEvent.click(screen.getByTestId('base-dock-collapse'));
    expect(screen.getByTestId('base-dock-expand')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('base-dock-expand'));
    expect(screen.getByTestId('base-dock-grip')).toBeInTheDocument();
  });
});

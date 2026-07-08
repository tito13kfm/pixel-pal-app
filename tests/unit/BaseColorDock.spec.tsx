import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseColorDock } from '../../src/components/BaseColorDock';
import { ThemeProvider } from '../../src/contexts';

beforeEach(() => localStorage.clear());

const theme = {
  t: {
    panelBg: 'theme-panel-bg',
    panelBorder: 'theme-panel-border',
    panelBgStrong: 'theme-panel-bg-strong',
    bodyText: 'theme-body-text-class',
    panelTextInactive: 'theme-panel-text-inactive-class',
  },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => `themed-border(${h})`,
  accentGlow: (h: string, amt: number) => `themed-glow(${h},${amt})`,
  accentTextGlow: (h: string) => h,
  sectionHeadColor: (h: string) => h,
};

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider value={theme as any}>{ui}</ThemeProvider>);
}

describe('BaseColorDock', () => {
  it('renders one swatch per base color', () => {
    wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff', '#00ff00']} onDelete={() => {}} onJump={() => {}} />);
    expect(screen.getByTestId('swatch-0')).toBeInTheDocument();
    expect(screen.getByTestId('swatch-2')).toBeInTheDocument();
    expect(screen.queryByTestId('swatch-3')).toBeNull();
  });

  it('hides the delete badge when only one base remains', () => {
    wrap(<BaseColorDock baseColors={['#ff00ff']} onDelete={() => {}} onJump={() => {}} />);
    expect(screen.queryByTestId('delete-0')).toBeNull();
  });

  it('delete badge calls onDelete with the index', () => {
    const onDelete = vi.fn();
    wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={onDelete} onJump={() => {}} />);
    fireEvent.click(screen.getByTestId('delete-1'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('swatch body calls onJump with the index', () => {
    const onJump = vi.fn();
    wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={onJump} />);
    fireEvent.click(screen.getByTestId('jump-0'));
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it('collapse toggle switches to the pill and back', () => {
    wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={() => {}} />);
    fireEvent.click(screen.getByTestId('base-dock-collapse'));
    expect(screen.getByTestId('base-dock-expand')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('base-dock-expand'));
    expect(screen.getByTestId('base-dock-grip')).toBeInTheDocument();
  });

  it('applies the active CVD filter to the swatch grid, not the dock shell', () => {
    wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={() => {}} cvdMode="protan" />);
    const grid = screen.getByTestId('base-dock-swatch-grid');
    expect(grid).toHaveStyle({ filter: 'url(#cvd-protan)' });
    const shell = screen.getByTestId('base-dock');
    expect(shell).not.toHaveStyle({ filter: 'url(#cvd-protan)' });
  });

  it('applies no filter to the swatch grid when cvdMode is none', () => {
    wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={() => {}} cvdMode="none" />);
    expect(screen.getByTestId('base-dock-swatch-grid')).toHaveStyle({ filter: 'none' });
  });

  it('themes the dock chrome from context tokens instead of hardcoded colors', () => {
    wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={() => {}} cvdMode="none" />);
    const shell = screen.getByTestId('base-dock');
    expect(shell).toHaveStyle({ background: 'theme-panel-bg' });
  });

  it('applies text-color theme tokens as className, not an inline style.color (theme tokens are Tailwind class names, not CSS colors)', () => {
    wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={() => {}} />);
    const collapseBtn = screen.getByTestId('base-dock-collapse');
    expect(collapseBtn.className).toContain('theme-body-text-class');
    expect(collapseBtn).not.toHaveStyle({ color: 'theme-body-text-class' });

    fireEvent.click(collapseBtn);
    const expandBtn = screen.getByTestId('base-dock-expand');
    expect(expandBtn.className).toContain('theme-body-text-class');
    expect(expandBtn).not.toHaveStyle({ color: 'theme-body-text-class' });
  });

  it('does not render the stale dev-position calibration readout', () => {
    const { container } = wrap(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={() => {}} />);
    expect(container.textContent).not.toMatch(/\b(top|bottom)\s+-?\d+/);
  });
});

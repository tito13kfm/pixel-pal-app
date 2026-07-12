import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import ShadeCountControl from '../../src/components/ShadeCountControl';

function wrap(props: Partial<React.ComponentProps<typeof ShadeCountControl>> = {}) {
  const onCommit = vi.fn();
  render(
    <ShadeCountControl
      value={6}
      onCommit={onCommit}
      accentClassName="accent-cyan-300"
      inputClassName="w-14"
      ariaLabel="Shades per ramp"
      {...props}
    />,
  );
  return { onCommit };
}

describe('ShadeCountControl', () => {
  it('renders slider and number input spanning 2..64 with the current value', () => {
    wrap();
    const slider = screen.getByRole('slider', { name: 'Shades per ramp' });
    expect(slider).toHaveAttribute('min', '2');
    expect(slider).toHaveAttribute('max', '64');
    expect(slider).toHaveValue('6');
    const num = screen.getByRole('spinbutton', { name: 'Shades per ramp (number)' });
    expect(num).toHaveValue(6);
  });

  it('commits slider changes immediately', () => {
    const { onCommit } = wrap();
    fireEvent.change(screen.getByRole('slider', { name: 'Shades per ramp' }), { target: { value: '32' } });
    expect(onCommit).toHaveBeenCalledWith(32);
  });

  it('commits a typed in-range value without waiting for blur', () => {
    const { onCommit } = wrap();
    const num = screen.getByRole('spinbutton', { name: 'Shades per ramp (number)' });
    fireEvent.change(num, { target: { value: '12' } });
    expect(onCommit).toHaveBeenCalledWith(12);
  });

  it('does not commit an out-of-range keystroke, then clamps on blur', () => {
    const { onCommit } = wrap();
    const num = screen.getByRole('spinbutton', { name: 'Shades per ramp (number)' });
    fireEvent.change(num, { target: { value: '1' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(num, { target: { value: '1' } });
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it('clamps above the maximum on Enter', () => {
    const { onCommit } = wrap();
    const num = screen.getByRole('spinbutton', { name: 'Shades per ramp (number)' });
    fireEvent.change(num, { target: { value: '99' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(num, { key: 'Enter', target: { value: '99' } });
    expect(onCommit).toHaveBeenCalledWith(64);
  });

  it('restores the current value when a non-numeric draft is blurred', () => {
    const { onCommit } = wrap();
    const num = screen.getByRole('spinbutton', { name: 'Shades per ramp (number)' });
    fireEvent.change(num, { target: { value: '' } });
    fireEvent.blur(num, { target: { value: '' } });
    expect(onCommit).not.toHaveBeenCalled();
    // the control remounts the input to restore the text, so re-query
    expect(screen.getByRole('spinbutton', { name: 'Shades per ramp (number)' })).toHaveValue(6);
  });
});

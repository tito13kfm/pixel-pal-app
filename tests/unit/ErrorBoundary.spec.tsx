import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

function Throws(): never {
  throw new Error('boom');
}

describe('ErrorBoundary (#107)', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>fine</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeTruthy();
  });

  it('renders a recoverable fallback when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Throws />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong.')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByText('Reload')).toBeTruthy();
    expect(screen.getByText(/Clear local data/)).toBeTruthy();
    spy.mockRestore();
  });

  it('clear-and-reload button clears localStorage', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('some-key', 'value');
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
    });
    render(
      <ErrorBoundary>
        <Throws />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText(/Clear local data/));
    expect(localStorage.getItem('some-key')).toBeNull();
    expect(reloadSpy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

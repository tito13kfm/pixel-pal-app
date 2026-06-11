import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import App from '../../src/App';

// Guards the render-count harness foundation: the real App must mount in jsdom.
describe('App mounts in jsdom', () => {
  it('renders without throwing', () => {
    const { container } = render(<App />);
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../src/lib/save-file', () => ({
  saveFile: vi.fn().mockResolvedValue({ ok: true }),
}));

import { saveFile } from '../../src/lib/save-file';
import { PaletteCycleEditor } from '../../src/components/PaletteCycleEditor';

const ROWS = [
  ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'],
  ['#660000', '#661111', '#662222', '#663333', '#664444', '#665555'],
];

describe('PaletteCycleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing for rows={[]}', () => {
    const { container } = render(<PaletteCycleEditor rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the start-swatch helper text and one button per shade', () => {
    render(<PaletteCycleEditor rows={ROWS} />);
    expect(screen.getByText(/Click a swatch to set the cycle start/)).toBeInTheDocument();
    ROWS.forEach((row, r) => {
      row.forEach((_, i) => {
        expect(screen.getByLabelText(`Ramp ${r + 1} shade ${i + 1}`)).toBeInTheDocument();
      });
    });
  });

  it('commits a range after clicking two swatches in the same row', () => {
    render(<PaletteCycleEditor rows={ROWS} />);
    fireEvent.click(screen.getByLabelText('Ramp 1 shade 2'));
    expect(screen.getByText(/Now click the end shade in the same row/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Ramp 1 shade 5'));
    expect(screen.queryByText(/Click a swatch to set the cycle start/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Now click the end shade in the same row/)).not.toBeInTheDocument();
    expect(screen.getByTitle(/Pause the cycle preview|Play the cycle preview/)).toBeInTheDocument();
    expect(screen.getByTitle('Cycle playback rate')).toBeInTheDocument();
    expect(screen.getByTitle('Download the cycle as a pixel-pal-cycle.json sidecar')).toBeInTheDocument();
  });

  it('normalizes endpoint order regardless of click direction', () => {
    render(<PaletteCycleEditor rows={ROWS} />);
    fireEvent.click(screen.getByLabelText('Ramp 1 shade 5'));
    fireEvent.click(screen.getByLabelText('Ramp 1 shade 2'));
    fireEvent.click(screen.getByTitle('Download the cycle as a pixel-pal-cycle.json sidecar'));
    const call = (saveFile as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)[0];
    const doc = JSON.parse(call.data.text);
    expect(doc.cycles[0]).toEqual({ low: 1, high: 4, rate: 8, reverse: false });
  });

  it('calls saveFile with the expected payload on Download JSON', async () => {
    render(<PaletteCycleEditor rows={ROWS} />);
    fireEvent.click(screen.getByLabelText('Ramp 1 shade 2'));
    fireEvent.click(screen.getByLabelText('Ramp 1 shade 5'));
    fireEvent.click(screen.getByTitle('Download the cycle as a pixel-pal-cycle.json sidecar'));

    expect(saveFile).toHaveBeenCalledTimes(1);
    const call = (saveFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.defaultName).toBe('pixel-pal-cycle.json');
    expect(call.folderKey).toBe('json');
    const doc = JSON.parse(call.data.text);
    expect(doc.cycles[0]).toEqual({ low: 1, high: 4, rate: 8, reverse: false });
  });
});

describe('PaletteCycleEditor: Load Cycle JSON (#140)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const loadFile = (text: string) => {
    const file = new File([text], 'pixel-pal-cycle.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  };

  it('selects the matching row and applies fps/reverse from the file', async () => {
    render(<PaletteCycleEditor rows={ROWS} />);
    const json = JSON.stringify({
      format: 'pixel-pal-cycle',
      version: 1,
      palette: ROWS[1],
      cycles: [{ low: 2, high: 4, rate: 15, reverse: true }],
    });
    loadFile(json);

    await screen.findByTitle('Download the cycle as a pixel-pal-cycle.json sidecar');
    expect(screen.getByTitle('Cycle playback rate')).toHaveValue('15');
    expect(screen.getByTitle('Toggle cycle direction')).toHaveTextContent('Reverse');
  });

  it('shows an error when no visible ramp matches the file colors', async () => {
    render(<PaletteCycleEditor rows={ROWS} />);
    const json = JSON.stringify({
      format: 'pixel-pal-cycle',
      version: 1,
      palette: ['#ffffff', '#eeeeee'],
      cycles: [{ low: 0, high: 1, rate: 8, reverse: false }],
    });
    loadFile(json);

    expect(await screen.findByText(/No visible ramp matches this file's colors/)).toBeInTheDocument();
  });

  it('shows an error for a malformed file', async () => {
    render(<PaletteCycleEditor rows={ROWS} />);
    loadFile('not json');
    expect(await screen.findByText('Not a valid pixel-pal-cycle.json file.')).toBeInTheDocument();
  });
});

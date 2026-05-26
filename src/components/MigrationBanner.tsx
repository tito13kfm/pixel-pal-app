import React from 'react';

interface MigrationBannerProps {
  paletteName: string;
  onKeep: () => void;
  onRestore: () => void;
}

export const MigrationBanner: React.FC<MigrationBannerProps> = ({ paletteName, onKeep, onRestore }) => {
  return (
    <div
      role="alert"
      style={{
        background: '#3b2a05',
        border: '1px solid #aa7a00',
        color: '#ffeec0',
        padding: '10px 14px',
        margin: '8px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'monospace',
        fontSize: 13,
      }}
    >
      <span aria-hidden>⚠</span>
      <span style={{ flex: 1 }}>
        "{paletteName}" was made with the old engine. New ramps will look different.
      </span>
      <button
        type="button"
        onClick={onKeep}
        style={{ padding: '4px 10px', background: '#1a3b1a', color: '#dfffdf', border: '1px solid #4a9a4a', cursor: 'pointer' }}
      >
        Keep new look
      </button>
      <button
        type="button"
        onClick={onRestore}
        style={{ padding: '4px 10px', background: '#3b1a1a', color: '#ffdfdf', border: '1px solid #9a4a4a', cursor: 'pointer' }}
      >
        Restore old look
      </button>
    </div>
  );
};

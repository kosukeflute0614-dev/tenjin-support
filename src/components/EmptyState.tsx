'use client';

import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
        border: '2px dashed #ddd',
        borderRadius: '12px',
        textAlign: 'center',
      }}
    >
      {icon && (
        <div style={{ fontSize: 0, color: '#ccc', marginBottom: '1rem' }}>
          <div style={{ width: 48, height: 48 }}>{icon}</div>
        </div>
      )}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: '0.9rem', color: 'var(--slate-500)', margin: '0 0 1.5rem' }}>
          {description}
        </p>
      )}
      {action && (
        <button className="btn btn-primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

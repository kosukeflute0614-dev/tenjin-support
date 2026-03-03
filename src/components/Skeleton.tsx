'use client';

import React from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  variant?: 'text' | 'card' | 'circle' | 'table-row';
  width?: string;
  height?: string;
  count?: number;
}

export default function Skeleton({ variant = 'text', width, height, count = 1 }: SkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <>
      {items.map(i => (
        <div
          key={i}
          className={`${styles.skeleton} ${styles[variant]}`}
          style={{ width, height }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

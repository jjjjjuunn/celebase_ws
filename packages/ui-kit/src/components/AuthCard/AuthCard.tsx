import type { ReactElement, ReactNode } from 'react';
import styles from './AuthCard.module.css';

export interface AuthCardProps {
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AuthCard({ title, children, footer, className }: AuthCardProps): ReactElement {
  const classes = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {title !== undefined && (
        <div className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
        </div>
      )}
      <div className={styles.body}>{children}</div>
      {footer !== undefined && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}

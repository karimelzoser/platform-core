import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type StackGap = 'compact' | 'normal' | 'spacious';
type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function PageShell({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={`ds-page ${className}`.trim()} {...props} />;
}

export function Stack({
  gap = 'normal',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: StackGap }) {
  return <div className={`ds-stack ds-stack--${gap} ${className}`.trim()} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ds-page-header">
      <div className="ds-page-header__copy">
        {eyebrow ? <div className="ds-eyebrow">{eyebrow}</div> : null}
        <h1 className="ds-title">{title}</h1>
        {description ? <p className="ds-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="ds-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function SurfaceCard({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`ds-card ${className}`.trim()} {...props} />;
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <SurfaceCard className="ds-metric">
      <div className="ds-metric__label">{label}</div>
      <div className="ds-metric__value">{value}</div>
      {detail ? <div className="ds-metric__detail">{detail}</div> : null}
    </SurfaceCard>
  );
}

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <span className="ds-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function ActionButton({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`ds-button ds-button--${variant} ${className}`.trim()} {...props} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ds-empty" role="status">
      <strong className="ds-empty__title">{title}</strong>
      {description ? <p className="ds-empty__description">{description}</p> : null}
      {action ? <div className="ds-empty__action">{action}</div> : null}
    </div>
  );
}

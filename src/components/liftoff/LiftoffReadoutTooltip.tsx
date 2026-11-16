import { useId, type ReactNode } from 'react';

export function LiftoffReadoutTooltip({
  children,
  explanation,
  className = ''
}: {
  children: ReactNode;
  explanation: string;
  className?: string;
}) {
  const tooltipId = useId();
  return (
    <span className={`liftoff-readout-help ${className}`} tabIndex={0} aria-describedby={tooltipId}>
      {children}
      <span className="liftoff-readout-tooltip" id={tooltipId} role="tooltip">
        {explanation}
      </span>
    </span>
  );
}

import React from 'react';

export function Checkbox({ checked, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return <input {...props} type="checkbox" checked={checked ?? false} onChange={(event) => onChange?.(event.target.checked)} />;
}

export function Tabs({ value, onChange, children, className }: { value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string }) {
  return <div className={className} data-tabs-value={value} onClick={(event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tab-value]');
    if (target?.dataset.tabValue) onChange(target.dataset.tabValue);
  }}>{children}</div>;
}

export function TabList({ children }: { children: React.ReactNode }) { return <div role="tablist" className="flex gap-2">{children}</div>; }
export function Tab({ value, children }: { value: string; children: React.ReactNode }) { return <button type="button" role="tab" data-tab-value={value} className="px-3 py-2">{children}</button>; }
export function TabPanel({ value, children }: { value: string; children: React.ReactNode }) { return <div data-tab-panel={value}>{children}</div>; }

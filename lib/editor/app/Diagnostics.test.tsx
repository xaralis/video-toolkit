import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DiagnosticsBadge } from './Diagnostics';

const items = [
  { severity: 'error' as const, message: 'Needs 10 frames before the cut, this clip has 0', targetId: 'transition:v1' },
];

describe('DiagnosticsBadge', () => {
  it('renders nothing at all when there is nothing to report', () => {
    const { container } = render(<DiagnosticsBadge items={[]} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('counts the issues and hides the list until it is opened', () => {
    const { getByRole, queryByText } = render(<DiagnosticsBadge items={items} onSelect={() => {}} />);
    expect(getByRole('button').textContent).toBe('1 issue');
    expect(queryByText(items[0].message)).toBeNull();
  });

  it('pluralises', () => {
    const two = [items[0], { ...items[0], targetId: 'transition:v2' }];
    const { getByRole } = render(<DiagnosticsBadge items={two} onSelect={() => {}} />);
    expect(getByRole('button').textContent).toBe('2 issues');
  });

  it('selects the offending boundary when an entry is clicked', () => {
    const onSelect = vi.fn();
    const { getByRole, getByText } = render(<DiagnosticsBadge items={items} onSelect={onSelect} />);
    fireEvent.click(getByRole('button'));
    fireEvent.click(getByText(items[0].message));
    expect(onSelect).toHaveBeenCalledWith('transition:v1');
  });
});

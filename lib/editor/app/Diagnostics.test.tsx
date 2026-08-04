import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { StatusChip, statusChipState } from './Diagnostics';

const issue = { severity: 'error' as const, message: 'Needs 10 frames before the cut, this clip has 0', targetId: 'transition:v1' };

describe('statusChipState — severity ordering', () => {
  it('issue outranks unsaved outranks clean', () => {
    expect(statusChipState([], false)).toBe('clean');
    expect(statusChipState([], true)).toBe('unsaved');
    expect(statusChipState([issue], false)).toBe('issue');
    expect(statusChipState([issue], true)).toBe('issue'); // overlap: issue wins
  });
});

// The chip's whole point is that its box never changes size — that is what
// keeps the header stable. Assert it structurally: the box-defining classes
// (everything except the per-state colour classes) must be byte-identical
// across all three states.
describe('StatusChip — fixed-size box across states', () => {
  const structuralClasses = (className: string) =>
    className
      .split(' ')
      .filter((token) => !/^ed:(border|text)-(success|warn|danger)$/.test(token))
      .sort()
      .join(' ');

  it('the box class list is identical in clean, unsaved, and issue states, aside from colour', () => {
    const clean = render(<StatusChip items={[]} dirty={false} onSelect={() => {}} />);
    const cleanClass = structuralClasses(clean.getByRole('button').className);
    clean.unmount();

    const unsaved = render(<StatusChip items={[]} dirty onSelect={() => {}} />);
    const unsavedClass = structuralClasses(unsaved.getByRole('button').className);
    unsaved.unmount();

    const withIssue = render(<StatusChip items={[issue]} dirty={false} onSelect={() => {}} />);
    const issueClass = structuralClasses(withIssue.getByRole('button').className);
    withIssue.unmount();

    expect(unsavedClass).toBe(cleanClass);
    expect(issueClass).toBe(cleanClass);
  });

  it('each state still uses a distinct colour class, so the states are not visually identical', () => {
    const clean = render(<StatusChip items={[]} dirty={false} onSelect={() => {}} />);
    const cleanClass = clean.getByRole('button').className;
    clean.unmount();

    const unsaved = render(<StatusChip items={[]} dirty onSelect={() => {}} />);
    const unsavedClass = unsaved.getByRole('button').className;
    unsaved.unmount();

    const withIssue = render(<StatusChip items={[issue]} dirty={false} onSelect={() => {}} />);
    const issueClass = withIssue.getByRole('button').className;
    withIssue.unmount();

    expect(cleanClass).toContain('ed:text-success');
    expect(unsavedClass).toContain('ed:text-warn');
    expect(issueClass).toContain('ed:text-danger');
    expect(new Set([cleanClass, unsavedClass, issueClass]).size).toBe(3);
  });
});

describe('StatusChip — accessible name states the condition, not just a colour', () => {
  it('is "Saved" when clean', () => {
    const { getByRole } = render(<StatusChip items={[]} dirty={false} onSelect={() => {}} />);
    expect(getByRole('button', { name: 'Saved' })).toBeInTheDocument();
  });

  it('is "Unsaved changes" when dirty with no issues', () => {
    const { getByRole } = render(<StatusChip items={[]} dirty onSelect={() => {}} />);
    expect(getByRole('button', { name: 'Unsaved changes' })).toBeInTheDocument();
  });

  it('states the issue count, singular and plural', () => {
    const one = render(<StatusChip items={[issue]} dirty={false} onSelect={() => {}} />);
    expect(one.getByRole('button', { name: '1 issue' })).toBeInTheDocument();
    one.unmount();

    const two = render(<StatusChip items={[issue, { ...issue, targetId: 'transition:v2' }]} dirty={false} onSelect={() => {}} />);
    expect(two.getByRole('button', { name: '2 issues' })).toBeInTheDocument();
  });
});

describe('StatusChip — red-with-unsaved states both facts', () => {
  it('the tooltip mentions both the issue and the unsaved state when both are true', () => {
    const { getByRole } = render(<StatusChip items={[issue]} dirty onSelect={() => {}} />);
    const chip = getByRole('button', { name: '1 issue' }); // issue still wins the accessible name
    expect(chip.title).toContain('1 issue');
    expect(chip.title).toContain('Unsaved changes');
  });

  it('the open popup also states unsaved changes alongside the issue list', () => {
    const { getByRole, getByText } = render(<StatusChip items={[issue]} dirty onSelect={() => {}} />);
    fireEvent.click(getByRole('button', { name: '1 issue' }));
    expect(getByText('Unsaved changes')).toBeInTheDocument();
    expect(getByText(issue.message)).toBeInTheDocument();
  });

  it('unsaved-only (no issues) does not mention issues in the tooltip', () => {
    const { getByRole } = render(<StatusChip items={[]} dirty onSelect={() => {}} />);
    const chip = getByRole('button', { name: 'Unsaved changes' });
    expect(chip.title).toBe('Unsaved changes');
  });
});

describe('StatusChip — detail popup (folded-in DiagnosticsBadge behaviour)', () => {
  it('hides the issue list until opened', () => {
    const { getByRole, queryByText } = render(<StatusChip items={[issue]} dirty={false} onSelect={() => {}} />);
    expect(queryByText(issue.message)).toBeNull();
    fireEvent.click(getByRole('button'));
    expect(queryByText(issue.message)).not.toBeNull();
  });

  it('selects the offending boundary when an entry is clicked', () => {
    const onSelect = vi.fn();
    const { getByRole, getByText } = render(<StatusChip items={[issue]} dirty={false} onSelect={onSelect} />);
    fireEvent.click(getByRole('button'));
    fireEvent.click(getByText(issue.message));
    expect(onSelect).toHaveBeenCalledWith('transition:v1');
  });

  it('does not open a popup for the clean or unsaved-only states — nothing to select', () => {
    const { getByRole, queryByRole } = render(<StatusChip items={[]} dirty onSelect={() => {}} />);
    fireEvent.click(getByRole('button'));
    expect(queryByRole('list')).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { Collapsible } from './Collapsible';

// Direct unit tests for the shared accordion-row component — see its own
// file-level comment for the defect these pin: the header used to be a
// `<div role="button">` with the `right` slot nested INSIDE it, which (a)
// folded a labelled button in `right` into the header's own accessible name
// and (b) put interactive content inside a `role="button"`, both ARIA/HTML
// violations. `LayeredInspector.test.tsx` exercises this component
// end-to-end through the Color/Effects/Music boost/Transition out sections;
// these tests pin the component's own contract in isolation.

function Labelled({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}>
      X
    </button>
  );
}

describe('Collapsible header accessible name', () => {
  it('is the title ALONE even when a right slot with its own labelled button is present', () => {
    render(
      <Collapsible title="Section" right={<Labelled label="Reset all" />}>
        <div>body</div>
      </Collapsible>,
    );
    // This is the query the defect broke: a header computed its accessible
    // name from ALL of its content, so a labelled button in `right` bled
    // into it (something like "Section Reset all").
    expect(screen.getByRole('button', { name: 'Section' })).toBeInTheDocument();
  });

  it('still resolves with no right slot at all', () => {
    render(
      <Collapsible title="Section">
        <div>body</div>
      </Collapsible>,
    );
    expect(screen.getByRole('button', { name: 'Section' })).toBeInTheDocument();
  });
});

describe('Collapsible right slot is a sibling of the toggle, not a descendant', () => {
  it("the right slot's button is not inside the toggle button", () => {
    render(
      <Collapsible title="Section" right={<Labelled label="Reset all" />}>
        <div>body</div>
      </Collapsible>,
    );
    const toggle = screen.getByRole('button', { name: 'Section' });
    const rightBtn = screen.getByRole('button', { name: 'Reset all' });
    expect(toggle.contains(rightBtn)).toBe(false);
    expect(rightBtn.contains(toggle)).toBe(false);
  });

  it('clicking the right slot does not toggle the section open', () => {
    render(
      <Collapsible title="Section" right={<Labelled label="Reset all" />}>
        <div data-testid="body">body</div>
      </Collapsible>,
    );
    expect(screen.queryByTestId('body')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(screen.queryByTestId('body')).toBeNull();
    expect(screen.getByRole('button', { name: 'Section' })).toHaveAttribute('aria-expanded', 'false');
  });

  it("clicking the right slot fires ONLY its own handler, not the toggle's", () => {
    const onRightClick = vi.fn();
    render(
      <Collapsible title="Section" right={<Labelled label="Reset all" onClick={onRightClick} />}>
        <div>body</div>
      </Collapsible>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(onRightClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Section' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('the toggle still opens/closes the section on its own click', () => {
    render(
      <Collapsible title="Section" right={<Labelled label="Reset all" />}>
        <div data-testid="body">body</div>
      </Collapsible>,
    );
    const toggle = screen.getByRole('button', { name: 'Section' });
    fireEvent.click(toggle);
    expect(screen.getByTestId('body')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(screen.queryByTestId('body')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Collapsible aria-controls / panel id', () => {
  it('aria-expanded and aria-controls point at the panel, which carries that same id', () => {
    render(
      <Collapsible title="Section" defaultOpen>
        <div data-testid="body">body</div>
      </Collapsible>,
    );
    const toggle = screen.getByRole('button', { name: 'Section' });
    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!);
    expect(panel).not.toBeNull();
    expect(panel).toContainElement(screen.getByTestId('body'));
  });

  it('aria-controls stays stable across a re-render of the same instance', () => {
    const { rerender } = render(
      <Collapsible title="Section" defaultOpen id="stable">
        <div>body</div>
      </Collapsible>,
    );
    const first = screen.getByRole('button', { name: 'Section' }).getAttribute('aria-controls');
    rerender(
      <Collapsible title="Section" defaultOpen id="stable">
        <div>body</div>
      </Collapsible>,
    );
    const second = screen.getByRole('button', { name: 'Section' }).getAttribute('aria-controls');
    expect(second).toBe(first);
  });

  it('two sibling sections get distinct panel ids, even with the same title', () => {
    render(
      <>
        <Collapsible title="Section" id="one" defaultOpen>
          <div>body one</div>
        </Collapsible>
        <Collapsible title="Section" id="two" defaultOpen>
          <div>body two</div>
        </Collapsible>
      </>,
    );
    const toggles = screen.getAllByRole('button', { name: 'Section' });
    expect(toggles).toHaveLength(2);
    const ids = toggles.map((t) => t.getAttribute('aria-controls'));
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('two sibling sections get distinct ids even with no `id` prop supplied at all', () => {
    render(
      <>
        <Collapsible title="Effect · vintage">
          <div>body one</div>
        </Collapsible>
        <Collapsible title="Effect · vintage">
          <div>body two</div>
        </Collapsible>
      </>,
    );
    const toggles = screen.getAllByRole('button', { name: 'Effect · vintage' });
    const ids = toggles.map((t) => t.getAttribute('aria-controls'));
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe('Collapsible defaultOpen / toggle behaviour', () => {
  it('starts closed by default', () => {
    render(
      <Collapsible title="Section">
        <div data-testid="body">body</div>
      </Collapsible>,
    );
    expect(screen.queryByTestId('body')).toBeNull();
    expect(screen.getByRole('button', { name: 'Section' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts open when defaultOpen is true', () => {
    render(
      <Collapsible title="Section" defaultOpen>
        <div data-testid="body">body</div>
      </Collapsible>,
    );
    expect(screen.getByTestId('body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Section' })).toHaveAttribute('aria-expanded', 'true');
  });
});

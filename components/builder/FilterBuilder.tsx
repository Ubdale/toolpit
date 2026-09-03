'use client';

import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import {
  nextId,
  OPERATORS,
  type Field,
  type FilterGroup,
  type FilterNode,
  type FilterOperator,
  type FilterRule,
} from '@/lib/builder/types';

/**
 * The multi-condition filter builder, shared by both builders.
 *
 * Groups nest, so "region is North AND (channel is Online OR orders > 100)" is
 * expressible rather than approximated. The operator list is driven by the
 * field's inferred type, which is what stops a text column offering "greater
 * than" and a number column offering "starts with".
 */

export function FilterBuilder({
  fields,
  value,
  onChange,
}: {
  fields: Field[];
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
}) {
  return (
    <GroupEditor
      fields={fields}
      group={value}
      onChange={onChange}
      onRemove={null}
      depth={0}
    />
  );
}

function GroupEditor({
  fields,
  group,
  onChange,
  onRemove,
  depth,
}: {
  fields: Field[];
  group: FilterGroup;
  onChange: (next: FilterGroup) => void;
  onRemove: (() => void) | null;
  depth: number;
}) {
  const update = (children: FilterNode[]) => onChange({ ...group, children });

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3',
        depth === 0 ? 'border-line' : 'border-line-strong bg-sunken/50',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(['and', 'or'] as const).map((combinator) => (
            <button
              key={combinator}
              type="button"
              aria-pressed={group.combinator === combinator}
              onClick={() => onChange({ ...group, combinator })}
              className={cn(
                'px-2.5 py-1 text-xs font-medium uppercase transition-colors',
                group.combinator === combinator
                  ? 'bg-accent text-accent-contrast'
                  : 'text-muted hover:bg-sunken',
              )}
            >
              {combinator}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted">
          {group.combinator === 'and' ? 'every condition must hold' : 'any condition may hold'}
        </span>

        {onRemove ? (
          <button
            type="button"
            aria-label="Remove this group"
            onClick={onRemove}
            className="ml-auto rounded p-1 text-muted hover:text-danger"
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>

      {group.children.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted">
          No conditions — every row is included.
        </p>
      ) : (
        group.children.map((child, index) =>
          child.kind === 'group' ? (
            <GroupEditor
              key={child.id}
              fields={fields}
              group={child}
              depth={depth + 1}
              onChange={(next) =>
                update(group.children.map((c, i) => (i === index ? next : c)))
              }
              onRemove={() => update(group.children.filter((_, i) => i !== index))}
            />
          ) : (
            <RuleEditor
              key={child.id}
              fields={fields}
              rule={child}
              onChange={(next) =>
                update(group.children.map((c, i) => (i === index ? next : c)))
              }
              onRemove={() => update(group.children.filter((_, i) => i !== index))}
            />
          ),
        )
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const field = fields[0];
            if (!field) return;
            update([
              ...group.children,
              {
                id: nextId('rule'),
                kind: 'rule',
                field: field.key,
                operator: OPERATORS[field.type][0]!.value,
                value: '',
              },
            ]);
          }}
        >
          <Icon name="add" size={16} />
          Condition
        </Button>

        {depth < 2 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              update([
                ...group.children,
                { id: nextId('group'), kind: 'group', combinator: 'or', children: [] },
              ])
            }
          >
            <Icon name="add" size={16} />
            Group
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RuleEditor({
  fields,
  rule,
  onChange,
  onRemove,
}: {
  fields: Field[];
  rule: FilterRule;
  onChange: (next: FilterRule) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === rule.field) ?? fields[0];
  const operators = OPERATORS[field?.type ?? 'text'];
  const needsValue = !['isEmpty', 'notEmpty'].includes(rule.operator);
  const needsSecond = rule.operator === 'between';

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-surface p-2">
      <Dropdown
        className="min-w-36 flex-1"
        searchable={fields.length > 8}
        value={rule.field}
        onChange={(next) => {
          if (!next) return;
          const changed = fields.find((f) => f.key === next);
          // The operator list depends on the type, so a type change resets it
          // rather than leaving "starts with" on a number column.
          const allowed = OPERATORS[changed?.type ?? 'text'];
          const keep = allowed.some((o) => o.value === rule.operator);
          onChange({
            ...rule,
            field: next,
            operator: keep ? rule.operator : allowed[0]!.value,
            value: '',
          });
        }}
        options={fields.map((f) => ({ value: f.key, label: f.label, description: f.type }))}
      />

      <Dropdown
        className="min-w-28"
        value={rule.operator}
        onChange={(next) => next && onChange({ ...rule, operator: next as FilterOperator })}
        options={operators.map((o) => ({ value: o.value, label: o.label }))}
      />

      {needsValue ? (
        <input
          value={String(rule.value ?? '')}
          onChange={(event) => onChange({ ...rule, value: event.target.value })}
          placeholder={rule.operator === 'in' ? 'a, b, c' : 'Value'}
          aria-label="Filter value"
          className="h-11 min-w-24 flex-1 rounded-xl border border-line bg-surface px-3 text-sm transition-colors hover:border-line-strong focus:border-accent"
        />
      ) : null}

      {needsSecond ? (
        <input
          value={String(rule.value2 ?? '')}
          onChange={(event) => onChange({ ...rule, value2: event.target.value })}
          placeholder="and"
          aria-label="Second filter value"
          className="h-11 min-w-24 flex-1 rounded-xl border border-line bg-surface px-3 text-sm transition-colors hover:border-line-strong focus:border-accent"
        />
      ) : null}

      <button
        type="button"
        aria-label="Remove this condition"
        onClick={onRemove}
        className="mt-1.5 rounded p-1 text-muted hover:text-danger"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

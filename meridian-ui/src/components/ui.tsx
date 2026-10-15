import { useRef, type ComponentProps, type ReactNode } from 'react'
import {
  Accordion as AccordionPrimitive,
  Checkbox as CheckboxPrimitive,
  Dialog as DialogPrimitive,
  DropdownMenu as DropdownPrimitive,
  Label as LabelPrimitive,
  Select as SelectPrimitive,
  Slot,
  Tabs as TabsPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui'
import { Check, ChevronDown, X, AlertCircle, Inbox } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      default: 'ui-button-primary',
      outline: 'ui-button-outline',
      ghost: 'ui-button-ghost',
      destructive: 'ui-button-destructive',
    },
    size: { default: '', icon: 'ui-button-icon', sm: 'ui-button-small' },
  },
  defaultVariants: { variant: 'outline', size: 'default' },
})

export function Button({
  className,
  variant,
  size,
  asChild,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('ui-input', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('draft-editor', className)} {...props} />
}

export function FormLabel(props: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className="form-label" {...props} />
}

export function FormDescription(props: ComponentProps<'p'>) {
  return <p className="form-description" {...props} />
}

export function FormMessage(props: ComponentProps<'p'>) {
  return <p className="form-message" role="alert" {...props} />
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn('ui-checkbox', className)} {...props}>
      <CheckboxPrimitive.Indicator>
        <Check size={16} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export function Select({
  value,
  onValueChange,
  label,
  options,
  className,
  disabled,
}: {
  value: string
  onValueChange: (value: string) => void
  label: string
  options: { value: string; label: string }[]
  className?: string
  disabled?: boolean
}) {
  return (
    <SelectPrimitive.Root
      value={value || '__all__'}
      onValueChange={(next) => onValueChange(next === '__all__' ? '' : next)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger aria-label={label} className={cn('ui-select', className)}>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          sideOffset={4}
          collisionPadding={16}
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            ↑
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value || '__all__'}
                className="ui-select-item"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check size={16} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            ↓
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('panel', className)} {...props} />
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'critical' | 'info'
  className?: string
}) {
  return <span className={cn('ui-badge', `badge-${tone}`, className)}>{children}</span>
}

export function StatusBadge({
  status,
  children,
}: {
  status?: string | null
  children?: ReactNode
}) {
  const tone = ['high', 'overdue', 'rejected'].includes(status ?? '')
    ? 'critical'
    : ['medium', 'pending', 'open', 'due', 'needs_review', 'planned'].includes(status ?? '')
      ? 'warning'
      : ['low', 'active', 'paid', 'closed', 'done', 'approved', 'completed', 'resolved'].includes(
            status ?? ''
          )
        ? 'success'
        : 'neutral'
  return <Badge tone={tone}>{children ?? status?.replaceAll('_', ' ') ?? 'Not recorded'}</Badge>
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('ui-skeleton', className)} />
}

export function LoadingState({ label = 'Loading records…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="sr-only">{label}</span>
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty-state">
      <Inbox size={24} aria-hidden="true" />
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="ui-tooltip" sideOffset={8}>
          {content}
          <TooltipPrimitive.Arrow />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
}) {
  const returnFocus = useRef<HTMLElement | null>(null)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sheet-overlay" />
        <DialogPrimitive.Content
          className="sheet-content"
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocus.current?.focus()
          }}
        >
          <div className="sheet-heading">
            <div>
              <p className="eyebrow">Record inspection</p>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Close record details">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="muted">{description}</DialogPrimitive.Description>
          <div className="sheet-body">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Accordion({
  sections,
}: {
  sections: { id: string; title: ReactNode; content: ReactNode }[]
}) {
  return (
    <AccordionPrimitive.Root type="multiple" className="ui-accordion">
      {sections.map((section) => (
        <AccordionPrimitive.Item value={section.id} key={section.id} className="accordion-item">
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="accordion-trigger">
              {section.title}
              <ChevronDown size={16} />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="accordion-content">
            {section.content}
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  )
}

export function Tabs({
  value,
  onValueChange,
  tabs,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  tabs: { value: string; label: string; icon?: ReactNode }[]
  children: ReactNode
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} activationMode="automatic">
      <TabsPrimitive.List className="detail-tabs" aria-label="Client details">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger key={tab.value} value={tab.value} className="detail-tab">
            {tab.icon}
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      <TabsPrimitive.Content value={value} className="tab-content">
        {children}
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  )
}

export function ColumnMenu({
  columns,
}: {
  columns: { id: string; label: string; visible: boolean; toggle: (visible: boolean) => void }[]
}) {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>
        <Button>
          Columns
          <ChevronDown size={16} />
        </Button>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content align="end" className="ui-menu" sideOffset={4}>
          <DropdownPrimitive.Label className="menu-label">Visible columns</DropdownPrimitive.Label>
          {columns.map((column) => (
            <DropdownPrimitive.CheckboxItem
              key={column.id}
              className="ui-menu-item"
              checked={column.visible}
              onCheckedChange={column.toggle}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="menu-check">
                <DropdownPrimitive.ItemIndicator>
                  <Check size={16} />
                </DropdownPrimitive.ItemIndicator>
              </span>
              {column.label}
            </DropdownPrimitive.CheckboxItem>
          ))}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  )
}

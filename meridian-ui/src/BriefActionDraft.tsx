import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { AccountBrief, SuggestedAction } from './types'
import { formatDate, formatRenewal } from './format'
import {
  Button,
  FormDescription,
  FormLabel,
  FormMessage,
  Input,
  Sheet,
  Textarea,
} from './components/ui'

const draftSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(250),
  body: z
    .string()
    .trim()
    .min(1, 'Enter draft content.')
    .max(12000, 'Keep this draft under 12,000 characters.'),
})

export function BriefActionDraft({
  action,
  brief,
  onClose,
}: {
  action: SuggestedAction
  brief: AccountBrief
  onClose: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof draftSchema>>({
    resolver: zodResolver(draftSchema),
    defaultValues: {
      title: action.title,
      body: `${action.description}\n\nAccount: ${brief.account.name}\nRenewal: ${formatRenewal(brief.days_to_renewal)}\n\nReview points\n${(
        brief.agenda ?? []
      )
        .slice(0, 4)
        .map((item) => `• ${item.replace(/^\d+\.\s*/, '')}`)
        .join(
          '\n'
        )}\n\nSource records as of ${formatDate(brief.as_of_date)}. Review source discrepancies before using this draft.`,
    },
  })
  async function copy(values: z.infer<typeof draftSchema>) {
    try {
      await navigator.clipboard.writeText(`${values.title}\n\n${values.body}`)
      toast.success('Reviewed draft copied to clipboard')
    } catch {
      toast.error('Clipboard is unavailable. Select and copy the draft text manually.')
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Review suggested action"
      description="Edit this draft, check the supporting records, then copy it to your normal workflow."
    >
      <form onSubmit={handleSubmit(copy)} noValidate>
        <FormLabel htmlFor="draft-title">Title</FormLabel>
        <Input
          id="draft-title"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'draft-title-error' : undefined}
          {...register('title')}
        />
        {errors.title && <FormMessage id="draft-title-error">{errors.title.message}</FormMessage>}
        <div className="mt-4">
          <FormLabel htmlFor="draft-body">Draft content</FormLabel>
          <Textarea
            id="draft-body"
            aria-invalid={!!errors.body}
            aria-describedby={errors.body ? 'draft-body-error' : 'draft-help'}
            {...register('body')}
          />
          {errors.body ? (
            <FormMessage id="draft-body-error">{errors.body.message}</FormMessage>
          ) : (
            <FormDescription id="draft-help">
              Confirm factual statements and coverage assumptions before sharing.
            </FormDescription>
          )}
        </div>
        <div className="draft-actions">
          <Button onClick={onClose}>Close</Button>
          <Button type="submit" variant="default" disabled={isSubmitting}>
            <Copy />
            {isSubmitting ? 'Copying…' : 'Copy reviewed draft'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

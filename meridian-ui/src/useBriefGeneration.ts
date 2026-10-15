import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError, getBriefGeneration, startBriefGeneration } from './api'
import type { AccountBrief, BriefGenerationJob } from './types'

export type GenerationController = {
  job: BriefGenerationJob | undefined
  isGenerating: boolean
  error: string | null
  connectionError: string | null
  regenerate: () => void
  retryStatus: () => void
}

export function useBriefGeneration(
  userId: string,
  accountId: string,
  brief?: AccountBrief
): GenerationController {
  const client = useQueryClient()
  const attempted = useRef(new Set<string>())
  const applied = useRef(new Set<string>())
  const manualJobs = useRef(new Set<string>())
  const key = ['brief-generation', userId, accountId]
  const cached = client.getQueryData<BriefGenerationJob>(key)
  const pending = cached?.status === 'queued' || cached?.status === 'running'
  const startErrorQuery = useQuery<string | null>({
    queryKey: ['brief-generation-error', userId, accountId],
    queryFn: async () => null,
    enabled: false,
    initialData: null,
  })
  const jobQuery = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const job = client.getQueryData<BriefGenerationJob>(['brief-generation', userId, accountId])
      if (!job) throw new Error('Generation status is unavailable. Please retry.')
      try {
        return await getBriefGeneration(accountId, job.job_id, signal)
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error
        void client.invalidateQueries({ queryKey: ['brief', userId, accountId] })
        return {
          ...job,
          status: 'failed' as const,
          phase: 'failed' as const,
          result: null,
          message: 'This generation session has ended. Please retry.',
          error: 'The backend restarted or this job is no longer available. Generate a fresh brief.',
        }
      }
    },
    enabled: !!accountId && pending,
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.status ?? '') ? 1000 : false,
    retry: 1,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })
  const start = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => startBriefGeneration(id, force),
    retry: false,
    onMutate: (variables) => {
      client.setQueryData(['brief-generation-error', userId, variables.id], null)
    },
    onError: (error, variables) => {
      client.setQueryData(['brief-generation-error', userId, variables.id], error.message)
    },
    onSuccess: (job, variables) => {
      if (variables.force) manualJobs.current.add(job.job_id)
      client.setQueryData(['brief-generation', userId, variables.id], job)
      if (job.status === 'succeeded' && job.result)
        client.setQueryData(['brief', userId, variables.id], job.result)
    },
  })
  const job = jobQuery.data
  const mutate = start.mutate
  const isStarting = start.isPending && start.variables?.id === accountId
  const isGenerating = isStarting || job?.status === 'queued' || job?.status === 'running'

  useEffect(() => {
    if (
      !job ||
      job.status !== 'succeeded' ||
      !job.result ||
      !brief ||
      applied.current.has(job.job_id)
    )
      return
    if (job.result.generation.source_fingerprint !== brief.generation.source_fingerprint) return
    applied.current.add(job.job_id)
    client.setQueryData(['brief', userId, job.account_id], job.result)
    if (manualJobs.current.delete(job.job_id)) {
      toast.success(
        job.result.generation.mode === 'offline'
          ? 'Source-based brief refreshed. AI is currently unavailable.'
          : 'Verified AI brief is ready.'
      )
    }
  }, [job, brief, client, userId])

  const fingerprint = brief?.generation?.source_fingerprint
  const stale = brief?.generation?.stale
  const canGenerate = brief?.generation?.can_generate
  useEffect(() => {
    if (!accountId || !fingerprint || !stale || !canGenerate || isGenerating) return
    const attemptKey = `${accountId}:${fingerprint}`
    if (attempted.current.has(attemptKey)) return
    attempted.current.add(attemptKey)
    mutate({ id: accountId, force: false })
  }, [accountId, fingerprint, stale, canGenerate, isGenerating, mutate])

  return {
    job,
    isGenerating,
    error: isGenerating
      ? null
      : startErrorQuery.data
        ? startErrorQuery.data
        : job?.status === 'failed'
          ? (job.error ?? 'Generation failed. Please retry.')
          : null,
    connectionError: jobQuery.isError
      ? 'Connection interrupted. Your current cards are still available; status will reconnect automatically.'
      : null,
    regenerate: () => {
      if (accountId && !isGenerating) mutate({ id: accountId, force: true })
    },
    retryStatus: () => {
      void jobQuery.refetch()
    },
  }
}

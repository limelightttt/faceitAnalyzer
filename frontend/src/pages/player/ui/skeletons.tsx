import { Skeleton, SkeletonCard, SkeletonChart, SkeletonTable, SkeletonText, SkeletonTiles } from '@/shared/ui'

/** Mirrors PlayerHeader: avatar, name + level, meta line, sample-size control. */
export function PlayerHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="space-y-2.5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-72 max-w-[60vw]" />
        </div>
      </div>
      <Skeleton className="h-8 w-36 rounded-lg" />
    </div>
  )
}

export const KpiSkeleton = () => <SkeletonTiles count={6} className="md:grid-cols-3 xl:grid-cols-6" />

export function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <KpiSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SkeletonCard>
          <SkeletonChart height={256} />
        </SkeletonCard>
        <SkeletonCard>
          <div className="space-y-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-20 rounded-md" />
                <Skeleton className="h-2 flex-1 rounded-full" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SkeletonCard className="px-0 [&>*:not(:last-child)]:mx-5">
          <SkeletonTable rows={8} cols={6} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonText lines={5} />
        </SkeletonCard>
      </div>
    </div>
  )
}

export const TableSkeleton = ({ rows = 10, cols = 7 }: { rows?: number; cols?: number }) => (
  <SkeletonCard className="px-0 [&>*:not(:last-child)]:mx-5">
    <SkeletonTable rows={rows} cols={cols} />
  </SkeletonCard>
)

export const TwoCardsSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
    <SkeletonCard>
      <SkeletonText lines={6} />
    </SkeletonCard>
    <SkeletonCard>
      <SkeletonText lines={6} />
    </SkeletonCard>
  </div>
)

export const ChartsSkeleton = () => (
  <div className="space-y-4">
    <SkeletonCard>
      <SkeletonChart height={240} />
    </SkeletonCard>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SkeletonCard>
        <SkeletonChart height={180} />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonChart height={180} />
      </SkeletonCard>
    </div>
  </div>
)

export const MatchSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-64" />
    <SkeletonTiles count={5} className="md:grid-cols-5" />
    <TableSkeleton rows={10} cols={8} />
  </div>
)

import { ExternalLink, Info } from 'lucide-react'

import { type DataQuality, type Profile, SourceBadge } from '@/entities/player'
import { SampleSizeSelect } from '@/features/sample-size'
import { Avatar, Badge, Hint } from '@/shared/ui'

const LEVEL_COLORS = ['#eee', '#1ce400', '#1ce400', '#ffc800', '#ffc800', '#ffc800', '#ffc800', '#ff6309', '#ff6309', '#fe1f00']

export function SkillLevel({ level }: { level: number | null }) {
  if (!level) return null
  return (
    <span
      className="inline-flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold"
      style={{ borderColor: LEVEL_COLORS[level - 1] ?? '#888' }}
      aria-label={`Уровень FACEIT ${level}`}
    >
      {level}
    </span>
  )
}

export function PlayerHeader({ profile, quality }: { profile: Profile; quality: DataQuality }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <Avatar src={profile.avatar} name={profile.nickname} className="size-14 rounded-xl bg-gradient-to-br from-primary to-[#ff8a3d] text-xl font-bold text-white" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{profile.nickname}</h1>
            <SkillLevel level={profile.skill_level} />
            <SourceBadge source={quality.source} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              Elo:{' '}
              <span className="font-semibold text-foreground tabular">{profile.elo ?? 'нет данных'}</span>
              {profile.elo !== null && <span className="text-subtle-foreground"> (официальный)</span>}
            </span>
            {profile.region && <span>Регион: {profile.region}</span>}
            <span>
              Загружено матчей: {quality.matches_loaded} (со статистикой {quality.matches_with_stats})
            </span>
            {profile.faceit_url && (
              <a className="inline-flex items-center gap-1 hover:text-foreground" href={profile.faceit_url} target="_blank" rel="noreferrer">
                FACEIT <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {quality.notes.length > 0 && (
          <Hint
            content={
              <ul className="list-disc space-y-1 pl-4">
                {quality.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            }
          >
            <button type="button" aria-label="Ограничения данных">
              <Badge variant="outline">
                <Info /> Ограничения данных: {quality.notes.length}
              </Badge>
            </button>
          </Hint>
        )}
        <SampleSizeSelect />
      </div>
    </div>
  )
}

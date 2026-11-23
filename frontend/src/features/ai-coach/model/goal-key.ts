/** Identifies a goal the same way on the coach page and in the AI review: metric plus map. */
export const goalKey = (metric: string, map: string | null) => `${metric}:${map ?? ''}`

/** Only the last extension counts: a browser saves a second download of `match.dem.zst` as
 * `match.dem (1).zst`. The server checks the content anyway (a non-demo fails to unpack or parse). */
export const DEMO_EXTENSIONS = ['.dem', '.gz', '.bz2', '.zst']

export const isDemoFileName = (name: string) => DEMO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))

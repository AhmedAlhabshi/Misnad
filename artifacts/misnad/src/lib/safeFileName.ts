const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/**
 * The Unicode replacement character and C0 control characters (other than
 * plain whitespace) are the telltale sign of a mis-decoded (mojibake) or
 * corrupted file name — multipart upload parsers commonly mis-decode
 * non-ASCII file names as Latin-1 when the browser actually sent UTF-8
 * bytes, producing exactly this kind of garbled text.
 */
function looksCorrupted(name: string): boolean {
  if (name.indexOf(REPLACEMENT_CHARACTER) !== -1) {
    return true;
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    const isTab = code === 9;
    const isLineFeed = code === 10;
    const isCarriageReturn = code === 13;
    if (code < 0x20 && !isTab && !isLineFeed && !isCarriageReturn) {
      return true;
    }
  }
  return false;
}

/**
 * Returns a file name that is always safe to render — never raw mojibake,
 * never empty/whitespace-only. Falls back to the caller-supplied localized
 * label when the name is missing or shows signs of corrupted/mis-decoded
 * bytes. Visual truncation (ellipsis) is left to the caller's `truncate`
 * CSS utility, since that responds to actual rendered width rather than a
 * fixed character count.
 */
export function getSafeFileNameDisplay(fileName: string | null | undefined, fallback: string): string {
  if (!fileName) {
    return fallback;
  }
  const trimmed = fileName.trim();
  if (trimmed.length === 0 || looksCorrupted(trimmed)) {
    return fallback;
  }
  return trimmed;
}

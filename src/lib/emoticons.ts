const EMOTICONS: Array<[string, string]> = [
  [":'-)", '🥲'],
  [":')", '🥲'],
  [":'-(", '😢'],
  [":'(", '😢'],
  ['X-D', '😆'],
  ['XD', '😆'],
  ['xD', '😆'],
  [':-D', '😀'],
  [':D', '😀'],
  [':-)', '🙂'],
  [':)', '🙂'],
  [':-(', '🙁'],
  [':(', '🙁'],
  [':-P', '😛'],
  [':P', '😛'],
  [':-p', '😛'],
  [':p', '😛'],
  [';-)', '😉'],
  [';)', '😉'],
  [':-O', '😮'],
  [':O', '😮'],
  [':-o', '😮'],
  [':o', '😮'],
  ['B-)', '😎'],
  ['B)', '😎'],
  [':-|', '😐'],
  [':|', '😐'],
  [':-/', '😕'],
  [':/', '😕'],
  [':-*', '😘'],
  [':*', '😘'],
  ['</3', '💔'],
  ['<3', '❤️'],
  [':>', '😏'],
  [':<', '😞'],
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const sortedByLength = [...EMOTICONS].sort((a, b) => b[0].length - a[0].length)
const EMOJI_BY_PATTERN = new Map(sortedByLength)
const EMOTICON_REGEX = new RegExp(
  `(?<![A-Za-z0-9])(${sortedByLength.map(([pattern]) => escapeRegExp(pattern)).join('|')})(?![A-Za-z0-9])`,
  'g',
)

export function convertEmoticons(text: string): string {
  return text.replace(EMOTICON_REGEX, (match) => EMOJI_BY_PATTERN.get(match) ?? match)
}

export const nicknameColors = [
  { value: '#9ecbff', label: '하늘색' },
  { value: '#a9dc76', label: '연두색' },
  { value: '#e5b567', label: '노란색' },
  { value: '#cb9df0', label: '보라색' },
  { value: '#f28da8', label: '분홍색' },
  { value: '#75d5ce', label: '민트색' },
  { value: '#b8c76b', label: '올리브색' },
  { value: '#eda47b', label: '주황색' },
] as const

export function nicknameColor(userId: string, chosen?: string | null): string {
  if (nicknameColors.some(color => color.value === chosen)) return chosen!
  let hash = 0
  for (const char of userId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0
  return nicknameColors[(hash >>> 0) % nicknameColors.length].value
}

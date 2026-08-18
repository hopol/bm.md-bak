export function toggleTheme(
  isDark: boolean,
  setTheme: (theme: string) => void,
) {
  const newTheme = isDark ? 'light' : 'dark'

  if (
    typeof document === 'undefined'
    || !('startViewTransition' in document)
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    setTheme(newTheme)
    return
  }

  document.startViewTransition(() => setTheme(newTheme))
}

import { useAuth } from './useAuth'

export function useTheme() {
  const { profile } = useAuth()
  const isFemme = profile?.genre === 'femme'

  return {
    isFemme,
    primary: isFemme ? 'pink' : 'brand',
    bg: isFemme ? 'bg-pink-600' : 'bg-brand-600',
    bgHover: isFemme ? 'hover:bg-pink-700' : 'hover:bg-brand-700',
    bgLight: isFemme ? 'bg-pink-50' : 'bg-brand-50',
    text: isFemme ? 'text-pink-700' : 'text-brand-700',
    textLight: isFemme ? 'text-pink-600' : 'text-brand-600',
    border: isFemme ? 'border-pink-200' : 'border-brand-200',
    ring: isFemme ? 'focus:ring-pink-400' : 'focus:ring-brand-400',
    navActive: isFemme ? 'bg-pink-50 text-pink-700' : 'bg-brand-50 text-brand-700',
    badge: isFemme ? 'bg-pink-50 text-pink-700' : 'bg-brand-50 text-brand-700',
    progress: isFemme ? 'bg-pink-500' : 'bg-brand-500',
    btn: isFemme
      ? 'bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-50'
      : 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50',
  }
}

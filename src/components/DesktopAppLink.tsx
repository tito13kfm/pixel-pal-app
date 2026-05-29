const RELEASES_URL = 'https://github.com/tito13kfm/pixel-pal-app/releases'

interface Props {
  textClassName?: string
  hoverClassName?: string
}

export function DesktopAppLink({
  textClassName = 'text-cyan-200',
  hoverClassName = 'hover:text-cyan-400',
}: Props) {
  return (
    <a
      href={RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-xs font-mono underline decoration-dotted underline-offset-2 ${textClassName} ${hoverClassName}`}
    >
      Get the desktop app →
    </a>
  )
}

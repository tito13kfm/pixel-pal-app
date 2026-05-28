const RELEASES_URL = 'https://github.com/tito13kfm/pixel-pal-app/releases'

export function DesktopAppLink() {
  return (
    <a
      href={RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-zinc-500 hover:text-cyan-400 font-mono"
    >
      Get the desktop app →
    </a>
  )
}

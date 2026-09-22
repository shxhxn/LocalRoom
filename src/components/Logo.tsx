export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo-mark ${small ? 'logo-mark--small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" role="presentation">
        <path d="M8.25 5.5v21h7.25M14.5 26.5v-21h6.1c3.9 0 6.35 2.25 6.35 5.7 0 3.55-2.45 5.8-6.35 5.8h-6.1m6.2 0 7.05 9.5" />
        <circle cx="27.75" cy="26.5" r="1.45" />
      </svg>
    </div>
  );
}

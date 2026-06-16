// Simplified Cardano-style mark: dark-blue disc with the ada (₳) glyph.
// Not the official multi-dot logo, but visually clearly Cardano-themed.
export function CardanoLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label="Cardano"
      role="img"
    >
      <circle cx="12" cy="12" r="11" fill="#E6F2F1" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#0E726E"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        ₳
      </text>
    </svg>
  );
}

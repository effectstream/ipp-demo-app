interface IppMarkProps {
  size?: number;
  /** gradient = teal squircle + white glyph; tint = soft-teal bg + teal glyph; dark = ink bg + white glyph. */
  variant?: "gradient" | "tint" | "dark";
  /** Drop a soft teal shadow under the squircle (hero usage). */
  shadow?: boolean;
  className?: string;
}

// IPP brand mark - a squircle with the women's-health glyph, from the
// "Clínica · Calm Teal" design system. Vector, so it stays crisp at any size.
export function IppMark({ size = 32, variant = "gradient", shadow = false, className }: IppMarkProps) {
  const glyph = variant === "tint" ? "#0E726E" : "#ffffff";
  const bg = variant === "tint" ? "#E6F2F1" : variant === "dark" ? "#14201E" : "url(#ipp-grad)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="IPP"
      style={shadow ? { filter: "drop-shadow(0 10px 20px rgba(10,84,80,0.45))" } : undefined}
    >
      <defs>
        <linearGradient id="ipp-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#13837E" />
          <stop offset="1" stopColor="#0A5450" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={bg} />
      <g transform="translate(9.6 9.6) scale(0.6)" fill={glyph} stroke={glyph}>
        <path d="M24 31 C24 23 18 21 12.5 17" strokeWidth="2.7" strokeLinecap="round" fill="none" />
        <path d="M24 31 C24 23 30 21 35.5 17" strokeWidth="2.7" strokeLinecap="round" fill="none" />
        <ellipse cx="10.6" cy="15.4" rx="3.2" ry="2.4" stroke="none" transform="rotate(-32 10.6 15.4)" />
        <ellipse cx="37.4" cy="15.4" rx="3.2" ry="2.4" stroke="none" transform="rotate(32 37.4 15.4)" />
        <path
          d="M24 30.5 C19.6 30.5 18.6 35 20.8 38 C22.4 40.2 25.6 40.2 27.2 38 C29.4 35 28.4 30.5 24 30.5 Z"
          stroke="none"
        />
      </g>
    </svg>
  );
}

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

const RING_MASK = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";

interface GlowBorderProps {
  /**
   * beam:  a short bright arc travelling around the border (Magic UI "Border Beam")
   * shine: a soft multi-colour light sweeping around it (Magic UI "Shine Border")
   */
  variant?: "beam" | "shine";
  colors: [string, string, ...string[]];
  /** Seconds per lap. */
  duration?: number;
  /** Border thickness in px. */
  width?: number;
  className?: string;
}

/**
 * An animated light around a card's border, for "this needs attention"
 * (alerts) and "something is working" (the AI filter while it streams).
 *
 * Adapted from Magic UI's Border Beam and Shine Border (21st.dev). Those
 * animate `offset-distance` and `background-position`, which run on the
 * main thread and repaint every frame. Here a conic gradient sits behind a
 * ring-shaped mask (only the border shows through) and simply ROTATES:
 * a transform, so the GPU animates it with no main-thread work at all.
 *
 * The rotating square is sized from container units to always cover the
 * card's diagonal. Reduced motion: the light stays still (still visible,
 * still meaningful) — see `.glow-border-spin` in styles/index.css.
 */
export function GlowBorder({ variant = "beam", colors, duration = 4, width = 1, className }: GlowBorderProps) {
  const gradient =
    variant === "beam"
      ? `conic-gradient(from 0deg, transparent 0deg 250deg, ${colors[0]} 310deg, ${colors[1]} 345deg, transparent 360deg)`
      : `conic-gradient(from 0deg, ${[...colors, colors[0]].join(", ")})`;

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit] [container-type:size]", className)}
      style={{
        padding: width,
        mask: RING_MASK,
        WebkitMask: RING_MASK,
        maskComposite: "exclude",
        WebkitMaskComposite: "xor",
      }}
    >
      <div
        className="glow-border-spin absolute top-1/2 left-1/2 aspect-square"
        style={
          {
            width: "calc(100cqw + 100cqh)",
            translate: "-50% -50%",
            background: gradient,
            opacity: variant === "shine" ? 0.9 : 1,
            "--glow-duration": `${duration}s`,
          } as CSSProperties
        }
      />
    </div>
  );
}

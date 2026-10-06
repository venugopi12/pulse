import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useState, type ComponentProps, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

/** Only devices with a real hover pointer get the spotlight (not touch). */
const finePointer = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const RING_MASK = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";

/**
 * A card with a spotlight that follows the pointer: a soft glow inside the
 * card and a brighter light along its 1px border, both in the tenant accent.
 *
 * Adapted from Magic UI's "Magic Card" (21st.dev). The original's gradient
 * mode moves a radial-gradient's *position*, which repaints the card on
 * every pointer move. This uses its "orb" approach instead: the glows are
 * elements moved with transform, so following the pointer is compositor-only.
 * The border light is the same orb seen through a ring-shaped mask.
 *
 * Off for touch screens and reduced motion; the card is then a plain surface.
 */
export function SpotlightCard({ className, children, ...props }: ComponentProps<"div">) {
  const reduce = useReducedMotion();
  const [enabled] = useState(finePointer);
  const on = enabled && !reduce;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const visible = useSpring(0, { visualDuration: 0.3, bounce: 0 });

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - r.left);
    y.set(e.clientY - r.top);
  };

  return (
    <div
      className={cn("surface edge-light relative isolate overflow-hidden rounded-[var(--radius-card)]", className)}
      onPointerMove={on ? move : undefined}
      onPointerEnter={on ? () => visible.set(1) : undefined}
      onPointerLeave={on ? () => visible.set(0) : undefined}
      {...props}
    >
      {on && (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 -z-10 size-[420px] rounded-full"
            style={{
              x,
              y,
              translateX: "-50%",
              translateY: "-50%",
              opacity: visible,
              background: "radial-gradient(closest-side, var(--accent-soft), transparent)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] p-px"
            style={{ mask: RING_MASK, WebkitMask: RING_MASK, maskComposite: "exclude", WebkitMaskComposite: "xor" }}
          >
            <motion.div
              className="absolute top-0 left-0 size-[260px] rounded-full"
              style={{
                x,
                y,
                translateX: "-50%",
                translateY: "-50%",
                opacity: visible,
                background: "radial-gradient(closest-side, var(--accent), transparent)",
              }}
            />
          </div>
        </>
      )}
      {children}
    </div>
  );
}

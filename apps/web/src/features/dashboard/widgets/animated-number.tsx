import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { spring } from "@/lib/motion";

/**
 * A number that springs to each new value.
 *
 * The spring runs on a MotionValue and writes straight into the DOM text
 * node, so the ~30 frames of animation cost zero React re-renders. React only
 * renders when the TARGET value changes.
 * With reduced motion, the value jumps instead of springing.
 */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const animated = useSpring(value, spring.data);
  const text = useTransform(animated, (v) => format(v));

  useEffect(() => {
    if (reduce) animated.jump(value);
    else animated.set(value);
  }, [value, reduce, animated]);

  return <motion.span>{text}</motion.span>;
}

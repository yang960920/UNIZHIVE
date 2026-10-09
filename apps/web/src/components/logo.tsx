import Image from "next/image";

const files = {
  horizontal: "logo-horizontal.png",
  stacked: "logo-stacked.png",
  detail: "emblem-detail.png",
  compact: "emblem-compact.png",
  mono: "emblem-mono.png",
};
export function Logo({
  variant = "horizontal",
  size = "md",
  className = "",
}: {
  variant?: keyof typeof files;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const horizontal = variant === "horizontal";
  const displayWidth = horizontal
    ? { sm: 154, md: 240, lg: 360 }[size]
    : { sm: 40, md: 128, lg: 220 }[size];
  return (
    <Image
      src={`/brand/${files[variant]}`}
      width={horizontal ? 2172 : 1280}
      height={horizontal ? 724 : 1280}
      sizes={`${displayWidth}px`}
      alt="UNIZ HIVE"
      className={`logo logo-${variant} logo-${size} ${className}`}
      preload={variant === "horizontal"}
      loading={variant === "detail" || variant === "compact" ? "eager" : undefined}
    />
  );
}

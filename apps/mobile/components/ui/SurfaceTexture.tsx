import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

export type SurfaceTextureTone =
  | "default"
  | "muted"
  | "emphasis"
  | "danger"
  | "info"
  | "success"
  | "warning";

const TONE_STYLES: Record<
  SurfaceTextureTone,
  {
    highlight: string;
    shade: string;
    glow: string;
    noise: string;
  }
> = {
  default: {
    highlight: "#ffffff",
    shade: "#e7e2d6",
    glow: "#f1ece1",
    noise: "#b9b4a8",
  },
  muted: {
    highlight: "#faf7ef",
    shade: "#e7dfcf",
    glow: "#efe7d9",
    noise: "#b9b4a8",
  },
  emphasis: {
    highlight: "#fffdf8",
    shade: "#efe7d7",
    glow: "#f7efdf",
    noise: "#c4bcad",
  },
  danger: {
    highlight: "#fff8f7",
    shade: "#f3dfdb",
    glow: "#f8e9e6",
    noise: "#d5b7b3",
  },
  info: {
    highlight: "#f7fbff",
    shade: "#dde9f9",
    glow: "#e8f1fe",
    noise: "#b7c8e2",
  },
  success: {
    highlight: "#f8fdf9",
    shade: "#dfebdf",
    glow: "#ebf6ed",
    noise: "#b7cdbd",
  },
  warning: {
    highlight: "#fffaf2",
    shade: "#f3e3c6",
    glow: "#faeed9",
    noise: "#d7c29c",
  },
};

interface SurfaceTextureProps {
  tone?: SurfaceTextureTone;
}

export function SurfaceTexture({
  tone = "default",
}: SurfaceTextureProps) {
  const rawId = useId().replace(/[:]/g, "");
  const gradientId = `${rawId}-gradient`;
  const glowId = `${rawId}-glow`;
  const noiseId = `${rawId}-noise`;
  const palette = TONE_STYLES[tone];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={palette.highlight} stopOpacity="0.55" />
            <Stop offset="52%" stopColor={palette.highlight} stopOpacity="0.08" />
            <Stop offset="100%" stopColor={palette.shade} stopOpacity="0.24" />
          </LinearGradient>
          <RadialGradient id={glowId} cx="22%" cy="12%" r="70%">
            <Stop offset="0%" stopColor={palette.glow} stopOpacity="0.55" />
            <Stop offset="55%" stopColor={palette.glow} stopOpacity="0.12" />
            <Stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
          </RadialGradient>
          <Pattern id={noiseId} patternUnits="userSpaceOnUse" width="18" height="18">
            <Circle cx="3" cy="4" r="0.7" fill={palette.noise} fillOpacity="0.16" />
            <Circle cx="12" cy="6" r="0.55" fill={palette.noise} fillOpacity="0.12" />
            <Circle cx="7" cy="13" r="0.65" fill={palette.noise} fillOpacity="0.1" />
            <Circle cx="15" cy="14" r="0.45" fill={palette.noise} fillOpacity="0.12" />
          </Pattern>
        </Defs>

        <Rect width="100%" height="100%" fill={`url(#${glowId})`} />
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
        <Rect width="100%" height="100%" fill={`url(#${noiseId})`} />
      </Svg>
    </View>
  );
}

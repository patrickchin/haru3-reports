import { View, Text } from "react-native";
import Svg, { Rect, Line } from "react-native-svg";
import { cn } from "@/lib/utils";
import { colors } from "@/lib/design-tokens/colors";

export interface BarDatum {
  label: string;
  value: number;
}

interface UsageBarChartProps {
  data: BarDatum[];
  /** Formatted string shown below the chart title */
  unit?: string;
  className?: string;
}

const CHART_HEIGHT = 120;
const BAR_RADIUS = 4;
const BAR_COLOR = colors.chart.fill;
const BAR_COLOR_LIGHT = colors.chart.track;
const GRID_COLOR = colors.chart.grid;

export function UsageBarChart({ data, unit, className }: UsageBarChartProps) {
  if (!data.length) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  // We want to show at most 6 months to keep labels readable
  const visible = data.slice(0, 6).reverse();
  const barCount = visible.length;
  const barGap = 8;
  const barWidth = Math.max(16, Math.min(36, (280 - barGap * (barCount - 1)) / barCount));
  const chartWidth = barCount * barWidth + (barCount - 1) * barGap;

  return (
    <View className={cn("items-center", className)}>
      <View style={{ width: chartWidth, height: CHART_HEIGHT }}>
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => (
            <Line
              key={frac}
              x1={0}
              y1={CHART_HEIGHT * (1 - frac)}
              x2={chartWidth}
              y2={CHART_HEIGHT * (1 - frac)}
              stroke={GRID_COLOR}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

          {/* Bars */}
          {visible.map((d, i) => {
            const barHeight = Math.max(2, (d.value / maxValue) * (CHART_HEIGHT - 4));
            const x = i * (barWidth + barGap);
            const y = CHART_HEIGHT - barHeight;

            return (
              <Rect
                key={d.label}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill={d.value > 0 ? BAR_COLOR : BAR_COLOR_LIGHT}
              />
            );
          })}
        </Svg>
      </View>

      {/* Labels row */}
      <View
        style={{
          width: chartWidth,
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        {visible.map((d, i) => (
          <Text
            key={d.label}
            style={{ width: barWidth, textAlign: "center" }}
            className="text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </View>

      {unit ? (
        <Text className="mt-1 text-xs text-muted-foreground">{unit}</Text>
      ) : null}
    </View>
  );
}

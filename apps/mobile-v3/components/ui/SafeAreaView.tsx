import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface SafeAreaViewProps {
  children: React.ReactNode;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  style?: ViewStyle;
}

/**
 * JS-context-aware SafeAreaView that reads insets via useSafeAreaInsets
 * and applies them as padding. Avoids the native SafeAreaView quirks
 * (Android no-op, iOS frame-delay flicker).
 */
export function SafeAreaView({ children, edges = ['top', 'bottom'], style }: SafeAreaViewProps) {
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingTop: edges.includes('top') ? insets.top : undefined,
    paddingBottom: edges.includes('bottom') ? insets.bottom : undefined,
    paddingLeft: edges.includes('left') ? insets.left : undefined,
    paddingRight: edges.includes('right') ? insets.right : undefined,
  };

  return <View style={[{ flex: 1 }, padding, style]}>{children}</View>;
}

import React, { useState } from 'react';
import { Image, View, type ImageResizeMode, type StyleProp, type ImageStyle } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

import { Skeleton } from './Skeleton';

export interface CachedImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  fallbackIcon?: React.ReactNode;
  resizeMode?: ImageResizeMode;
}

export function CachedImage({
  uri,
  style,
  fallbackIcon,
  resizeMode = 'cover',
}: CachedImageProps) {
  const { styles, theme } = useStyles(stylesheet);
  const [loading, setLoading] = useState(!!uri);
  const [error, setError] = useState(false);

  const showFallback = !uri || error;

  if (showFallback) {
    return (
      <View style={[styles.fallback, style]}>
        {fallbackIcon ?? <ImageOff size={24} color={theme.colors.mutedForeground} />}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {loading && (
        <Skeleton
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 0,
          }}
          width="100%"
          height={undefined as unknown as number}
        />
      )}
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode={resizeMode}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    backgroundColor: theme.colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

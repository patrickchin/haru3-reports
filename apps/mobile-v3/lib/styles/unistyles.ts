import { UnistylesRegistry } from 'react-native-unistyles';
import { colors, darkColors, spacing, radii, typography } from './tokens';

const lightTheme = { colors, spacing, radii, typography };
const darkTheme = { colors: darkColors, spacing, radii, typography };

type AppThemes = { light: typeof lightTheme; dark: typeof darkTheme };

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

UnistylesRegistry
  .addThemes({ light: lightTheme, dark: darkTheme })
  .addConfig({ adaptiveThemes: true });

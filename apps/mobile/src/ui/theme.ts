import { useColorScheme } from 'react-native';

export interface Theme {
  readonly background: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  /** Turf green: progress and primary actions. */
  readonly primary: string;
  readonly onPrimary: string;
  /** Gold: mastery. */
  readonly accent: string;
  readonly warning: string;
  readonly warningSurface: string;
}

const light: Theme = {
  background: '#F4F6F3',
  surface: '#FFFFFF',
  surfaceMuted: '#E8ECE6',
  border: '#D5DBD2',
  text: '#13201A',
  textMuted: '#55635B',
  primary: '#1E6B3A',
  onPrimary: '#FFFFFF',
  accent: '#A8780B',
  warning: '#7A4B00',
  warningSurface: '#FFF2D6',
};

const dark: Theme = {
  background: '#0E1512',
  surface: '#17211C',
  surfaceMuted: '#202D26',
  border: '#2E3D35',
  text: '#EEF3EF',
  textMuted: '#A3B2A9',
  primary: '#4CC27A',
  onPrimary: '#06210F',
  accent: '#E8B640',
  warning: '#FFD089',
  warningSurface: '#3A2C10',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

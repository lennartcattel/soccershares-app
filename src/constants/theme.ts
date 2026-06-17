export const theme = {
  colors: {
    primary: '#4a7c3f',      // SoccerShares olive green
    primaryDark: '#3d6834',  // darker for pressed state
    primaryLight: '#e8f0e6', // light green tint
    background: '#f3f4f6',   // light grey background
    surface: '#ffffff',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#d1d5db',
    gain: '#16a34a',         // bright green for positive %
    loss: '#dc2626',         // red for negative %
    closed: '#ef4444',       // market closed red
    error: '#dc2626',
  },
  font: {
    regular: '400' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
}
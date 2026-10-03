import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { radius, space, useTheme } from './theme';

type ButtonTone = 'primary' | 'secondary' | 'right' | 'wrong';

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly tone?: ButtonTone;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled,
  selected,
  accessibilityLabel,
}: ButtonProps) {
  const t = useTheme();
  const palette: Record<ButtonTone, { bg: string; fg: string; border: string }> = {
    primary: { bg: t.primary, fg: t.onPrimary, border: t.primary },
    secondary: {
      bg: selected ? t.surfaceMuted : t.surface,
      fg: t.text,
      border: selected ? t.primary : t.border,
    },
    right: { bg: t.primary, fg: t.onPrimary, border: t.primary },
    wrong: { bg: t.warningSurface, fg: t.warning, border: t.warning },
  };
  const c = palette[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          // Answer highlights (right/wrong) stay fully visible after the question locks.
          opacity: disabled && tone !== 'right' && tone !== 'wrong' ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, { color: c.fg }]}>{label}</Text>
    </Pressable>
  );
}

interface FieldProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSubmit: () => void;
  readonly label: string;
  readonly editable?: boolean;
  readonly placeholder?: string;
  readonly keyboardType?: 'default' | 'email-address' | 'number-pad';
  readonly autoFocus?: boolean;
}

export function Field({
  value,
  onChangeText,
  onSubmit,
  label,
  editable = true,
  placeholder = 'Type your answer',
  keyboardType = 'default',
  autoFocus = true,
}: FieldProps) {
  const t = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={placeholder}
      keyboardType={keyboardType}
      placeholderTextColor={t.textMuted}
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmit}
      editable={editable}
      autoCapitalize="none"
      autoCorrect={false}
      autoFocus={autoFocus}
      returnKeyType="done"
      style={[styles.field, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  field: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    fontSize: 17,
  },
});

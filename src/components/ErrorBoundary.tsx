import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui';
import { text } from '@/theme/typography';
import { palette } from '@/theme/tokens';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a bad frame in the duel HUD shows a recovery
 * screen instead of a white screen of death mid-workout.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Replace with a crash reporter (Sentry, Bugsnag) before shipping.
    console.error('[RepChamp] Unhandled error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>😵‍💫</Text>
        <Text style={[text.h2, styles.title]}>Something went wrong</Text>
        <Text style={[text.body, styles.message]}>
          Your progress is saved. Try again — if it keeps happening, restart the app.
        </Text>
        {__DEV__ ? <Text style={styles.debug}>{error.message}</Text> : null}
        <PrimaryButton label="Try again" onPress={this.reset} style={styles.button} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: palette.canvas,
  },
  emoji: { fontSize: 64, marginBottom: 12 },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', marginTop: 8 },
  debug: {
    ...text.caption,
    color: palette.red500,
    marginTop: 16,
    textAlign: 'center',
  },
  button: { marginTop: 28 },
});

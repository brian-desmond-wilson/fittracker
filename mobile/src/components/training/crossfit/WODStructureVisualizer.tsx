import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/lib/colors';
import type { WODWithDetails } from '@/src/types/crossfit';
import { parseRepSchemeVisual } from '@/src/lib/wodDetailHelpers';

interface WODStructureVisualizerProps {
  wod: WODWithDetails;
}

export function WODStructureVisualizer({ wod }: WODStructureVisualizerProps) {
  const repSchemeVisual = parseRepSchemeVisual(wod);

  if (!repSchemeVisual) {
    return null;
  }

  const renderDescendingAscending = () => {
    const { values, type } = repSchemeVisual;

    // Calculate dynamic width and font size based on number of values
    const boxCount = values.length;
    const flexValue = 1 / boxCount;

    // Scale font size based on number of boxes
    // More boxes = smaller font to fit better
    const fontSize = boxCount > 6 ? 16 : 18;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Rep Scheme</Text>

        {/* Rep number display with dashes */}
        <View style={styles.repSchemeContainer}>
          <View style={styles.repNumbersRow}>
            {values.map((value, index) => (
              <React.Fragment key={index}>
                <View style={[styles.repNumberBox, { flex: flexValue }]}>
                  <Text style={[styles.repNumber, { fontSize }]} numberOfLines={1} adjustsFontSizeToFit>
                    {value}
                  </Text>
                </View>
                {index < values.length - 1 && (
                  <View style={styles.dashContainer}>
                    <Text style={styles.dash}>—</Text>
                  </View>
                )}
              </React.Fragment>
            ))}
          </View>
        </View>

        <Text style={styles.description}>
          {type === 'descending' ? 'Decreasing reps each round' : 'Increasing reps each round'}
        </Text>
      </View>
    );
  };

  const renderFixedRounds = () => {
    const { values } = repSchemeVisual;
    const roundCount = values.length;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{roundCount} Rounds For Time</Text>

        <View style={styles.roundsContainer}>
          {values.map((round) => (
            <View key={round} style={styles.roundBox}>
              <Text style={styles.roundNumber}>{round}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.description}>
          Complete {roundCount} rounds of the movements below
        </Text>
      </View>
    );
  };

  const renderAMRAP = () => {
    const timeCap = wod.time_cap_minutes || 20;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{timeCap} min AMRAP</Text>

        {/* Time bar visualization */}
        <View style={styles.timeBarContainer}>
          <View style={styles.timeBar}>
            <View style={[styles.timeBarFill, { width: '100%' }]} />
          </View>
          <Text style={styles.timeLabel}>{timeCap}:00</Text>
        </View>

        <Text style={styles.description}>
          Complete as many rounds as possible in {timeCap} minutes
        </Text>
      </View>
    );
  };

  const renderChipper = () => {
    const { values } = repSchemeVisual;
    const movementCount = values.length;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Chipper</Text>

        {/* Flow diagram */}
        <View style={styles.chipperFlow}>
          {values.map((step, index) => (
            <React.Fragment key={step}>
              <View style={styles.chipperStep}>
                <Text style={styles.chipperStepNumber}>{step}</Text>
              </View>
              {index < values.length - 1 && (
                <Text style={styles.chipperArrow}>→</Text>
              )}
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.description}>
          Complete all {movementCount} movements once, in order
        </Text>
      </View>
    );
  };

  const renderCustom = () => {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Workout Structure</Text>
        <Text style={styles.customScheme}>{repSchemeVisual.description}</Text>
      </View>
    );
  };

  // Render based on type
  switch (repSchemeVisual.type) {
    case 'descending':
    case 'ascending':
      return renderDescendingAscending();

    case 'fixed_rounds':
      return renderFixedRounds();

    case 'amrap':
      return renderAMRAP();

    case 'chipper':
      return renderChipper();

    case 'custom':
      return renderCustom();

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D3748',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 12,
    lineHeight: 20,
  },

  // Descending/Ascending styles
  repSchemeContainer: {
    alignItems: 'center',
  },
  repNumbersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  repNumberBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dashContainer: {
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dash: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.mutedForeground,
  },
  connectionLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  line: {
    width: 16,
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.5,
  },

  // Fixed Rounds styles
  roundsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  roundBox: {
    width: 56,
    height: 56,
    backgroundColor: '#2D3748',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },

  // AMRAP styles
  timeBarContainer: {
    alignItems: 'center',
  },
  timeBar: {
    width: '100%',
    height: 12,
    backgroundColor: '#2D3748',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  timeBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  timeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },

  // Chipper styles
  chipperFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipperStep: {
    width: 40,
    height: 40,
    backgroundColor: '#2D3748',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipperStepNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  chipperArrow: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: 'bold',
  },

  // Custom styles
  customScheme: {
    fontSize: 16,
    color: colors.foreground,
    lineHeight: 24,
  },
});

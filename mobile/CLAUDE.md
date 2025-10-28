# Claude Development Notes

This document contains important patterns, conventions, and lessons learned during the development of the FitTracker mobile app.

## Table of Contents
- [Safe Area Handling](#safe-area-handling)
- [Modal Navigation Pattern](#modal-navigation-pattern)
- [Nested Stack Navigation in Tabs](#nested-stack-navigation-in-tabs)

---

## Safe Area Handling

### The Problem
When using `presentationStyle="fullScreen"` with React Native modals on iOS, the standard `SafeAreaView` component does not properly handle safe areas. Content can appear underneath the iPhone notch/status bar, making navigation elements inaccessible.

### The Solution: useSafeAreaInsets()

**ALWAYS use the `useSafeAreaInsets()` hook instead of `SafeAreaView` for full-screen modal pages.**

### Correct Implementation Pattern

```tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

interface MyScreenProps {
  onClose: () => void;
}

export function MyScreen({ onClose }: MyScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <>
      {/* Always include StatusBar */}
      <StatusBar barStyle="light-content" />

      {/* Apply paddingTop from insets to main container */}
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* Navigation Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable Content */}
        <ScrollView style={styles.content}>
          <Text style={styles.pageTitle}>My Page</Text>
          {/* Your content here */}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1E',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
});
```

### Key Requirements

1. **Import the hook**:
   ```tsx
   import { useSafeAreaInsets } from 'react-native-safe-area-context';
   ```

2. **Call the hook at component top**:
   ```tsx
   const insets = useSafeAreaInsets();
   ```

3. **Wrap with Fragment and StatusBar**:
   ```tsx
   return (
     <>
       <StatusBar barStyle="light-content" />
       <View style={[styles.container, { paddingTop: insets.top }]}>
   ```

4. **Apply paddingTop inline**:
   - Use inline style `{ paddingTop: insets.top }` on the main container
   - This ensures the content starts below the status bar/notch

5. **Add proper onClose prop**:
   - Every full-screen modal page should accept an `onClose` prop
   - Use this for the back button's `onPress` handler

### What NOT to Do

❌ **DON'T use SafeAreaView with fullScreen modals**:
```tsx
// This DOES NOT WORK with presentationStyle="fullScreen"
<SafeAreaView style={styles.container}>
  <View style={styles.header}>
    {/* Content gets cut off by notch */}
  </View>
</SafeAreaView>
```

❌ **DON'T nest SafeAreaView inside the modal**:
```tsx
// This DOES NOT WORK
<Modal presentationStyle="fullScreen">
  <SafeAreaView edges={['top']}>
    {/* Still doesn't work */}
  </SafeAreaView>
</Modal>
```

❌ **DON'T use statusBarTranslucent** (it's Android-only):
```tsx
// This property doesn't work on iOS
<Modal statusBarTranslucent={false}>
```

### Why This Works

The `useSafeAreaInsets()` hook provides the actual measurements of the safe area insets in pixels:
- `insets.top`: Distance from top of screen to safe area (handles notch)
- `insets.bottom`: Distance from safe area to bottom (handles home indicator)
- `insets.left`: Left edge safe area
- `insets.right`: Right edge safe area

By applying `paddingTop: insets.top` as an inline style, we push the content down exactly enough to clear the notch/status bar, regardless of device model.

---

## Modal Navigation Pattern

### Full-Screen Modal Setup

When creating modal screens that slide in from the bottom (like Profile sub-pages), use this pattern:

```tsx
<Modal
  visible={activeModal === "my-screen"}
  animationType="slide"
  presentationStyle="fullScreen"
  statusBarTranslucent={false}
  onRequestClose={() => setActiveModal(null)}
>
  <MyScreen onClose={() => setActiveModal(null)} />
</Modal>
```

### Key Properties

- **`presentationStyle="fullScreen"`**: Makes modal cover entire screen including status bar area
- **`animationType="slide"`**: Slides modal up from bottom (iOS style)
- **`statusBarTranslucent={false}`**: For Android compatibility (no effect on iOS)
- **`onRequestClose`**: Required for Android back button support

---

## Examples in Codebase

### Working Examples
All Profile sub-pages use this pattern correctly:
- `/src/components/profile/ProfileScreen.tsx`
- `/src/components/profile/GoalsScreen.tsx`
- `/src/components/profile/RoutinesScreen.tsx`
- `/src/components/profile/PreferencesScreen.tsx`
- `/src/components/profile/NotificationsScreen.tsx`
- `/src/components/profile/PrivacySecurityScreen.tsx`
- `/src/components/profile/HelpSupportScreen.tsx`
- `/src/components/profile/AboutScreen.tsx`
- `/src/components/profile/DevTaskManager.tsx`

### Modal Container
See `/app/(tabs)/profile.tsx` for how modals are set up and managed.

---

## Troubleshooting

### Issue: Content still appears under notch
**Solution**: Verify you're applying `{ paddingTop: insets.top }` as an **inline style**, not in the StyleSheet. The inline style is required because the value is dynamic.

### Issue: SafeAreaView isn't working
**Solution**: Don't use SafeAreaView with `presentationStyle="fullScreen"`. Use `useSafeAreaInsets()` hook instead.

### Issue: Different behavior on simulator vs device
**Solution**: Always test on a real device or use a simulator with a notch (iPhone 12+). The iPhone SE simulator has no notch and won't reveal the issue.

---

---

## Nested Stack Navigation in Tabs

### The Pattern

When you need sub-pages within a tab that keep the bottom tab bar visible, use a nested Stack navigator within the tab.

### Implementation

**Directory Structure:**
```
app/
  (tabs)/
    training/
      _layout.tsx          # Stack navigator for training
      index.tsx            # Main training page
      program/
        [id].tsx           # Program detail page
```

**1. Create Stack Layout (_layout.tsx):**
```tsx
import { Stack } from "expo-router";

export default function TrainingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="program/[id]" />
    </Stack>
  );
}
```

**2. Navigate with Full Path:**
```tsx
// In ProgramsTab.tsx (component rendered by index.tsx)
router.push(`/(tabs)/training/program/${program.id}`)
```

**3. Back Navigation:**
```tsx
// In program/[id].tsx
router.back()  // Returns to training index
```

### Key Benefits

- Bottom tab bar remains visible on all screens
- Native back gesture support
- Clean navigation stack management
- Consistent with mobile app patterns

### Working Example

The Training tab uses this pattern:
- `/app/(tabs)/training/_layout.tsx` - Stack configuration
- `/app/(tabs)/training/index.tsx` - Main training page with Programs/Workouts/Exercises tabs
- `/app/(tabs)/training/program/[id].tsx` - Program detail page (keeps bottom tabs visible)

---

---

## Git Commit Policy

**CRITICAL: Only commit when explicitly asked by the user.**

- **DO NOT** automatically commit after making changes
- **DO NOT** proactively suggest committing
- **WAIT** for the user to tell you when to commit
- The user will explicitly say "commit" or "commit these changes" when ready

This allows the user to:
- Test changes before committing
- Make additional tweaks
- Review all changes together
- Control commit timing and messages

---

## Version History

- **2025-10-27**: Added git commit policy
  - User controls all commits
  - No automatic or proactive commits
  - Wait for explicit user instruction

- **2025-10-17**: Added nested stack navigation pattern
  - Documented nested stack navigation within tabs
  - Explained how to keep bottom tab bar visible on sub-pages
  - Added Training tab as working example

- **2025-10-15**: Initial documentation
  - Documented safe area handling pattern with `useSafeAreaInsets()`
  - Added modal navigation pattern
  - Included working examples from Profile pages

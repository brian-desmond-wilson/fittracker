/**
 * Gemini AI Helper Functions
 *
 * Utilities for building intelligent prompts for WOD image generation
 */

import type { WODFormData, WODMovementConfig } from '../components/training/crossfit/AddWODWizard';
import type { CreateWODMovementInput } from '../types/crossfit';

export interface WODImagePromptData {
  wodName: string;
  formatName: string;
  movements: Array<{
    name: string;
    category?: string;
  }>;
  timeCap?: number;
  repScheme?: string;
}

/**
 * Build a Gemini-optimized prompt for WOD image generation
 */
export function buildWODImagePrompt(data: WODImagePromptData): string {
  const { wodName, formatName, movements, timeCap, repScheme } = data;

  // Extract movement names and categories
  const movementDescriptions = movements.map(m => {
    if (m.category) {
      return `${m.name} (${m.category})`;
    }
    return m.name;
  }).join(', ');

  // Build format description
  let formatDescription = formatName;
  if (timeCap) {
    formatDescription += ` (${timeCap} min)`;
  }
  if (repScheme) {
    formatDescription += ` with rep scheme ${repScheme}`;
  }

  // Determine visual style based on WOD type
  const style = getVisualStyle(formatName, movements.length);

  // Build the prompt
  const prompt = `Create a vibrant, high-energy CrossFit workout image for a WOD called "${wodName}".

Workout Details:
- Format: ${formatDescription}
- Movements: ${movementDescriptions}

Visual Style: ${style}

Requirements:
- Athletic and motivational atmosphere
- Dynamic composition showing movement and energy
- Rich, saturated colors (focus on blues, oranges, and grays)
- Professional fitness photography aesthetic
- DO NOT include any text, numbers, labels, or words in the image
- Focus on equipment and athletic action related to the movements
- High contrast and dramatic lighting
- Suitable for use as a workout card thumbnail

The image should inspire athletes to tackle this challenging workout.`;

  return prompt;
}

/**
 * Determine the visual style based on WOD characteristics
 */
function getVisualStyle(formatName: string, movementCount: number): string {
  // AMRAP - endurance and stamina
  if (formatName === 'AMRAP') {
    return 'Endurance-focused with athletes pushing limits, showing determination and grit';
  }

  // For Time - speed and intensity
  if (formatName === 'For Time') {
    return 'Fast-paced and explosive, showing speed and intensity';
  }

  // EMOM - precision and control
  if (formatName === 'EMOM') {
    return 'Precise and controlled movements, showing technical proficiency';
  }

  // Chipper - variety and complexity
  if (formatName === 'Chipper' || movementCount > 5) {
    return 'Diverse equipment and movements, showing variety and complexity';
  }

  // Default - general CrossFit energy
  return 'High-intensity CrossFit training with powerful movements and determination';
}

/**
 * Extract movement data from WOD form data
 */
export function extractMovementData(movements: WODMovementConfig[] | CreateWODMovementInput[]): Array<{ name: string; category?: string }> {
  return movements.map(m => {
    // Handle WODMovementConfig (from wizard)
    if ('exercise_name' in m) {
      return {
        name: m.exercise_name,
        category: m.equipment_types?.[0],
      };
    }
    // Handle CreateWODMovementInput (from API)
    // We don't have exercise name here, will need to fetch or use generic
    return {
      name: 'Movement', // Placeholder - could fetch exercise name if needed
    };
  });
}

/**
 * Build prompt data from WOD wizard form
 */
export function buildPromptDataFromForm(
  formData: WODFormData,
  formatName?: string
): WODImagePromptData {
  return {
    wodName: formData.name,
    formatName: formatName || 'For Time',
    movements: extractMovementData(formData.movements),
    timeCap: formData.time_cap_minutes,
    repScheme: formData.rep_scheme,
  };
}

/**
 * Generate a default placeholder image URL
 * This can be replaced with an actual asset later
 */
export function getPlaceholderImageUrl(): string {
  // For now, return a data URL with a simple gradient
  // In production, this should be an actual asset
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6cmdiKDEwLDEzMiwxODApO3N0b3Atb3BhY2l0eToxIiAvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3R5bGU9InN0b3AtY29sb3I6cmdiKDMsNzQsMTIwKTtzdG9wLW9wYWNpdHk6MSIgLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiBmaWxsPSJ1cmwoI2cpIiAvPjwvc3ZnPg==';
}

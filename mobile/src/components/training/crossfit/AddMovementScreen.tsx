import React from 'react';
import { AddMovementWizard } from './AddMovementWizard';

interface AddMovementScreenProps {
  onClose: () => void;
  onSave: () => void;
}

/**
 * AddMovementScreen - Entry point for creating a new movement
 * Now uses the multi-step wizard for a better user experience
 */
export function AddMovementScreen({ onClose, onSave }: AddMovementScreenProps) {
  return <AddMovementWizard onClose={onClose} onSave={onSave} />;
}

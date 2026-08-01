import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { X, Zap, ZapOff } from "lucide-react-native";
import { colors, icons, spacing, tint, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onBarcodeScanned,
}: BarcodeScannerModalProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    // Reset scanned state when modal opens
    if (visible) {
      setScanned(false);
      setTorchEnabled(false);

      // Request permission if not granted
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible]);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;

    setScanned(true);
    onBarcodeScanned(data);
    onClose();
  };

  const toggleTorch = () => {
    setTorchEnabled(!torchEnabled);
  };

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <StatusBar barStyle="light-content" />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.loadingText}>Loading camera...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <StatusBar barStyle="light-content" />
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={icons.lg} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.permissionDeniedContainer}>
            <Text style={styles.permissionDeniedText}>
              Camera permission is required to scan barcodes
            </Text>
            <Text style={styles.permissionDeniedSubtext}>
              Please enable camera access in your device settings
            </Text>
            <Button label="Grant Permission" onPress={requestPermission} />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {/* Header with close button */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={icons.lg} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Barcode</Text>
          <TouchableOpacity onPress={toggleTorch} style={styles.torchButton}>
            {torchEnabled ? (
              <Zap size={icons.lg} color={colors.brand} />
            ) : (
              <ZapOff size={icons.lg} color={colors.text} />
            )}
          </TouchableOpacity>
        </View>

        {/* Camera View */}
        <CameraView
          style={styles.camera}
          facing="back"
          enableTorch={torchEnabled}
          barcodeScannerSettings={{
            barcodeTypes: [
              "upc_a",
              "upc_e",
              "ean13",
              "ean8",
              "code128",
              "code39",
              "code93",
              "itf14",
            ] as any,
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          {/* Scan overlay */}
          <View style={styles.overlay}>
            {/* Top dark overlay */}
            <View style={styles.overlayTop} />

            {/* Middle row with scan area */}
            <View style={styles.overlayMiddle}>
              <View style={styles.overlaySide} />
              <View style={styles.scanArea}>
                {/* Corner markers */}
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <View style={styles.overlaySide} />
            </View>

            {/* Bottom dark overlay with instructions */}
            <View style={styles.overlayBottom}>
              <Text style={styles.instructionText}>
                Position barcode within the frame
              </Text>
              <Text style={styles.instructionSubtext}>
                Supports UPC, EAN, Code 128, and more
              </Text>
            </View>
          </View>
        </CameraView>
      </View>
    </Modal>
  );
}

// Camera chrome only — nothing here touches the scanner or the permission
// flow. The viewfinder masks keep their own alphas rather than collapsing onto
// `colors.scrim` (0.5): their darkness is functional, not decorative — it is
// what keeps white chrome legible over an arbitrarily bright live image — so
// they are expressed as `tint()` over `colors.bg` instead of raw black.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter,
    paddingBottom: spacing.md,
    backgroundColor: tint(colors.bg, 0.8),
    zIndex: 1,
  },
  headerTitle: {
    ...typography.titleBar,
    color: colors.text,
  },
  closeButton: {
    padding: spacing.xs,
  },
  torchButton: {
    padding: spacing.xs,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: tint(colors.bg, 0.6),
  },
  overlayMiddle: {
    flexDirection: "row",
    height: 200,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: tint(colors.bg, 0.6),
  },
  scanArea: {
    width: 280,
    height: 200,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: colors.brand,
    borderWidth: 3,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: tint(colors.bg, 0.6),
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  instructionText: {
    ...typography.rowTitle,
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  instructionSubtext: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...typography.rowTitle,
    fontWeight: "400",
    color: colors.text,
    marginTop: spacing.lg,
  },
  permissionDeniedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxxl,
  },
  permissionDeniedText: {
    ...typography.rowTitle,
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  permissionDeniedSubtext: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.xxl,
  },
});

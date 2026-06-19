import { useWindowDimensions } from "react-native";

/** Shared scale factors for SVGs and icons across screen sizes. */
export function useDeviceScale() {
  const { width, height } = useWindowDimensions();
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const isLandscape = width > height;
  const isCompact = longSide < 900 || shortSide < 500;
  const isTight = shortSide < 420;
  const scale = Math.min(1, Math.max(0.55, shortSide / 520));

  const icon = (base: number, min = 10) =>
    Math.max(min, Math.round(base * scale));

  const svg = (base: number, min = 40) =>
    Math.max(min, Math.round(base * scale));

  const tabWidth = width / 7;
  const navIconSize = Math.round(
    Math.min(24, Math.max(14, tabWidth * 0.2, shortSide / 24)),
  );
  const navBarHeight = Math.round(Math.min(64, Math.max(48, shortSide * 0.13)));
  const navShowLabels = tabWidth >= 44;

  return {
    width,
    height,
    shortSide,
    longSide,
    scale,
    isCompact,
    isLandscape,
    isTight,
    icon,
    svg,
    navIconSize,
    navBarHeight,
    navShowLabels,
  };
}

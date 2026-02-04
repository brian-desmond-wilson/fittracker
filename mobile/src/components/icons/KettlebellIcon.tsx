import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface KettlebellIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function KettlebellIcon({ size = 24, color = '#000000', strokeWidth = 2 }: KettlebellIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Single path for the entire kettlebell shape */}
      <Path
        d="M9 2C8.44772 2 8 2.44772 8 3V4.17157C6.83481 4.58254 6 5.69378 6 7V8H5C4.44772 8 4 8.44772 4 9V10C4 10.5523 4.44772 11 5 11H6C6 11 5.5 11.5 5 12.5C4.5 13.5 4 15 4 17C4 20.3137 6.68629 23 10 23H14C17.3137 23 20 20.3137 20 17C20 15 19.5 13.5 19 12.5C18.5 11.5 18 11 18 11H19C19.5523 11 20 10.5523 20 10V9C20 8.44772 19.5523 8 19 8H18V7C18 5.69378 17.1652 4.58254 16 4.17157V3C16 2.44772 15.5523 2 15 2H9Z"
        fill={color}
      />
      {/* White horizontal line through handle */}
      <Path
        d="M4 9H20V10H4V9Z"
        fill="white"
        opacity="0.2"
      />
    </Svg>
  );
}

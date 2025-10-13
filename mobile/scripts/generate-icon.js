const fs = require('fs');

// SVG for dumbbell icon (from lucide-react-native)
const svg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0A0F1E"/>
  <g transform="translate(262, 262) scale(12.5)">
    <path d="M14.4 14.4 9.6 9.6" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m21.5 21.5-1.4-1.4" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3.9 3.9 2.5 2.5" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`.trim();

fs.writeFileSync('/Users/brianwilson/code/fittracker/mobile/assets/icon.svg', svg);
console.log('SVG icon created at assets/icon.svg');
console.log('Now converting to PNG...');

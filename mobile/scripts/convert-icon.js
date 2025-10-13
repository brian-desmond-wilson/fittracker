const sharp = require('sharp');
const fs = require('fs');

const svgBuffer = Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0A0F1E"/>
  <g transform="translate(262, 262)">
    <path d="M 180 180 L 120 120" stroke="#22C55E" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 233.213 268.856 a 25 25 0 1 1 -35.365 -35.365 l -22.094 22.125 a 25 25 0 1 1 -35.365 -35.365 l 79.55 -79.55 a 25 25 0 1 1 35.365 35.365 l -22.125 22.094 a 25 25 0 1 1 35.365 35.365 z" stroke="#22C55E" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 268.75 268.75 l -17.5 -17.5" stroke="#22C55E" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 48.75 48.75 L 31.25 31.25" stroke="#22C55E" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 80.05 159.6 a 25 25 0 1 1 -35.365 -35.365 l 22.125 -22.094 a 25 25 0 1 1 -35.365 -35.365 l 35.365 -35.365 a 25 25 0 1 1 35.365 35.365 l 22.094 -22.125 a 25 25 0 1 1 35.365 35.365 z" stroke="#22C55E" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`);

sharp(svgBuffer)
  .resize(1024, 1024)
  .png()
  .toFile('/Users/brianwilson/code/fittracker/mobile/assets/icon.png')
  .then(() => {
    console.log('✓ Icon created at assets/icon.png (1024x1024)');

    // Also create adaptive icon for Android
    return sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile('/Users/brianwilson/code/fittracker/mobile/assets/adaptive-icon.png');
  })
  .then(() => {
    console.log('✓ Adaptive icon created at assets/adaptive-icon.png (1024x1024)');

    // Create splash icon
    return sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile('/Users/brianwilson/code/fittracker/mobile/assets/splash-icon.png');
  })
  .then(() => {
    console.log('✓ Splash icon created at assets/splash-icon.png (1024x1024)');

    // Create favicon
    return sharp(svgBuffer)
      .resize(48, 48)
      .png()
      .toFile('/Users/brianwilson/code/fittracker/mobile/assets/favicon.png');
  })
  .then(() => {
    console.log('✓ Favicon created at assets/favicon.png (48x48)');
    console.log('\n✓ All icons generated successfully!');

    // Clean up SVG
    if (fs.existsSync('/Users/brianwilson/code/fittracker/mobile/assets/icon.svg')) {
      fs.unlinkSync('/Users/brianwilson/code/fittracker/mobile/assets/icon.svg');
    }
  })
  .catch(err => {
    console.error('Error generating icons:', err);
    process.exit(1);
  });

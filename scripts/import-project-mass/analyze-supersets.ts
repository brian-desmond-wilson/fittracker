import { SPREADSHEET_ID, SHEET_CONFIGS } from './src/config.js';

async function fetchSheetCSV(gid: number): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Failed: ${response.status}`);
  return response.text();
}

async function analyzeSheet(gid: number, dayName: string) {
  const csv = await fetchSheetCSV(gid);
  const lines = csv.split('\n');
  
  // Row 3 (index 2) has exercise names
  // Row 4 (index 3) has "Set 1", "Set 2", etc.
  const exerciseRow = lines[2]?.split(',') || [];
  const headerRow = lines[3]?.split(',') || [];
  
  console.log(`\n=== ${dayName} (gid: ${gid}) ===`);
  console.log('Exercise headers (row 3):');
  
  // Find exercise names (non-empty cells in row 3, after the first 3 columns)
  const exercises: string[] = [];
  for (let i = 3; i < exerciseRow.length; i++) {
    const name = exerciseRow[i]?.replace(/"/g, '').trim();
    if (name && name.length > 0 && !name.toLowerCase().includes('set') && name !== 'Notes') {
      exercises.push(name);
    }
  }
  
  console.log('Exercises found:');
  exercises.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  
  // Look for superset indicators in the raw headers
  console.log('\nRaw row 3 (looking for superset indicators):');
  const rawRow3 = lines[2] || '';
  if (rawRow3.toLowerCase().includes('super') || rawRow3.includes('SS') || rawRow3.includes('s/s')) {
    console.log('  FOUND superset indicator!');
    console.log('  ', rawRow3.substring(0, 500));
  } else {
    console.log('  No obvious superset indicator in headers');
  }
  
  // Check row 1 and 2 for any grouping info
  console.log('\nRow 1:', lines[0]?.substring(0, 300));
  console.log('Row 2:', lines[1]?.substring(0, 300));
}

async function main() {
  for (const config of SHEET_CONFIGS) {
    await analyzeSheet(config.gid, config.focus);
  }
}

main().catch(console.error);

import { SPREADSHEET_ID, SHEET_CONFIGS } from './src/config.js';

async function fetchSheetCSV(gid: number): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { redirect: 'follow' });
  return response.text();
}

async function main() {
  for (const config of SHEET_CONFIGS) {
    const csv = await fetchSheetCSV(config.gid);
    const lines = csv.split('\n');
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${config.focus} (Day ${config.dayNumber})`);
    console.log('='.repeat(60));
    
    // Print first 5 rows to see structure
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      console.log(`Row ${i + 1}: ${lines[i]?.substring(0, 200)}`);
    }
    
    // Search entire sheet for superset keywords
    const fullText = csv.toLowerCase();
    const keywords = ['superset', 'super set', 's/s', 'ss:', 'paired', 'alternate'];
    for (const kw of keywords) {
      if (fullText.includes(kw)) {
        console.log(`\n⚠️ Found "${kw}" in sheet!`);
        // Find the line
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(kw)) {
            console.log(`  Line ${idx + 1}: ${line.substring(0, 150)}`);
          }
        });
      }
    }
  }
}

main().catch(console.error);

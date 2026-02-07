import { fetchSheetCSV } from './parse-csv.js';
import { SHEET_CONFIGS } from './config.js';
async function main() {
    const day1Config = SHEET_CONFIGS.find(s => s.dayNumber === 1);
    const csv = await fetchSheetCSV(day1Config.gid);
    const lines = csv.split('\n');
    // Show header rows (rows 0-3) to understand layout
    for (let i = 0; i < 4; i++) {
        const cols = lines[i].split(',');
        console.log(`Row ${i}: ${cols.slice(0, 15).map((c, j) => `[${j}]="${c.trim()}"`).join(' ')}`);
    }
}
main().catch(console.error);
//# sourceMappingURL=debug-layout.js.map
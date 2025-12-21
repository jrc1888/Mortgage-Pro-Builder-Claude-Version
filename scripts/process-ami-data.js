/**
 * AMI Data Processing Script
 * 
 * This script processes HUD Income Limits CSV and ZIP Code Crosswalk files
 * to create a comprehensive JSON file with AMI limits for all zip codes.
 * 
 * Usage:
 * 1. Download HUD Income Limits CSV from: https://www.huduser.gov/portal/datasets/il.html
 * 2. Download ZIP Code Crosswalk from: https://www.huduser.gov/portal/datasets/usps_crosswalk.html
 * 3. Run: node scripts/process-ami-data.js
 */

const fs = require('fs');
const path = require('path');

// Configuration - Update these paths to match your downloaded files
const CONFIG = {
  // Path to HUD Income Limits CSV file (download from HUD website)
  incomeLimitsCsv: './data/hud-income-limits.csv',
  
  // Path to ZIP Code Crosswalk CSV file (download from HUD website)
  zipCodeCrosswalk: './data/zip-code-crosswalk.csv',
  
  // Output file path
  outputJson: './public/data/ami-limits.json',
  
  // Effective date (usually April 1 of the current year)
  effectiveDate: '2024-04-01'
};

/**
 * Parse CSV file into array of objects
 */
function parseCSV(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Parse rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }
    
    return data;
  } catch (error) {
    console.error(`Error parsing CSV file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Process Income Limits CSV
 * Expected format: State, County/MSA, 1-Person, 2-Person, 3-Person, etc.
 */
function processIncomeLimits(incomeLimitsData) {
  const limitsByArea = {};
  
  incomeLimitsData.forEach(row => {
    // Adjust these column names based on actual HUD CSV structure
    const areaKey = `${row.State || row['State'] || ''}_${row['County/MSA'] || row.County || row.MSA || ''}`;
    const state = row.State || row['State'] || '';
    const county = row['County/MSA'] || row.County || row.MSA || '';
    
    if (!areaKey || areaKey === '_') return;
    
    limitsByArea[areaKey] = {
      state: state,
      county: county,
      msa: row.MSA || row['MSA Name'] || '',
      limits: {
        1: {
          '30': parseInt(row['1-Person 30%'] || row['Extremely Low 1'] || '0'),
          '50': parseInt(row['1-Person 50%'] || row['Very Low 1'] || '0'),
          '80': parseInt(row['1-Person 80%'] || row['Low 1'] || '0'),
          '100': parseInt(row['1-Person 100%'] || row['AMI 1'] || '0'),
          '120': parseInt(row['1-Person 120%'] || row['Moderate 1'] || '0')
        },
        2: {
          '30': parseInt(row['2-Person 30%'] || row['Extremely Low 2'] || '0'),
          '50': parseInt(row['2-Person 50%'] || row['Very Low 2'] || '0'),
          '80': parseInt(row['2-Person 80%'] || row['Low 2'] || '0'),
          '100': parseInt(row['2-Person 100%'] || row['AMI 2'] || '0'),
          '120': parseInt(row['2-Person 120%'] || row['Moderate 2'] || '0')
        },
        // Add more family sizes as needed (3-8)
      }
    };
  });
  
  return limitsByArea;
}

/**
 * Process ZIP Code Crosswalk
 * Maps ZIP codes to counties/MSAs
 */
function processZipCodeCrosswalk(crosswalkData) {
  const zipToArea = {};
  
  crosswalkData.forEach(row => {
    const zip = row.ZIP || row['ZIP Code'] || row.ZIPCODE || '';
    const countyFips = row['COUNTY'] || row['County FIPS'] || '';
    const state = row['STATE'] || row['State'] || '';
    const countyName = row['COUNTYNAME'] || row['County Name'] || '';
    const msaCode = row['MSA'] || row['MSA Code'] || '';
    
    if (!zip || zip.length !== 5) return;
    
    if (!zipToArea[zip]) {
      zipToArea[zip] = [];
    }
    
    zipToArea[zip].push({
      countyFips,
      state,
      countyName,
      msaCode
    });
  });
  
  return zipToArea;
}

/**
 * Merge data to create final JSON structure
 */
function mergeData(incomeLimits, zipToArea) {
  const result = {};
  
  Object.keys(zipToArea).forEach(zip => {
    const areas = zipToArea[zip];
    // Use the first/most common area for this zip code
    const primaryArea = areas[0];
    const areaKey = `${primaryArea.state}_${primaryArea.countyName}`;
    
    if (incomeLimits[areaKey]) {
      result[zip] = {
        county: primaryArea.countyName,
        msa: '', // Can be enhanced with MSA name lookup
        state: primaryArea.state,
        effectiveDate: CONFIG.effectiveDate,
        ...incomeLimits[areaKey].limits
      };
    }
  });
  
  return result;
}

/**
 * Main processing function
 */
function main() {
  console.log('🚀 Starting AMI data processing...\n');
  
  // Check if input files exist
  if (!fs.existsSync(CONFIG.incomeLimitsCsv)) {
    console.error(`❌ Error: Income Limits CSV not found at: ${CONFIG.incomeLimitsCsv}`);
    console.error('   Please download from: https://www.huduser.gov/portal/datasets/il.html');
    process.exit(1);
  }
  
  if (!fs.existsSync(CONFIG.zipCodeCrosswalk)) {
    console.error(`❌ Error: ZIP Code Crosswalk CSV not found at: ${CONFIG.zipCodeCrosswalk}`);
    console.error('   Please download from: https://www.huduser.gov/portal/datasets/usps_crosswalk.html');
    process.exit(1);
  }
  
  console.log('📖 Reading CSV files...');
  const incomeLimitsData = parseCSV(CONFIG.incomeLimitsCsv);
  const crosswalkData = parseCSV(CONFIG.zipCodeCrosswalk);
  
  console.log(`   ✓ Income Limits: ${incomeLimitsData.length} rows`);
  console.log(`   ✓ ZIP Code Crosswalk: ${crosswalkData.length} rows\n`);
  
  console.log('🔄 Processing data...');
  const incomeLimits = processIncomeLimits(incomeLimitsData);
  const zipToArea = processZipCodeCrosswalk(crosswalkData);
  
  console.log(`   ✓ Processed ${Object.keys(incomeLimits).length} geographic areas`);
  console.log(`   ✓ Processed ${Object.keys(zipToArea).length} ZIP codes\n`);
  
  console.log('🔗 Merging data...');
  const mergedData = mergeData(incomeLimits, zipToArea);
  
  console.log(`   ✓ Created ${Object.keys(mergedData).length} ZIP code entries\n`);
  
  // Ensure output directory exists
  const outputDir = path.dirname(CONFIG.outputJson);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write output file
  console.log(`💾 Writing output to: ${CONFIG.outputJson}`);
  fs.writeFileSync(
    CONFIG.outputJson,
    JSON.stringify(mergedData, null, 2),
    'utf-8'
  );
  
  console.log('\n✅ Processing complete!');
  console.log(`   Output: ${Object.keys(mergedData).length} ZIP codes with AMI data`);
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main, parseCSV, processIncomeLimits, processZipCodeCrosswalk, mergeData };


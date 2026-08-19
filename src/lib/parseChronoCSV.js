// Defensive chronograph CSV parser — Section 5C of the master doc.
// Detects Garmin ShotView / LabRadar exports by a signature string in the
// file, or falls back to a generic velocity-column scan. Real Garmin/
// LabRadar export layouts vary by firmware and export settings — treat
// the brand-specific paths here as a starting heuristic to refine against
// real exported files, not a verified spec.

const VELOCITY_HEADER_ALIASES = ['velocity', 'speed', 'fps'];

// Minimal CSV line split: handles plain comma-separated values and
// simple quoted fields. Chrono exports are almost always this simple, so
// a full RFC 4180 parser is more complexity than this needs.
function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

function findVelocityColumn(row) {
  const lower = row.map((cell) => cell.toLowerCase());
  for (const alias of VELOCITY_HEADER_ALIASES) {
    const idx = lower.findIndex((cell) => cell.includes(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseRowsForVelocity(lines) {
  const rows = lines.map(splitCsvLine).filter((r) => r.length > 0 && r.some((c) => c !== ''));
  if (!rows.length) throw new Error('No data rows found.');

  const headerIdx = rows.findIndex((r) => findVelocityColumn(r) !== -1);
  let velocityCol;
  let dataRows;

  if (headerIdx !== -1) {
    velocityCol = findVelocityColumn(rows[headerIdx]);
    dataRows = rows.slice(headerIdx + 1);
  } else {
    // No recognizable header — assume the first column is velocity.
    velocityCol = 0;
    dataRows = rows;
  }

  const shots = [];
  for (const row of dataRows) {
    const raw = row[velocityCol];
    if (raw == null) continue;
    const num = Number.parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
    // Sanity range: plausible projectile velocities in FPS. Filters out
    // stray totals/averages/blank cells that aren't a real shot reading.
    if (Number.isFinite(num) && num > 200 && num < 6000) {
      shots.push(Math.round(num));
    }
  }

  if (!shots.length) throw new Error('No valid velocity readings found in this file.');
  return shots;
}

function parseGarminCSV(text) {
  return { success: true, source: 'garmin', shots: parseRowsForVelocity(text.split(/\r?\n/)) };
}

function parseLabRadarCSV(text) {
  return { success: true, source: 'labradar', shots: parseRowsForVelocity(text.split(/\r?\n/)) };
}

function parseGenericCSV(text) {
  return { success: true, source: 'generic', shots: parseRowsForVelocity(text.split(/\r?\n/)) };
}

export function parseChronoCSV(fileText) {
  try {
    const cleanText = fileText.replace(/^\uFEFF/, '').trim();
    if (!cleanText) throw new Error('Empty file content.');

    if (cleanText.includes('ShotView') || cleanText.includes('Garmin')) {
      return parseGarminCSV(cleanText);
    } else if (cleanText.includes('LabRadar') || cleanText.includes('SR00')) {
      return parseLabRadarCSV(cleanText);
    } else {
      return parseGenericCSV(cleanText);
    }
  } catch (err) {
    console.error('CSV parsing error:', err);
    return {
      success: false,
      error:
        err.message ||
        'Unrecognized file format. Please check your CSV layout or enter velocities manually.',
    };
  }
}

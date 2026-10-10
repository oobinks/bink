import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_SETTINGS, getPublicSettings, getSetting, setSetting } from '../settings.js';
import { runBackup, backupFolder, streamExport } from '../backup.js';
import { loadSampleData, clearSampleData, hasSampleData } from '../sample-data.js';

const router = Router();

// Cloud-synced folders found on this Mac, offered as one-tap backup locations
// so backups also end up off the laptop.
function suggestedFolders() {
  const home = os.homedir();
  const found = [];
  const icloud = path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs');
  if (fs.existsSync(icloud)) found.push({ label: 'iCloud Drive', path: path.join(icloud, 'ctrinn-backups') });
  const cloud = path.join(home, 'Library/CloudStorage');
  if (fs.existsSync(cloud)) {
    for (const name of fs.readdirSync(cloud)) {
      if (name.startsWith('GoogleDrive-')) {
        found.push({ label: 'Google Drive', path: path.join(cloud, name, 'My Drive', 'ctrinn-backups') });
      } else if (name.startsWith('OneDrive')) {
        found.push({ label: 'OneDrive', path: path.join(cloud, name, 'ctrinn-backups') });
      }
    }
  }
  return found;
}

router.get('/', (req, res) => {
  res.json({
    ...getPublicSettings(),
    meta: { backupFolder: backupFolder(), hasSampleData: hasSampleData(), suggestedFolders: suggestedFolders() },
  });
});

// Only known sections and fields can be saved, so typos can't break anything.
const READ_ONLY = { backups: ['lastBackupAt', 'lastBackupError'] };

function clean(section, input) {
  const defaults = DEFAULT_SETTINGS[section];
  const current = getSetting(section);
  const out = { ...current };
  for (const [k, def] of Object.entries(defaults)) {
    if (!(k in input) || READ_ONLY[section]?.includes(k)) continue;
    const v = input[k];
    if (Array.isArray(def)) {
      if (!Array.isArray(v)) throw new Error(`${k} must be a list`);
      out[k] = v.map((x) => String(x).trim()).filter(Boolean).slice(0, 50);
    } else if (typeof def === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a positive number`);
      out[k] = Math.round(n);
    } else if (typeof def === 'boolean') {
      out[k] = Boolean(v);
    } else {
      out[k] = String(v ?? '').trim().slice(0, 1000);
    }
  }
  return out;
}

router.put('/:section', (req, res) => {
  const { section } = req.params;
  if (!(section in DEFAULT_SETTINGS)) return res.status(404).json({ error: 'Unknown section' });
  try {
    const value = clean(section, req.body || {});
    if (section === 'backups' && value.folder) {
      if (!path.isAbsolute(value.folder)) throw new Error('Use a full folder path, e.g. /Users/you/Google Drive/Backups');
      fs.mkdirSync(value.folder, { recursive: true });
    }
    setSetting(section, value);
    res.json(value);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/backup-now', async (req, res) => {
  const result = await runBackup();
  res.status(result.ok ? 200 : 500).json(result);
});

router.get('/export', (req, res) => streamExport(res));

router.post('/sample-data', (req, res) => {
  if (req.body?.action === 'clear') clearSampleData();
  else if (!hasSampleData()) loadSampleData();
  res.json({ hasSampleData: hasSampleData() });
});

export default router;

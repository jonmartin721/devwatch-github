#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Validating Chrome extension structure...\n');

const requiredFiles = [
  'manifest.json',
  'background.js',
  'popup/popup.html',
  'popup/popup.js',
  'popup/popup.css',
  'options/options.html',
  'options/options.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

const requiredDirs = [
  'popup',
  'options',
  'icons'
];

let errors = 0;

// Check directories
console.log('Checking directories...');
const rootDir = path.join(__dirname, '..');
requiredDirs.forEach(dir => {
  const dirPath = path.join(rootDir, dir);
  if (!fs.existsSync(dirPath)) {
    console.error(`✗ Missing directory: ${dir}`);
    errors++;
  } else {
    console.log(`✓ ${dir}/`);
  }
});

console.log('\nChecking required files...');
requiredFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`✗ Missing file: ${file}`);
    errors++;
  } else {
    console.log(`✓ ${file}`);
  }
});

// Validate manifest.json
console.log('\nValidating manifest.json...');
try {
  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);

  // Check required manifest fields
  const requiredFields = ['manifest_version', 'name', 'version', 'description'];
  requiredFields.forEach(field => {
    if (!manifest[field]) {
      console.error(`✗ Missing manifest field: ${field}`);
      errors++;
    } else {
      console.log(`✓ manifest.${field}: ${manifest[field]}`);
    }
  });

  // Validate manifest version
  if (manifest.manifest_version !== 3) {
    console.error(`✗ Expected manifest_version 3, got ${manifest.manifest_version}`);
    errors++;
  }

  // Check for background service worker
  if (!manifest.background || !manifest.background.service_worker) {
    console.error('✗ Missing background service_worker');
    errors++;
  }

  // Check for action (popup)
  if (!manifest.action) {
    console.error('✗ Missing action configuration');
    errors++;
  }

} catch (error) {
  console.error(`✗ Error parsing manifest.json: ${error.message}`);
  errors++;
}

// Summary
console.log('\n' + '='.repeat(50));
if (errors === 0) {
  console.log('✓ Extension structure is valid!');
  console.log('✓ Ready for packaging');
  process.exit(0);
} else {
  console.error(`✗ Found ${errors} error(s)`);
  console.error('✗ Fix the errors before packaging');
  process.exit(1);
}

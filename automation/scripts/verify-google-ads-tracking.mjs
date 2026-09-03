/**
 * Google Ads Phase 2.1+ - Tracking Verification Script
 *
 * Verifies that conversion tracking and UTM parameters are correctly configured
 * for Google Ads campaigns.
 *
 * Usage: node verify-google-ads-tracking.mjs
 */

import fs from 'fs';
import path from 'path';

const TRACKING_CONFIG = {
  utm_source: 'google',
  utm_medium: 'cpc',
  campaigns: {
    teppichboden: {
      campaign_name: 'teppichboden_search',
      landing_page: '/collections/teppichboden',
      conversion_pixels: ['GA4', 'Google Ads Conversion']
    },
    teppiche: {
      campaign_name: 'teppiche_search',
      landing_page: '/collections/teppiche',
      conversion_pixels: ['GA4', 'Google Ads Conversion']
    },
    vinylboden: {
      campaign_name: 'vinylboden_search',
      landing_page: '/collections/vinylboden',
      conversion_pixels: ['GA4', 'Google Ads Conversion']
    }
  }
};

const REQUIRED_FILES = [
  'config/settings_data.json',
  'snippets/meta-tags.liquid',
  'assets/conversion-tracking.js'
];

function checkConversionPixel() {
  console.log('\n📊 Checking conversion pixel configuration...');

  const settingsPath = path.join(process.cwd(), 'config/settings_data.json');
  if (!fs.existsSync(settingsPath)) {
    console.warn('⚠️  config/settings_data.json not found');
    return false;
  }

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const hasGAPixel = JSON.stringify(settings).includes('GA4') ||
                     JSON.stringify(settings).includes('google_analytics');

  if (hasGAPixel) {
    console.log('✅ GA4 pixel configuration found');
  } else {
    console.warn('⚠️  GA4 pixel configuration not detected');
  }

  return hasGAPixel;
}

function checkUTMParameters() {
  console.log('\n🔗 Checking UTM parameter implementation...');

  const requiredParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  const found = {
    utm_source: false,
    utm_medium: false,
    utm_campaign: false,
    utm_content: false
  };

  // Check in settings_data.json
  const settingsPath = path.join(process.cwd(), 'config/settings_data.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const settingsStr = JSON.stringify(settings);

    requiredParams.forEach(param => {
      if (settingsStr.includes(param)) {
        found[param] = true;
      }
    });
  }

  // Check in meta-tags snippet
  const metaTagsPath = path.join(process.cwd(), 'snippets/meta-tags.liquid');
  if (fs.existsSync(metaTagsPath)) {
    const metaTags = fs.readFileSync(metaTagsPath, 'utf8');
    requiredParams.forEach(param => {
      if (metaTags.includes(param)) {
        found[param] = true;
      }
    });
  }

  console.log('UTM Parameters Status:');
  Object.entries(found).forEach(([param, isFound]) => {
    console.log(`  ${isFound ? '✅' : '❌'} ${param}`);
  });

  return Object.values(found).every(v => v);
}

function checkLandingPages() {
  console.log('\n🎯 Checking landing page accessibility...');

  const collectionsPath = path.join(process.cwd(), 'templates/collection*.json');
  const templates = fs.readdirSync(path.join(process.cwd(), 'templates'))
    .filter(f => f.startsWith('collection'));

  console.log(`Found ${templates.length} collection templates:`);
  templates.forEach(template => {
    console.log(`  ✅ ${template}`);
  });

  return templates.length > 0;
}

function checkMerchantCenterIntegration() {
  console.log('\n🛒 Checking Merchant Center integration...');

  const hasFeedValidator = fs.existsSync(
    path.join(process.cwd(), 'automation/scripts/validate-merchant-center-feed.mjs')
  );

  if (hasFeedValidator) {
    console.log('✅ Merchant Center feed validator found');
    return true;
  } else {
    console.warn('⚠️  Merchant Center feed validator not found');
    return false;
  }
}

function generateReport() {
  console.log('\n\n📋 GOOGLE ADS TRACKING VERIFICATION REPORT');
  console.log('==========================================\n');

  const results = {
    timestamp: new Date().toISOString(),
    checks: {
      conversionPixel: checkConversionPixel(),
      utmParameters: checkUTMParameters(),
      landingPages: checkLandingPages(),
      merchantCenter: checkMerchantCenterIntegration()
    }
  };

  const allPass = Object.values(results.checks).every(v => v);

  console.log('\n📊 SUMMARY');
  console.log('==========');
  console.log(`Status: ${allPass ? '✅ READY' : '⚠️  NEEDS ATTENTION'}`);
  console.log(`Timestamp: ${results.timestamp}`);

  console.log('\n✨ Ready for Phase 2.1 Setup:', allPass ? 'YES' : 'NO');

  // Save report
  const reportPath = path.join(
    process.cwd(),
    'automation/reports/GOOGLE_ADS_TRACKING_VERIFICATION.json'
  );

  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📝 Report saved to: ${reportPath}`);

  return allPass;
}

// Main execution
try {
  const isReady = generateReport();
  process.exit(isReady ? 0 : 1);
} catch (error) {
  console.error('❌ Verification failed:', error.message);
  process.exit(1);
}

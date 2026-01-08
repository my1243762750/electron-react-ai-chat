// CommonJS module syntax for electron-builder
module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  
  // Check if environment variables are set
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD || process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !appleTeamId) {
    console.warn('⚠️  Skipping notarization: APPLE_ID, APPLE_ID_PASSWORD/APPLE_APP_SPECIFIC_PASSWORD or APPLE_TEAM_ID not set');
    console.warn('   应用已签名，但未进行公证。用户可能需要手动允许运行。');
    return;
  }

  console.log(`📦 Notarizing ${appName}...`);
  console.log(`   App Path: ${appPath}`);
  console.log(`   Apple ID: ${appleId}`);
  console.log(`   Team ID: ${appleTeamId}`);

  try {
    // Use require instead of dynamic import for better compatibility
    const { notarize } = require('@electron/notarize');
    
    await notarize({
      tool: 'altool', // Use altool for better compatibility
      appBundleId: 'com.trae.ai.assistant',
      appPath: appPath,
      appleId: appleId,
      appleIdPassword: appleIdPassword,
      teamId: appleTeamId,
    });

    console.log(`✅ Done notarizing ${appName}`);
  } catch (error) {
    console.error('❌ Notarization failed:', error.message);
    console.error('   Full error:', error);
    // Don't throw to allow build to complete
    console.warn('   Continuing build without notarization...');
  }
};

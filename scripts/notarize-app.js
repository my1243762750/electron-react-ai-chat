#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 读取环境变量
require('dotenv').config();

const APP_BUNDLE_ID = 'com.trae.ai.assistant';
const PRODUCT_NAME = 'AI Assistant';
const VERSION = require('../package.json').version;

// 获取最新打包的应用路径
const getLatestAppPath = () => {
  const distDir = path.join(__dirname, '../dist');
  const appDirs = fs.readdirSync(distDir).filter(dir => dir.startsWith('mac-'));
  if (appDirs.length === 0) {
    throw new Error('No mac app directory found in dist');
  }
  return path.join(distDir, appDirs[0], `${PRODUCT_NAME}.app`);
};

// 公证应用
const notarizeApp = (appPath) => {
  console.log('📦 Notarizing app...');
  
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.error('❌ Missing environment variables for notarization:');
    console.error('   - APPLE_ID');
    console.error('   - APPLE_APP_SPECIFIC_PASSWORD');
    console.error('   - APPLE_TEAM_ID');
    return false;
  }
  
  try {
    // 创建 ZIP 文件
    const zipPath = path.join(__dirname, '../dist', `${PRODUCT_NAME}-${VERSION}-arm64-notarize.zip`);
    console.log(`   Creating ZIP file: ${zipPath}`);
    execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' });
    
    // 提交公证
    console.log(`   Submitting for notarization...`);
    execSync(
      `xcrun notarytool submit "${zipPath}" --apple-id "${APPLE_ID}" --password "${APPLE_APP_SPECIFIC_PASSWORD}" --team-id "${APPLE_TEAM_ID}" --wait`,
      { stdio: 'inherit' }
    );
    
    // 装订公证结果
    console.log(`   Stapling notarization result...`);
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });
    
    // 验证装订结果
    console.log(`   Validating staple...`);
    execSync(`xcrun stapler validate "${appPath}"`, { stdio: 'inherit' });
    
    // 删除临时 ZIP 文件
    fs.unlinkSync(zipPath);
    console.log(`   Deleted temporary ZIP file`);
    
    console.log('✅ App notarized successfully!');
    return true;
  } catch (error) {
    console.error('❌ Notarization failed:', error.message);
    return false;
  }
};

// 主函数
const main = () => {
  try {
    const appPath = getLatestAppPath();
    console.log(`📱 App path: ${appPath}`);
    
    notarizeApp(appPath);
  } catch (error) {
    console.error('❌ Notarization script failed:', error.message);
    process.exit(1);
  }
};

main();

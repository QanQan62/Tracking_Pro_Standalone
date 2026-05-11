import { syncOrdersWithMasterData } from './src/lib/trackingActions';

async function main() {
  await syncOrdersWithMasterData();
  console.log('Sync finished');
}

main().catch(console.error);

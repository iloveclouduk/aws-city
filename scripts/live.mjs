// Real mode: the AWS City server on this computer (your AWS account + Claude on Bedrock) + the extension wired to it.
// It's `npm start`'s real-AWS mode with no questions: the same checks (packages, AWS sign-in, Claude on Bedrock, the
// browser download, a free port), the same panel and keys. Only Node built-ins here, so it runs on a fresh clone.
// npm run live [-- --browser cft|chrome|edge|brave|firefox|safari] [--profile <aws profile>] [--region <region>]
import './launcher/require-node.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`npm run live [-- options]   AWS City against real AWS: the local server + the extension wired to it

  --browser <id>    cft | chrome | edge | brave | firefox | safari   (default: last time's, else cft: the AWS City browser)
  --profile <name>  AWS profile (default: the one that worked last time, then AWS_CITY_PROFILE, aws-city, workshop, default)
  --region <name>   Bedrock + AWS region for the server (default: last time's, else us-west-2)
  --rebuild         build the extension even if nothing changed

It checks your AWS sign-in and Claude on Bedrock, downloads the AWS City browser if needed, checks the port (8787,
or PORT), builds, starts the server and opens the city. Not signed in yet? It offers the ways to sign in.
The same as: npm start -- --live`);
  process.exit(0);
}
if (argv.includes('--demo')) {
  console.error('\n✗ npm run live is real AWS; for the demo run  npm start -- --demo\n');
  process.exit(1);
}
process.argv = [process.argv[0], process.argv[1], '--live', ...argv.filter((a) => a !== '--live')];
const { boot } = await import('./launcher/boot.mjs');
await boot();

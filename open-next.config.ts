// Cloudflare adapter config. The @opennextjs/cloudflare dependency is only needed on the
// Cloudflare path (bunx opennextjs-cloudflare build && bunx wrangler deploy).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});

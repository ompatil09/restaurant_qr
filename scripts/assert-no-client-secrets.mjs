import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const dist = path.resolve("dist");
const files = [];

const walk = async (directory) => {
  for (const name of await readdir(directory)) {
    const file = path.join(directory, name);
    if ((await stat(file)).isDirectory()) await walk(file);
    else if (/\.(?:html|js|css|json|map)$/i.test(name)) files.push(file);
  }
};

await walk(dist);
const forbidden = [
  { name: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: "Stripe secret key", pattern: /sk_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: "private API token", pattern: /(?:service_role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["'][A-Za-z0-9._-]{16,}/i },
];

const findings = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) findings.push(`${rule.name} in ${path.relative(dist, file)}`);
  }

  for (const token of content.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      const claims = JSON.parse(Buffer.from(token[0].split(".")[1], "base64url").toString("utf8"));
      if (claims?.role === "service_role") {
        findings.push(`Supabase service-role JWT in ${path.relative(dist, file)}`);
      }
    } catch {
      // Ignore non-JWT strings that only resemble a token.
    }
  }
}

if (findings.length) {
  throw new Error(`Client secret scan failed:\n${[...new Set(findings)].join("\n")}`);
}

console.log(`Client secret scan passed (${files.length} bundled files checked).`);

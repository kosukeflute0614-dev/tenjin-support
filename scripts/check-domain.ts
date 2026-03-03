/**
 * Resend ドメイン認証状態チェックスクリプト
 *
 * 使い方:
 *   RESEND_API_KEY=re_xxx npx tsx scripts/check-domain.ts
 */

const API_KEY = process.env.RESEND_API_KEY;

if (!API_KEY) {
  console.error("ERROR: RESEND_API_KEY environment variable is not set.");
  console.error("Usage: RESEND_API_KEY=re_xxx npx tsx scripts/check-domain.ts");
  process.exit(1);
}

interface DomainRecord {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
}

interface Domain {
  id: string;
  name: string;
  status: string;
  created_at: string;
  region: string;
  records: DomainRecord[];
}

interface DomainsResponse {
  data: Domain[];
}

async function checkDomains() {
  console.log("=== Resend Domain Authentication Check ===\n");

  // 1. Fetch all domains
  const res = await fetch("https://api.resend.com/domains", {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`API Error (${res.status}): ${errorText}`);
    process.exit(1);
  }

  const body: DomainsResponse = await res.json();
  const domains = body.data;

  if (!domains || domains.length === 0) {
    console.log("No domains found in this Resend account.");
    console.log(
      "You need to add tenjin-support.com in the Resend dashboard first."
    );
    return;
  }

  console.log(`Found ${domains.length} domain(s):\n`);

  for (const domain of domains) {
    console.log(`--- Domain: ${domain.name} ---`);
    console.log(`  ID:         ${domain.id}`);
    console.log(`  Status:     ${domain.status}`);
    console.log(`  Region:     ${domain.region}`);
    console.log(`  Created:    ${domain.created_at}`);

    if (domain.status !== "verified") {
      console.log(
        `\n  *** WARNING: Domain is NOT verified (status: ${domain.status}) ***`
      );
      console.log(
        "  Emails sent from this domain may be silently dropped or go to spam.\n"
      );
    } else {
      console.log("  Domain is verified.\n");
    }

    // Show DNS records and their status
    if (domain.records && domain.records.length > 0) {
      console.log("  DNS Records:");
      for (const rec of domain.records) {
        const icon = rec.status === "verified" ? "[OK]" : "[MISSING]";
        console.log(`    ${icon} ${rec.record || rec.type}`);
        console.log(`        Type:   ${rec.type}`);
        console.log(`        Name:   ${rec.name}`);
        console.log(`        Value:  ${rec.value}`);
        console.log(`        TTL:    ${rec.ttl}`);
        console.log(`        Status: ${rec.status}`);
        if (rec.priority !== undefined) {
          console.log(`        Priority: ${rec.priority}`);
        }
        console.log();
      }

      // Summary
      const verified = domain.records.filter(
        (r) => r.status === "verified"
      ).length;
      const total = domain.records.length;
      console.log(
        `  Record Summary: ${verified}/${total} verified`
      );

      // Check for specific record types
      const spf = domain.records.find(
        (r) =>
          r.record === "SPF" ||
          (r.type === "TXT" && r.value?.includes("spf"))
      );
      const dkim = domain.records.find(
        (r) =>
          r.record === "DKIM" ||
          (r.type === "TXT" && r.name?.includes("._domainkey"))
      );
      const dmarc = domain.records.find(
        (r) =>
          r.record === "DMARC" ||
          (r.type === "TXT" && r.name?.includes("_dmarc"))
      );
      const mx = domain.records.find(
        (r) => r.record === "MX" || r.type === "MX"
      );

      console.log("\n  Authentication Summary:");
      console.log(
        `    SPF:   ${spf ? spf.status : "not configured"}`
      );
      console.log(
        `    DKIM:  ${dkim ? dkim.status : "not configured"}`
      );
      console.log(
        `    DMARC: ${dmarc ? dmarc.status : "not configured"}`
      );
      console.log(
        `    MX:    ${mx ? mx.status : "not configured"}`
      );
    }

    console.log("\n");
  }

  // Check if tenjin-support.com is registered
  const targetDomain = domains.find((d) => d.name === "tenjin-support.com");
  if (!targetDomain) {
    console.log(
      '*** tenjin-support.com is NOT found in this Resend account. ***'
    );
    console.log(
      "Add it at: https://resend.com/domains"
    );
  }
}

checkDomains().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

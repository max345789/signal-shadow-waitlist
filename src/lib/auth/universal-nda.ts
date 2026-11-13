import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";

export interface UniversalNdaRecord {
  userId: string;
  email: string;
  signerName: string;
  signerTitle?: string;
  entityName?: string;
  signedAt: string;
  version: string;
  ipAddress?: string;
}

const globalForUniversalNda = globalThis as unknown as {
  __trustMarketplaceUniversalNdaStore?: Map<string, UniversalNdaRecord>;
};

function getLocalNdaStore(): Map<string, UniversalNdaRecord> {
  if (!globalForUniversalNda.__trustMarketplaceUniversalNdaStore) {
    globalForUniversalNda.__trustMarketplaceUniversalNdaStore = new Map();
  }
  return globalForUniversalNda.__trustMarketplaceUniversalNdaStore;
}

export const UNIVERSAL_NDA_VERSION = "2026.1";

export const UNIVERSAL_NDA_TERMS = `
BATON MASTER BUYER CONFIDENTIALITY & NON-DISCLOSURE AGREEMENT (NDA)
Version 2026.1 • Effective Date: Electronic Signature Acceptance

1. PURPOSE & SCOPE
This Universal Master Non-Disclosure Agreement ("Agreement") governs the disclosure of confidential, proprietary, operational, financial, and strategic information regarding prospective businesses, sellers, cap tables, source code, and customers listed on or introduced through the Baton Platform ("Platform").

2. CONFIDENTIAL INFORMATION
Confidential Information includes, without limitation:
(a) Unmasked business legal names, domains, trademark registrations, and founder identities;
(b) Historical profit & loss statements, balance sheets, tax filings, unit economics, customer lists, and churn metrics;
(c) Proprietary source code architecture, supplier/vendor agreements, and employee lists.

3. OBLIGATIONS OF THE PROSPECTIVE BUYER
The Buyer agrees:
(a) To hold all Confidential Information in strict confidence and take all reasonable precautions to prevent unauthorized disclosure;
(b) To use such information solely for evaluating a potential purchase, merger, or asset acquisition;
(c) Not to contact the seller's employees, customers, or suppliers directly without express written permission inside the Baton Connect Room;
(d) Not to circumvent Baton or solicit sellers outside the platform to evade agreed transaction rules.

4. DURATION & GOVERNING LAW
This agreement remains in effect for a period of two (2) years from the date of electronic execution and shall be construed under the laws of India.
`;

export async function getUniversalNdaForUser(userId: string): Promise<UniversalNdaRecord | null> {
  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          updatedAt: true,
        },
      });

      // Check local store for timestamped agreement details
      const local = getLocalNdaStore().get(userId);
      if (local) return local;

      if (user) {
        return null;
      }
    } catch {
      // Fallback
    }
  }

  return getLocalNdaStore().get(userId) ?? null;
}

export async function signUniversalNdaForUser(input: {
  userId: string;
  email: string;
  signerName: string;
  signerTitle?: string;
  entityName?: string;
  ipAddress?: string;
}): Promise<UniversalNdaRecord> {
  const record: UniversalNdaRecord = {
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    signerName: input.signerName.trim(),
    signerTitle: input.signerTitle?.trim(),
    entityName: input.entityName?.trim(),
    signedAt: new Date().toISOString(),
    version: UNIVERSAL_NDA_VERSION,
    ipAddress: input.ipAddress,
  };

  getLocalNdaStore().set(input.userId, record);
  return record;
}
